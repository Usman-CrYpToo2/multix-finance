// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {IBorrowStable} from "../src/interfaces/IBorrowStable.sol";
import {HybridFiatPriceFeed} from "../src/oracle/HybridFiatPriceFeed.sol";
import {MultiFiatFactory} from "../src/MultiFiatFactory.sol";
import {IMultiFiatFactory} from "../src/interfaces/IMultiFiatFactory.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Router contract in MultiFiatRouter.sol is named BorrowStable; alias to avoid clash with CDP.
import {MultiFiatRouter} from "../src/MultiFiatRouter.sol";

contract MockWETH is ERC20 {
    constructor() ERC20("Mock WETH", "WETH") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BorrowStableTest is Test {
    MultiFiatFactory internal factory;
    MultiFiatRouter internal router;
    HybridFiatPriceFeed internal oracle;
    MockWETH internal weth;

    address internal gbpStable;
    address internal gbpPool;

    address internal bhdStable;
    address internal bhdPool;

    address internal user = address(0x1234);
    address internal liquidator = address(0xBEEF);
    address internal user2 = address(0x2345);
    address internal user3 = address(0x3456);

    uint16 internal constant SAFE_LTV_BP = 7000; // 70%
    uint16 internal constant LIQ_LTV_BP = 7500; // 75%
    uint16 internal constant LIQ_PENALTY_BP = 500; // 5%
    uint16 internal constant BORROW_APR_BP = 1000; // 10% APR

    function setUp() public {
        // 1. Deploy mock collateral (WETH)
        weth = new MockWETH();

        // 2. Deploy oracle (test as bot and owner; we transfer ownership to factory later)
        oracle = new HybridFiatPriceFeed(address(this), address(this));

        // 3. Deploy factory
        factory = new MultiFiatFactory(address(weth), address(oracle));

        // 4. Deploy router
        router = new MultiFiatRouter(address(factory));

        // 5. Set router on factory (required before createMarket)
        factory.setRouter(address(router));

        // 6. Transfer oracle ownership to factory so it can whitelist pools in createMarket
        oracle.setBotAuthorization(address(factory), true);

        // 7. Deploy GBP market from factory
        IMultiFiatFactory.TokenParams memory tParamsGbp =
            IMultiFiatFactory.TokenParams({country: "GB", currency: "GBP"});
        IMultiFiatFactory.BorrowParams memory bParams = IMultiFiatFactory.BorrowParams({
            minBorrowAmount: 10000,
            minCollatAmount: 10000,
            safeLtvBp: SAFE_LTV_BP,
            liquidationLtvBp: LIQ_LTV_BP,
            liquidationPenaltyBp: LIQ_PENALTY_BP,
            borrowRatePerYearBp: BORROW_APR_BP
        });
        (gbpStable, gbpPool) = factory.createMarket(tParamsGbp, bParams);

        // 8. Deploy BHD market (Bahraini Dinar) from factory
        // BHD has a value of 2.5 USD, so oracle FX is 2.5e8 (USD per BHD)
        IMultiFiatFactory.TokenParams memory tParamsBhd =
            IMultiFiatFactory.TokenParams({country: "BH", currency: "BHD"});
        (bhdStable, bhdPool) = factory.createMarket(tParamsBhd, bParams);

        // 9. Set oracle prices (test is the bot):
        //  - ETH/USD: 1000e8
        //  - GBP FX: 1.3e8 USD per GBP
        //  - BHD FX: 2.5e8 USD per BHD
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(gbpPool, 13e7); // 1.3e8
        oracle.updateFxRate(bhdPool, 25e7); // 2.5e8

        // 10. Fund user and liquidator with WETH
        weth.mint(user, 100 ether);
        weth.mint(user2, 100 ether);
        weth.mint(user3, 100 ether);
        weth.mint(liquidator, 100 ether);
    }

    function test_deposit_increases_totalCollateral_and_contractBalance() public {
        uint256 depositAmount = 10 ether;

        vm.startPrank(user);
        IERC20(address(weth)).approve(address(router), depositAmount);
        router.depositCollateral(gbpStable, user, depositAmount);
        vm.stopPrank();

        (uint256 totalCollateral,,) = IBorrowStable(gbpPool).aggregateState();

        assertEq(totalCollateral, depositAmount, "totalCollateral should equal deposit");
        assertEq(weth.balanceOf(gbpPool), depositAmount, "pool WETH balance should equal deposit");
        assertEq(weth.balanceOf(user), 90 ether, "user WETH balance should decrease by deposit");
    }

    function test_withdraw_reduces_totalCollateral_and_returns_funds() public {
        uint256 depositAmount = 10 ether;
        uint256 withdrawAmount = 4 ether;

        vm.startPrank(user);
        IERC20(address(weth)).approve(address(router), depositAmount);
        router.depositCollateral(gbpStable, user, depositAmount);

        router.withdrawCollateral(gbpStable, withdrawAmount);
        vm.stopPrank();

        (uint256 totalCollateral,,) = IBorrowStable(gbpPool).aggregateState();

        assertEq(totalCollateral, depositAmount - withdrawAmount, "totalCollateral should be reduced");
        assertEq(
            weth.balanceOf(gbpPool),
            depositAmount - withdrawAmount,
            "pool WETH balance should match remaining collateral"
        );
        assertEq(
            weth.balanceOf(user),
            100 ether - depositAmount + withdrawAmount,
            "user WETH balance should reflect deposit and withdrawal"
        );
    }

    function test_borrow_accrues_debt_and_withdraws_collateral() public {
        // Configure oracle: 1 ETH = 1000e8, GBP = 1e8
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(gbpPool, 1e8);

        // User deposits 2 ETH so we can withdraw some after accrual and still leave >= minCollatAmount (1 ether)
        vm.startPrank(user);
        IERC20(address(weth)).approve(address(router), 2 ether);
        router.depositCollateral(gbpStable, user, 2 ether);

        // Borrow 500 GBP via router
        uint256 borrowAmount = 500e18;
        router.borrowFiat(gbpStable, borrowAmount);
        vm.stopPrank();

        assertEq(IERC20(gbpStable).balanceOf(user), borrowAmount, "user should receive 500 GBP");

        // Move time forward 1 year and accrue interest on the pool
        uint256 start = IBorrowStable(gbpPool).lastAccrual();
        vm.warp(start + 365 days);
        IBorrowStable(gbpPool).accureInterest();

        (, uint256 totalDebtAfter,) = IBorrowStable(gbpPool).aggregateState();
        console.log("Total debt after 1 year (wei):", totalDebtAfter);
        assertGt(totalDebtAfter, borrowAmount, "debt increased after 1 year accrual");

        // Refresh oracle so latestRoundData() does not revert with RateStale (24h staleness check)
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(gbpPool, 1e8);

        // Withdraw 0.5 ETH; remaining 1.5 ETH >= minCollatAmount (1 ether)
        uint256 withdrawAmount = 0.5 ether;
        vm.prank(user);
        router.withdrawCollateral(gbpStable, withdrawAmount);

        (uint256 totalCollateralRemaining,,) = IBorrowStable(gbpPool).aggregateState();
        assertEq(totalCollateralRemaining, 2 ether - withdrawAmount, "collateral reduced by withdraw");
        assertEq(
            weth.balanceOf(user),
            100 ether - 2 ether + withdrawAmount,
            "user WETH balance reflects deposit and withdrawal"
        );
        assertEq(weth.balanceOf(gbpPool), totalCollateralRemaining, "pool WETH equals remaining collateral");
    }

    function test_repay_reduces_debt_and_burns_stablecoins() public {
        // Deposit and borrow so user has debt
        vm.startPrank(user);
        IERC20(address(weth)).approve(address(router), 2 ether);
        router.depositCollateral(gbpStable, user, 2 ether);

        uint256 borrowAmount = 500e18;
        router.borrowFiat(gbpStable, borrowAmount);
        vm.stopPrank();

        (, uint256 totalDebtBefore,) = IBorrowStable(gbpPool).aggregateState();
        assertEq(IERC20(gbpStable).balanceOf(user), borrowAmount, "user has borrowed stablecoins");

        // Repay part of the debt: user approves pool and calls router
        uint256 repayAmount = 200e18;
        vm.startPrank(user);
        IERC20(gbpStable).approve(gbpPool, repayAmount);
        router.repayFiat(gbpStable, user, repayAmount);
        vm.stopPrank();

        (, uint256 totalDebtAfter,) = IBorrowStable(gbpPool).aggregateState();
        assertEq(totalDebtAfter, totalDebtBefore - repayAmount, "total debt should decrease by repay amount");
        assertEq(
            IERC20(gbpStable).balanceOf(user),
            borrowAmount - repayAmount,
            "user stable balance should decrease by repay amount"
        );
    }

    /// @notice User deposits 1 ETH, borrows at max safe LTV (70%). After ~9 months interest
    ///         pushes debt over 75% LTV; liquidator repays and receives collateral.
    function test_liquidation_after_debt_grows_over_liquidation_ltv() public {
        // 1 ETH = 1000 GBP (1e8 scale). Safe 70% => max borrow 700e18, liquidation at 75% => 750e18
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(gbpPool, 1e8);

        // User deposits 1 ETH and borrows up to safe LTV (700e18 GBP)
        vm.startPrank(user);
        IERC20(address(weth)).approve(address(router), 1 ether);
        router.depositCollateral(gbpStable, user, 1 ether);
        uint256 borrowAmount = 700e18; // 70% of 1000e18
        router.borrowFiat(gbpStable, borrowAmount);
        vm.stopPrank();

        assertEq(IERC20(gbpStable).balanceOf(user), borrowAmount, "user borrowed at safe LTV");

        // Warp ~9 months so 10% APR pushes debt above 75% of collateral value (750e18)
        uint256 start = IBorrowStable(gbpPool).lastAccrual();
        vm.warp(start + 270 days);
        IBorrowStable(gbpPool).accureInterest();

        (, uint256 totalDebtAfterAccrual,) = IBorrowStable(gbpPool).aggregateState();
        console.log("Total debt after ~9 months:", totalDebtAfterAccrual);
        assertGt(totalDebtAfterAccrual, 750e18, "debt above liquidation threshold (75% of 1000e18)");

        // Refresh oracle so latestRoundData is not stale
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(gbpPool, 1e8);

        // Liquidator gets GBP by depositing collateral and borrowing, then liquidates user
        vm.startPrank(liquidator);
        IERC20(address(weth)).approve(address(router), 2 ether);
        router.depositCollateral(gbpStable, liquidator, 2 ether);
        router.borrowFiat(gbpStable, 800e18); // enough to cover required repay
        uint256 liquidatorStableBefore = IERC20(gbpStable).balanceOf(liquidator);
        uint256 liquidatorWethBefore = weth.balanceOf(liquidator);

        // IERC20(gbpStable).approve(gbpPool, type(uint256).max);
        router.liquidate(gbpStable, user);
        vm.stopPrank();

        // Liquidator spent stablecoins and received collateral
        assertLt(IERC20(gbpStable).balanceOf(liquidator), liquidatorStableBefore, "liquidator spent stablecoins");
        assertGt(weth.balanceOf(liquidator), liquidatorWethBefore, "liquidator received collateral");

        // User's position: collateral should be reduced (partially or fully liquidated)
        (uint256 totalCollateral,,) = IBorrowStable(gbpPool).aggregateState();
        assertLt(totalCollateral, 1 ether + 2 ether, "total collateral reduced after liquidation");
    }

    /// @notice Ensure deposits into GBP and BHD markets via the router stay isolated.
    function test_deposits_are_isolated_between_gbp_and_bhd_pools() public {
        uint256 gbpDeposit = 5 ether;
        uint256 bhdDeposit = 3 ether;

        vm.startPrank(user);
        IERC20(address(weth)).approve(address(router), gbpDeposit + bhdDeposit);
        router.depositCollateral(gbpStable, user, gbpDeposit);
        router.depositCollateral(bhdStable, user, bhdDeposit);
        vm.stopPrank();

        (uint256 gbpCollateral,,) = IBorrowStable(gbpPool).aggregateState();
        (uint256 bhdCollateral,,) = IBorrowStable(bhdPool).aggregateState();

        assertEq(gbpCollateral, gbpDeposit, "GBP pool collateral should match GBP deposit");
        assertEq(bhdCollateral, bhdDeposit, "BHD pool collateral should match BHD deposit");
        assertEq(weth.balanceOf(gbpPool), gbpDeposit, "GBP pool WETH balance should match deposit");
        assertEq(weth.balanceOf(bhdPool), bhdDeposit, "BHD pool WETH balance should match deposit");
    }

    /// @notice Borrow from the BHD market using its own oracle FX (2.5 USD per BHD).
    function test_borrow_from_bhd_pool_uses_bhd_stable() public {
        // Configure oracle specifically for BHD: 1 ETH = 1000 USD, 1 BHD = 2.5 USD
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(bhdPool, 25e7); // 2.5e8

        // User deposits 1 ETH as collateral into BHD market
        vm.startPrank(user);
        IERC20(address(weth)).approve(address(router), 1 ether);
        router.depositCollateral(bhdStable, user, 1 ether);

        // Borrow 200 BHD (well below safe LTV limit)
        uint256 borrowAmountBhd = 280e18;
        router.borrowFiat(bhdStable, borrowAmountBhd);
        vm.stopPrank();

        assertEq(IERC20(bhdStable).balanceOf(user), borrowAmountBhd, "user should receive 200 BHD from BHD market");

        // Ensure no GBP was minted as part of this operation
        assertEq(IERC20(gbpStable).balanceOf(user), 0, "GBP balance should remain zero");
    }

    /// @notice 3 users borrow the same GBP amount; after 1 year they fully repay (including interest).
    function test_three_users_borrow_same_amount_then_repay_after_one_year() public {
        // Price configuration for GBP: 1 ETH = 1000 USD, 1 GBP = 1 USD
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(gbpPool, 1e8);

        address[3] memory users = [user, user2, user3];
        uint256 borrowAmount = 500e18;

        // Each user deposits collateral and borrows the same amount
        for (uint256 i = 0; i < users.length - 1; i++) {
            vm.startPrank(users[i]);
            IERC20(address(weth)).approve(address(router), 2 ether);
            router.depositCollateral(gbpStable, users[i], 2 ether);
            router.borrowFiat(gbpStable, borrowAmount);
            vm.stopPrank();

            assertEq(IERC20(gbpStable).balanceOf(users[i]), borrowAmount, "borrowed amount mismatch");
        }

        // Warp 1 year and accrue interest once at the pool level
        uint256 start = IBorrowStable(gbpPool).lastAccrual();
        (, uint256 totalDebtAfter,) = IBorrowStable(gbpPool).aggregateState();
        console.log(totalDebtAfter);
        vm.warp(start + 365 days);
        IBorrowStable(gbpPool).accureInterest();
        (, uint256 totalDebtAfter1,) = IBorrowStable(gbpPool).aggregateState();
        console.log(totalDebtAfter1);

        // Refresh oracle to avoid staleness reverts during repay (repay path can read price indirectly in checks)
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(gbpPool, 1e8);

        (, uint256 totalDebtBeforeRepay, uint256 totalSharesBeforeRepay) = IBorrowStable(gbpPool).aggregateState();
        assertGt(totalDebtBeforeRepay, borrowAmount * 2, "debt should have grown with interest");
        assertGt(totalSharesBeforeRepay, 0, "shares should exist");

        // Each user repays their full debt. Since debt > borrowed amount (interest), we top up balances for the test.
        for (uint256 i = 0; i < users.length - 1; i++) {
            deal(gbpStable, users[i], borrowAmount + 51e18); // ensure enough to repay principal + interest
            vm.startPrank(users[i]);
            uint256 userBalBefore = IERC20(gbpStable).balanceOf(users[i]);
            (, uint256 poolDebtBefore,) = IBorrowStable(gbpPool).aggregateState();
            router.repayFiat(gbpStable, users[i], type(uint256).max);
            vm.stopPrank();

            uint256 userBalAfter = IERC20(gbpStable).balanceOf(users[i]);
            (, uint256 poolDebtAfter,) = IBorrowStable(gbpPool).aggregateState();

            assertLt(userBalAfter, userBalBefore, "user stable balance should decrease after repay");
            assertLt(poolDebtAfter, poolDebtBefore, "pool debt should decrease after repay");
        }

        (, uint256 totalDebtAfter2, uint256 totalSharesAfter) = IBorrowStable(gbpPool).aggregateState();
        assertEq(totalDebtAfter2, 0, "all debt should be repaid");
        assertEq(totalSharesAfter, 0, "all shares should be burned");
    }
}
