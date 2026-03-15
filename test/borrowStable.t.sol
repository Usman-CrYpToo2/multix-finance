// // SPDX-License-Identifier: UNLICENSED
// pragma solidity 0.8.24;

// import {Test} from "forge-std/Test.sol";
// import {console} from "forge-std/console.sol";

// import {BorrowStable} from "../src/BorrowStable.sol";
// import {IBorrowStable} from "../src/interfaces/IBorrowStable.sol";
// import {Stablecoin} from "../src/token/Stablecoin.sol";
// import {HybridFiatPriceFeed} from "../src/oracle/HybridFiatPriceFeed.sol";
// import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
// import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// contract MockWETH is ERC20 {
//     constructor() ERC20("Mock WETH", "WETH") {}

//     function mint(address to, uint256 amount) external {
//         _mint(to, amount);
//     }
// }

// contract BorrowStableTest is Test {
//     BorrowStable internal borrowStable;
//     Stablecoin internal stable;
//     HybridFiatPriceFeed internal oracle;
//     MockWETH internal weth;

//     address internal user = address(0x1234);

//     uint16 internal constant SAFE_LTV_BP = 7000; // 70%
//     uint16 internal constant LIQ_LTV_BP = 7500; // 75%
//     uint16 internal constant LIQ_PENALTY_BP = 500; // 5%
//     uint16 internal constant BORROW_APR_BP = 1000; // 10% APR

//     function setUp() public {
//         // Deploy mock collateral (WETH)
//         weth = new MockWETH();

//         // Deploy oracle with this test as the bot
//         oracle = new HybridFiatPriceFeed(address(this), address(this));

//         // Deploy stablecoin; assign this test as owner, protocol set temporarily
//         stable = new Stablecoin(address(this), address(this), "GB", "GBP");

//         // Build constructor params
//         IBorrowStable.InitailConsParams memory params;
//         params.StableCoin = address(stable);
//         params.collateralAsset = address(weth);
//         params.collatToFiatOracle = address(oracle);
//         params.owner = address(this);
//         params.minBorrowAmount = 10000;
//         params.minCollatAmount = 10000;
//         params.safeLtvBp = SAFE_LTV_BP;
//         params.liquidationLtvBp = LIQ_LTV_BP;
//         params.liquidationPenaltyBp = LIQ_PENALTY_BP;
//         params.borrowRatePerYearBp = BORROW_APR_BP;
//         params.collatTofiatConversion = 1e8; // 1 unit of fiat per oracle price tick

//         // Deploy BorrowStable
//         borrowStable = new BorrowStable(params);

//         // Wire Stablecoin so that only BorrowStable can mint/burn
//         stable.setMintAndBurnProtocol(address(borrowStable));

//         // Oracle admin setup:
//         // - whitelist BorrowStable as a pool
//         oracle.setPoolWhitelist(address(borrowStable), true);

//         // Set ETH/USD price to 2000e8 and GBP FX rate to 1.3e8,
//         // mirroring the oracle unit tests.
//         uint256 ethPrice = 2000 * 1e8;
//         uint256 gbpFxRate = 13e7; // 1.3e8
//         oracle.updateEthPrice(ethPrice);
//         oracle.updateFxRate(address(borrowStable), gbpFxRate);

//         // Fund the user with collateral
//         weth.mint(user, 100 ether);
//     }

//     function test_deposit_increases_totalCollateral_and_contractBalance() public {
//         uint256 depositAmount = 10 ether;

//         vm.startPrank(user);
//         IERC20(address(weth)).approve(address(borrowStable), depositAmount);
//         borrowStable.depositCollateral(user, depositAmount);
//         vm.stopPrank();

//         (uint256 totalCollateral,,) = borrowStable.aggregateState();

//         assertEq(totalCollateral, depositAmount, "totalCollateral should equal deposit");
//         assertEq(weth.balanceOf(address(borrowStable)), depositAmount, "contract WETH balance should equal deposit");
//         assertEq(weth.balanceOf(user), 90 ether, "user WETH balance should decrease by deposit");
//     }

//     function test_withdraw_reduces_totalCollateral_and_returns_funds() public {
//         uint256 depositAmount = 10 ether;
//         uint256 withdrawAmount = 4 ether;

//         // First deposit
//         vm.startPrank(user);
//         IERC20(address(weth)).approve(address(borrowStable), depositAmount);
//         borrowStable.depositCollateral(user, depositAmount);

//         // Then withdraw a portion
//         borrowStable.withdrawCollateral(withdrawAmount);
//         vm.stopPrank();

//         (uint256 totalCollateral,,) = borrowStable.aggregateState();

//         assertEq(totalCollateral, depositAmount - withdrawAmount, "totalCollateral should be reduced");
//         assertEq(
//             weth.balanceOf(address(borrowStable)),
//             depositAmount - withdrawAmount,
//             "contract WETH balance should match remaining collateral"
//         );
//         assertEq(
//             weth.balanceOf(user),
//             100 ether - depositAmount + withdrawAmount,
//             "user WETH balance should reflect deposit and withdrawal"
//         );
//     }

//     function test_borrow_accrues_debt_and_withdraws_collateral() public {
//         // Configure oracle for this scenario:
//         // 1 ETH = 1000 USD (scaled 1e8)
//         // GBP price = 1 USD (so FX = 1e8)
//         uint256 ethPrice = 1000 * 1e8;
//         uint256 gbpFxRate = 1e8;
//         oracle.updateEthPrice(ethPrice);
//         oracle.updateFxRate(address(borrowStable), gbpFxRate);

//         // User deposits 1 ETH as collateral.
//         vm.startPrank(user);
//         IERC20(address(weth)).approve(address(borrowStable), 1 ether);
//         borrowStable.depositCollateral(user, 1 ether);

//         // Borrow 500 GBP (stablecoin has 18 decimals).
//         uint256 borrowAmount = 500e18;
//         borrowStable.borrowFiat(borrowAmount);
//         vm.stopPrank();

//         // User should receive 500 GBP stablecoins.
//         assertEq(stable.balanceOf(user), borrowAmount, "user should receive 500 GBP");

//         // Move time forward by one year and accrue debt.
//         uint256 start = borrowStable.lastAccrual();
//         vm.warp(start + 365 days);
//         oracle.updateEthPrice(ethPrice);
//         oracle.updateFxRate(address(borrowStable), gbpFxRate);

//         borrowStable.accureInterest();

//         (, uint256 totalDebtAfter,) = borrowStable.aggregateState();

//         console.log("Total debt after 1 year (wei):", totalDebtAfter);

//         // Withdraw a portion of the remaining collateral that should still be safe.
//         uint256 withdrawAmount = 214285714271668571 - 10000;

//         vm.startPrank(user);
//         borrowStable.withdrawCollateral(withdrawAmount);
//         vm.stopPrank();

//         // Check that some collateral remains locked and user received the withdrawn amount.
//         (uint256 totalCollateralRemaining,,) = borrowStable.aggregateState();

//         assertEq(
//             weth.balanceOf(user),
//             100 ether - 1 ether + withdrawAmount,
//             "user WETH balance should reflect deposit, borrow, and withdrawal"
//         );
//         assertEq(
//             weth.balanceOf(address(borrowStable)),
//             totalCollateralRemaining,
//             "contract WETH balance should equal remaining collateral"
//         );
//     }
// }
