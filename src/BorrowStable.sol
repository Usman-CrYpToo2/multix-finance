// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// openzeppelin imports
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
// interface
import {IBorrowStable} from "./interfaces/IBorrowStable.sol";
import {IStablecoin} from "./interfaces/IStablecoin.sol";
import {IHybridFiatPriceFeed} from "./interfaces/Oracle/IHybridFiatPriceFeed.sol";

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
    uint256 internal internalOpBalance;

    uint256 public lastAccrual;

    /// @dev Daily borrow rate in basis points (derived from APR).
    uint256 public borrowRatePerSecond;

    IStablecoin public immutable StableCoin;

    address public immutable collateralAsset; // collateral token (e.g. WETH)

    EnumerableSet.AddressSet private _activeLoans;
    mapping(address => Account) internal _accounts;

    /// @notice Initializes the borrow stable engine configuration and core state.
    /// @param params Struct containing stablecoin, collateral, oracle and risk parameters.
    constructor(InitailConsParams memory params) Ownable(params.owner) {
        require(
            params.minBorrowAmount >= MIN_OPERATION_AMOUNT && params.minCollatAmount >= MIN_OPERATION_AMOUNT,
            "LessThanMinOpAmount"
        );

        _validateLtvConfig(params.safeLtvBp, params.liquidationLtvBp, params.liquidationPenaltyBp);

        require(params.borrowRatePerYearBp <= MAX_BORROW_APR_BP, "BorrowRateTooHigh");

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
        borrowRatePerSecond = uint256(params.borrowRatePerYearBp).mulDiv(10 ** 14, SECONDS_PER_YEAR, Math.Rounding.Ceil);

        lastAccrual = block.timestamp;
    }

    /// @notice Pause all state-changing operations.
    /// @dev Can only be called by the contract owner.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause all state-changing operations.
    /// @dev Can only be called by the contract owner.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Public entry point to accrue interest on total protocol debt.
    /// @dev Uses lazy accrual based on elapsed time since the last accrual.
    function accureDebt() public {
        _accrueDebt();
    }

    /// @notice Deposit collateral on behalf of a receiver.
    /// @param receiver Address whose account receives the collateral.
    /// @param amount Amount of collateral to deposit.
    function depositCollateral(address receiver, uint256 amount) external {
        _accrueDebt();
        _deposit(msg.sender, receiver, amount);
    }

    /// @notice Withdraw collateral from the caller’s account.
    /// @param amount Amount of collateral to withdraw.
    function withdrawCollateral(uint256 amount) external {
        _accrueDebt();
        _withdraw(msg.sender, amount);
    }

    /// @notice Borrow stablecoins against the caller’s collateral.
    /// @param stablecoinAmount Amount of stablecoins to borrow.
    function borrow(uint256 stablecoinAmount) public {
        _accrueDebt();
        _borrow(msg.sender, stablecoinAmount);
    }

    function repayFiat(address account, uint256 stablecoinAmount) external {
        require(stablecoinAmount > 0, "zero Amount");
        require(account != address(0), "zero address");
        _accrueDebt();
        _repay(msg.sender, account, stablecoinAmount);
    }

    /// @dev Accrues interest on total protocol debt based on elapsed time.
    ///      Updates `aggregateState.totalDebt` and `lastAccrual` when needed.
    function _accrueDebt() internal {
        uint256 timeElapsed = block.timestamp - lastAccrual;
        uint256 totalDebt = aggregateState.totalDebt;
        if (timeElapsed >= 1) {
            if (totalDebt > 0) {
                uint256 interest = (borrowRatePerSecond * timeElapsed).mulDiv(totalDebt, 10 ** 18);

                if (interest > 0) {
                    // 1. Calculate the splits (25% owner, 25% internal)
                    uint256 ownerShare = interest.mulDiv(2500, BASIS_POINTS);
                    uint256 internalShare = interest.mulDiv(2500, BASIS_POINTS);

                    // Total amount to mint is only 50% of the total accrued interest
                    uint256 amountToMint = ownerShare + internalShare;

                    if (amountToMint > 0) {
                        // 2. Mint only the 50% portion
                        StableCoin.mint(address(this), amountToMint);

                        // 3. Send 25% to the owner
                        StableCoin.transfer(owner(), ownerShare);

                        // 4. Add 25% to the internal operation balance (stays in contract)
                        internalOpBalance += internalShare;
                    }

                    // 5. The remaining 50% is left unminted (acting as a burn).
                    // However, we still add the FULL 100% of the interest to the global debt.
                    aggregateState.totalDebt += interest;
                }
            }
            lastAccrual = block.timestamp;
        }
    }

    /// @dev Internal helper to deposit collateral and update accounting.
    /// @param _sender Address providing the collateral tokens.
    /// @param _receiver Address whose account receives the collateral balance.
    /// @param _amount Amount of collateral deposited.
    function _deposit(address _sender, address _receiver, uint256 _amount) internal whenNotPaused {
        require(_amount >= collateralConfig.minCollatAmount, "lessThanMinCollateral");
        Account storage account = _accounts[_receiver];
        account.collateral += _amount;
        aggregateState.totalCollateral += _amount;
        IERC20(collateralAsset).safeTransferFrom(_sender, address(this), _amount);
        emit Deposit(msg.sender, _receiver, _amount);
    }

    /// @dev Internal helper to withdraw collateral and update accounting.
    /// @param _sender Address whose collateral is being withdrawn.
    /// @param _amount Amount of collateral to withdraw.
    function _withdraw(address _sender, uint256 _amount) internal whenNotPaused {
        require(_amount > 0, "zero amount");
        Account storage account = _accounts[_sender];
        require(_amount <= _getCollateralAvailableToWithdraw(account), "NotEnoughAvailableCollateral");
        uint256 remainingCollateral = account.collateral - _amount;
        if (remainingCollateral > 0 && remainingCollateral < collateralConfig.minCollatAmount) {
            revert LessThanMinCollateralRemaining();
        }

        account.collateral = remainingCollateral;
        aggregateState.totalCollateral -= _amount;
        IERC20(collateralAsset).safeTransfer(_sender, _amount);
        emit Withdraw(_sender, _amount);
    }

    /// @dev Internal helper to borrow stablecoins for a borrower.
    /// @param _borrower Address receiving the borrowed stablecoins.
    /// @param _amount Amount of stablecoins to borrow.
    function _borrow(address _borrower, uint256 _amount) internal whenNotPaused {
        require(_amount >= collateralConfig.minBorrowAmount, "LessThanMinBorrow");
        Account storage account = _accounts[_borrower];
        require(_checkCollateralAvailableToBorrow(account, _amount), "NotEnoughCollateralToBorrow");
        uint256 shares = convertStablecoinToShares(_amount);
        account.creditShares += shares;
        aggregateState.totalCredit += shares;
        aggregateState.totalDebt += _amount;
        _activeLoans.add(_borrower);
        StableCoin.mint(_borrower, _amount);
        emit Borrow(_borrower, _amount);
    }

    function _repay(address sender, address _account, uint256 stablecoinAmount) internal whenNotPaused {
        Account storage account = _accounts[_account];
        uint256 userDebt = _getDebt(account);
        require(userDebt > 0, "zero debt");

        uint256 amountIn = stablecoinAmount;
        uint256 debtToPay;
        uint256 shares;
        uint256 debtCovered;

        if (amountIn == type(uint256).max) {
            amountIn = userDebt;
        }

        if (userDebt > amountIn) {
            uint256 remainingAmount = userDebt - amountIn;
            if (remainingAmount <= MIN_OPERATION_AMOUNT && internalOpBalance >= remainingAmount) {
                debtToPay = userDebt;
                shares = account.creditShares;
                _activeLoans.remove(_account);
                internalOpBalance -= remainingAmount;
                debtCovered = remainingAmount;
            } else {
                debtToPay = amountIn;
                shares = convertStablecoinToShares(amountIn);
            }
        } else {
            debtToPay = userDebt;
            shares = account.creditShares;
            _activeLoans.remove(_account);
        }

        aggregateState.totalDebt -= debtToPay;
        aggregateState.totalCredit -= shares;
        account.creditShares -= shares;
        StableCoin.burn(sender, debtToPay - debtCovered);
        if (debtCovered > 0) {
            StableCoin.burn(address(this), debtCovered);
        }
    }

    // 1 eth = 1000 GBP

    /// @dev Returns the maximum collateral that can be withdrawn without breaching safe LTV.
    /// @param account The account data used to compute available collateral.
    /// @return The amount of collateral that can be safely withdrawn.
    function _getCollateralAvailableToWithdraw(Account memory account) private view returns (uint256) {
        uint256 debt = _getDebt(account); // (250 * (10 ** 6) 250250000
        if (debt == 0) return account.collateral;
        uint256 safeLoan = _getSafeLoan(account); // 250 * (10 ^ 6)

        if (debt >= safeLoan) return 0; // 250 >= 250
        return fromFiatToCollat((safeLoan - debt).mulDiv(BASIS_POINTS, ltvConfig.safeLtvBp, Math.Rounding.Floor));
    }

    function _checkCollateralAvailableToBorrow(Account storage account, uint256 _amount) private view returns (bool) {
        uint256 safeLoan = _getSafeLoan(account);
        uint256 debt = _getDebt(account);
        uint256 availableLoan = safeLoan > debt ? safeLoan - debt : 0;
        if (availableLoan == 0 || _amount > availableLoan) {
            return false;
        }
        return true;
    }

    /// @dev Computes current debt for an account based on its credit shares.
    /// @param account The account whose debt is being calculated.
    /// @return The stablecoin-denominated debt of the account.
    function _getDebt(Account memory account) private view returns (uint256) {
        if (_activeLoans.length() > 1) {
            return _convertSharesToStablecoin(account.creditShares);
        } else {
            if (account.creditShares > 0) {
                return aggregateState.totalDebt;
            } else {
                return 0;
            }
        }
    }

    /// @dev Returns the maximum safe loan value in stablecoins at the configured LTV.
    /// @param account The account whose collateral backs the loan.
    /// @return The safe loan amount in stablecoins.
    function _getSafeLoan(Account memory account) private view returns (uint256) {
        return fromCollatToStablecoin(account.collateral).mulDiv(ltvConfig.safeLtvBp, BASIS_POINTS);
    }

    /// @dev Converts a number of credit shares to a stablecoin amount (rounding up).
    /// @param _shares The number of credit shares.
    /// @return Stablecoin amount corresponding to the shares.
    function _convertSharesToStablecoin(uint256 _shares) private view returns (uint256) {
        return _convertToStablecoin(_shares, Math.Rounding.Ceil);
    }

    function convertStablecoinToShares(uint256 stablecoinAmount) internal view returns (uint256) {
        return _convertToShares(stablecoinAmount, Math.Rounding.Floor);
    }

    /// @dev Internal generic converter from shares to stablecoins using a rounding mode.
    /// @param _shares The number of credit shares.
    /// @param _rounding Rounding direction for the division.
    /// @return Stablecoin amount corresponding to the shares.
    function _convertToStablecoin(uint256 _shares, Math.Rounding _rounding) private view returns (uint256) {
        return _shares.mulDiv(aggregateState.totalDebt + 1, aggregateState.totalCredit + 1, _rounding);
    }

    function _convertToShares(uint256 stablecoinAmount, Math.Rounding _rounding) private view returns (uint256) {
        return stablecoinAmount.mulDiv(aggregateState.totalCredit + 1, aggregateState.totalDebt + 1, _rounding);
    }

    /// @notice Converts a collateral amount to its stablecoin value using the oracle price.
    /// @param _amount Collateral amount to convert.
    /// @return Stablecoin-denominated value of the collateral.
    function fromCollatToStablecoin(uint256 _amount) internal view returns (uint256) {
        return
            _amount.mulDiv(_collatPriceToStable(), collateralConfig.collatTofiatConversionConstant, Math.Rounding.Floor);
    }

    /// @dev Fetches the latest collateral-fiat price from the oracle and normalizes it.
    /// @return The latest positive price for the collateral asset.
    function _collatPriceToStable() private view returns (uint256) {
        (, int256 price,,,) = collateralConfig.collatToFiatOracle.latestRoundData();
        require(price > 0, "priceLessthanzero");
        return uint256(price);
    }

    /// @notice Converts a fiat-denominated amount to collateral units using the oracle price.
    /// @param amount Fiat amount to convert.
    /// @return Collateral-denominated amount.
    function fromFiatToCollat(uint256 amount) internal view returns (uint256) {
        return
            amount.mulDiv(collateralConfig.collatTofiatConversionConstant, _collatPriceToStable(), Math.Rounding.Floor);
    }

    /// @dev Validates that the provided LTV and liquidation parameters are within safe bounds.
    /// @param _safeLtvBp Safe LTV in basis points.
    /// @param _liquidationLtvBp Liquidation LTV in basis points.
    /// @param _liquidationPenaltyBp Liquidation penalty in basis points.
    function _validateLtvConfig(uint16 _safeLtvBp, uint16 _liquidationLtvBp, uint16 _liquidationPenaltyBp)
        internal
        pure
    {
        require(_safeLtvBp >= MIN_SAFE_LTV_BP && _safeLtvBp <= MAX_SAFE_LTV_BP, "SafeLtvBpOutOfRange");
        require(_liquidationLtvBp <= BASIS_POINTS - MAX_PENALTY_BP, "LiquidationLtvBpTooLarge");
        require(_liquidationPenaltyBp <= MAX_PENALTY_BP, "LiquidationPenaltyBpTooLarge");
        require(_safeLtvBp < _liquidationLtvBp, "SafeLtvBpTooLarge");
    }
}
