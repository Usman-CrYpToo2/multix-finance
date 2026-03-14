// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// openzeppelin imports
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
// interface
import {IBorrowStable} from "./interfaces/IBorrowStable.sol";
import {IStablecoin} from "./interfaces/IStablecoin.sol";
import {
    IHybridFiatPriceFeed
} from "./interfaces/Oracle/IHybridFiatPriceFeed.sol";

contract BorrowStable is IBorrowStable, Ownable, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;
    using SafeERC20 for IERC20;

    /// *************
    /// * Constants *
    /// *************
    // Standard unit for percentage math (1% = 100 basis points).
    uint16 private constant BASIS_POINTS = 10000; // 100.0%

    // MAX_BORROW_APR_BP: Max interest borrower pays per year.
    uint16 private constant MAX_BORROW_APR_BP = 1500; // 15.00%

    // MAX_PENALTY_BP: Max liquidation penalty to avoid predatory liquidations.
    uint16 private constant MAX_PENALTY_BP = 1000; // 10.00%

    // Valid bounds for Loan-To-Value (LTV) configuration.
    // Keeps user LTV within safe range.
    uint16 private constant MIN_SAFE_LTV_BP = 4000; // 40.00%
    uint16 private constant MAX_SAFE_LTV_BP = 7000; // 70.00%

    /// @dev 24 hours * 60 minutes * 60 seconds
    uint32 private constant SECONDS_PER_DAY = 86_400;
    uint64 private constant SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;

    // Blocks dust-level deposits or borrows.
    uint256 internal constant MIN_OPERATION_AMOUNT = 10_000;

    /// *****************
    /// * Storage slots *
    /// *****************

    /// @dev LTV and liquidation parameters.
    LtvConfig public ltvConfig;

    /// @dev Collateral, oracle and min-amount configuration.
    CollateralConfig public collateralConfig;

    /// @dev Aggregate accounting for all users.
    AggregateState public aggregateState;

    /// @dev Internal balance used for operational accounting.
    uint256 internal internalOperationBalance;

    uint256 public lastAccrual;

    /// @dev Daily borrow rate in basis points (derived from APR).
    uint256 public borrowRatePerSecond;

    IStablecoin public immutable StableCoin;

    address public immutable collateralAsset; // collateral token (e.g. WETH)

    EnumerableSet.AddressSet private _activeLoans;
    mapping(address => Account) internal _accounts;

    constructor(InitailConsParams memory params) Ownable(params.owner) {
        require(
            params.minBorrowAmount >= MIN_OPERATION_AMOUNT &&
                params.minCollatAmount >= MIN_OPERATION_AMOUNT,
            "LessThanMinOpAmount"
        );

        _validateLtvConfig(
            params.safeLtvBp,
            params.liquidationLtvBp,
            params.liquidationPenaltyBp
        );

        require(
            params.borrowRatePerYearBp <= MAX_BORROW_APR_BP,
            "BorrowRateTooHigh"
        );

        StableCoin = IStablecoin(params.StableCoin);
        collateralAsset = params.collateralAsset;

        ltvConfig = LtvConfig({
            safeLtvBp: params.safeLtvBp,
            liquidationLtvBp: params.liquidationLtvBp,
            liquidationPenaltyBp: params.liquidationPenaltyBp
        });

        collateralConfig = CollateralConfig({
            collatToFiatOracle: IHybridFiatPriceFeed(params.collatToFiatOracle),
            minCollatAmount: params.minCollatAmount,
            minBorrowAmount: params.minBorrowAmount,
            collatTofiatConversionConstant: params.collatTofiatConversion // 10e8
        });

        // Convert yearly rate in basis points to a per-Second rate.
        borrowRatePerSecond = uint256(params.borrowRatePerYearBp).mulDiv(
            10 ** 14,
            SECONDS_PER_YEAR,
            Math.Rounding.Ceil
        );

        lastAccrual = block.timestamp;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function accureDebt() public {
        _accrueDebt();
    }

    function depositCollateral(address receiver, uint256 amount) external {
        _accrueDebt();
        _deposit(msg.sender, receiver, amount);
    }

    function withdrawCollateral(uint256 amount) external {
        _accrueDebt();
        _withdraw(msg.sender, amount);
    }

      function borrow(uint256 stablecoinAmount) public {
        _accrueDebt();
        _borrow(msg.sender, stablecoinAmount);
    }

    function _accrueDebt() internal {
        uint256 timeElapsed = block.timestamp - lastAccrual;
        uint256 totalDebt = aggregateState.totalDebt;
        if (timeElapsed >= 1) {
            if (totalDebt > 0) {
                uint256 interest = (borrowRatePerSecond * timeElapsed).mulDiv(
                    totalDebt,
                    10 ** 18
                );

                if (interest > 0) {
                    // todo : should we mint the interest now (inform of stablecoin ) or when debt is repayed take that interest
                    aggregateState.totalDebt += interest;
                }
            }
            lastAccrual = block.timestamp;
        }
    }

    function _deposit(
        address _sender,
        address _receiver,
        uint256 _amount
    ) internal whenNotPaused {
        require(
            _amount >= collateralConfig.minCollatAmount,
            "lessThanMinCollateral"
        );
        Account storage account = _accounts[_receiver];
        account.collateral += _amount;
        aggregateState.totalCollateral += _amount;
        IERC20(collateralAsset).safeTransferFrom(
            _sender,
            address(this),
            _amount
        );
        emit Deposit(msg.sender, _receiver, _amount);
    }

    function _withdraw(
        address _sender,
        uint256 _amount
    ) internal whenNotPaused {
        require(_amount > 0, "zero amount");
        Account storage account = _accounts[_sender];
        require(_amount <= _getCollateralAvailableToWithdraw(account), "NotEnoughAvailableCollateral");         
        uint256 remainingCollateral = account.collateral - _amount;
        if (
            remainingCollateral > 0 &&
            remainingCollateral < collateralConfig.minCollatAmount
        ) revert LessThanMinCollateralRemaining();

        account.collateral = remainingCollateral;
        aggregateState.totalCollateral -= _amount;
        IERC20(collateralAsset).safeTransfer(_sender, _amount);
    }

    function _borrow(address _borrower, uint256 _amount) internal whenNotPaused {
          require(_amount >= collateralConfig.minBorrowAmount,"LessThanMinBorrow");
          Account storage borrowerData = _accounts[_borrower];

          StableCoin.mint(_borrower, _amount);
    }
      // 1 eth = 1000 GBP
      function _getCollateralAvailableToWithdraw(
        Account memory account
    ) private view returns (uint256) {
        uint256 debt = _getDebt(account); // (250 * (10 ** 6) 250250000
        if (debt == 0) return account.collateral;
        uint256 safeLoan = _getSafeLoan(account); // 250 * (10 ^ 6)

        if (debt >= safeLoan) return 0; // 250 >= 250
        return
            fromFiatToCollat(
                (safeLoan - debt).mulDiv(
                    BASIS_POINTS,
                    ltvConfig.safeLtvBp,
                    Math.Rounding.Floor
                )
            ); 
    }

    function _getDebt(
        Account memory account
    ) private view returns (uint256) {
        if (_activeLoans.length() > 1) {
            return
                _convertSharesToStablecoin(account.creditShares);
        } else {
           
            if (account.creditShares > 0) {
                return aggregateState.totalDebt;
            } else {
                return 0;
            }
        }
    }
     function _getSafeLoan(
        Account memory account
    ) private view returns (uint256) {
        return
            fromCollatToStablecoin(account.collateral).mulDiv(
                ltvConfig.safeLtvBp,
                BASIS_POINTS
            );
    }

     function _convertSharesToStablecoin(
        uint256 _shares
    ) private view returns (uint256) {
        return _convertToStablecoin( _shares, Math.Rounding.Ceil);
    }

       function _convertToStablecoin(
        uint256 _shares,
        Math.Rounding _rounding
    ) private view returns (uint256) {
        return
            _shares.mulDiv(
                aggregateState.totalDebt + 1,
                aggregateState.totalCredit + 1,
                _rounding
            );
    }

      function fromCollatToStablecoin(uint256 _amount) internal view returns (uint256) {
        return
            _amount.mulDiv(
                _collatPriceToStable(),
                collateralConfig.collatTofiatConversionConstant,
                Math.Rounding.Floor
            );
    }

     function _collatPriceToStable() private view returns (uint256) {
        (, int256 price, , , ) = collateralConfig.collatToFiatOracle.latestRoundData();
         require(price > 0, "priceLessthanzero");
        return uint256(price);
    }

    function fromFiatToCollat(uint256 amount) internal view returns (uint256) {
        return
            amount.mulDiv(
                collateralConfig.collatTofiatConversionConstant,
                _collatPriceToStable(),
                Math.Rounding.Floor
            );
    }


    function _validateLtvConfig(
        uint16 _safeLtvBp,
        uint16 _liquidationLtvBp,
        uint16 _liquidationPenaltyBp
    ) internal pure {
        require(
            _safeLtvBp >= MIN_SAFE_LTV_BP && _safeLtvBp <= MAX_SAFE_LTV_BP,
            "SafeLtvBpOutOfRange"
        );
        require(
            _liquidationLtvBp <= BASIS_POINTS - MAX_PENALTY_BP,
            "LiquidationLtvBpTooLarge"
        );
        require(
            _liquidationPenaltyBp <= MAX_PENALTY_BP,
            "LiquidationPenaltyBpTooLarge"
        );
        require(_safeLtvBp < _liquidationLtvBp, "SafeLtvBpTooLarge");
    }
}
