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
import {ICDPEngine} from "./interfaces/ICDPEngine.sol";
import {IStablecoin} from "./interfaces/IStablecoin.sol";
import {IHybridFiatPriceFeed} from "./interfaces/Oracle/IHybridFiatPriceFeed.sol";

contract CDPEngine is ICDPEngine, Ownable, Pausable {
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

    address public immutable Router;

    EnumerableSet.AddressSet private currentUsers;
    mapping(address => Account) internal _accounts;

    /// @notice CDP engine configuration and core state.
    /// @param params Struct containing stablecoin, collateral, oracle and risk parameters.
    constructor(InitailConsParams memory params) Ownable(params.owner) {
        require(
            params.minBorrowAmount >= MIN_OPERATION_AMOUNT && params.minCollatAmount >= MIN_OPERATION_AMOUNT,
            "LessThanMinOpAmount"
        );

        _validateLtvSettings(params.safeLtvBp, params.liquidationLtvBp, params.liquidationPenaltyBp);

        require(params.borrowRatePerYearBp <= MAX_BORROW_APR_BP, "BorrowRateTooHigh");

        StableCoin = IStablecoin(params.StableCoin);
        collateralAsset = params.collateralAsset;
        Router = params.router;

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

    modifier onlyRouter() {
        require(msg.sender == Router, "InvalidRouter");
        _;
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
    function accureInterest() public {
        _accureInterest();
    }

    /// @notice Deposit collateral on behalf of a receiver.
    /// @param receiver Address whose account receives the collateral.
    /// @param amount Amount of collateral to deposit.
    function depositCollateral(address receiver, uint256 amount) external {
        _accureInterest();
        _deposit(msg.sender, receiver, amount);
    }

    /// @notice Withdraw collateral from the caller’s account.
    /// @param amount Amount of collateral to withdraw.
    function withdrawCollateral(address supplier, uint256 amount) external onlyRouter {
        _accureInterest();
        _withdraw(supplier, amount);
    }

    /// @notice Borrow stablecoins against the caller’s collateral.
    /// @param stablecoinAmount Amount of stablecoins to borrow.
    function borrowFiat(address borrower, uint256 stablecoinAmount) public onlyRouter {
        _accureInterest();
        _borrowFiat(borrower, stablecoinAmount);
    }

    function repayFiat(address supplier, address account, uint256 stablecoinAmount) external onlyRouter {
        require(stablecoinAmount > 0, "zero Amount");
        require(account != address(0), "zero address");
        _accureInterest();
        _repayFiat(supplier, account, stablecoinAmount);
    }

    function liquidate(address liquidator, address account) external onlyRouter {
        require(account != address(0), "zero address");
        _accureInterest();
        _liquidate(liquidator, account);
    }

    /// @dev Accrues interest on total protocol debt based on elapsed time.
    ///      Updates `aggregateState.totalDebt` and `lastAccrual` when needed.
    function _accureInterest() internal {
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
        emit Deposit(_sender, _receiver, _amount);
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
            if (_getDebt(account) == 0) {
                remainingCollateral = 0;
                _amount = account.collateral;
            } else {
                revert LessThanMinCollateralRemaining();
            }
        }
        account.collateral = remainingCollateral;
        aggregateState.totalCollateral -= _amount;
        IERC20(collateralAsset).safeTransfer(_sender, _amount);
        emit Withdraw(_sender, _amount);
    }

    /// @dev Internal helper to borrow stablecoins for a borrower.
    /// @param _borrower Address receiving the borrowed stablecoins.
    /// @param _amount Amount of stablecoins to borrow.
    function _borrowFiat(address _borrower, uint256 _amount) internal whenNotPaused {
        require(_amount >= collateralConfig.minBorrowAmount, "LessThanMinBorrow");
        Account storage account = _accounts[_borrower];
        require(_checkCollateralAvailableToborrowFiat(account, _amount), "NotEnoughCollateralToBorrow");
        uint256 shares = convertStablecoinToShares(_amount);
        account.shares += shares;
        aggregateState.totalShares += shares;
        aggregateState.totalDebt += _amount;
        currentUsers.add(_borrower);
        StableCoin.mint(_borrower, _amount);
        emit Borrow(_borrower, _amount);
    }

    function _repayFiat(address sender, address _account, uint256 stablecoinAmount) internal whenNotPaused {
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
                shares = account.shares;
                currentUsers.remove(_account);
                internalOpBalance -= remainingAmount;
                debtCovered = remainingAmount;
            } else {
                debtToPay = amountIn;
                shares = convertStablecoinToShares(amountIn);
            }
        } else {
            debtToPay = userDebt;
            shares = account.shares;
            currentUsers.remove(_account);
        }

        aggregateState.totalDebt -= debtToPay;
        aggregateState.totalShares -= shares;
        account.shares -= shares;
        StableCoin.burn(sender, debtToPay - debtCovered);
        if (debtCovered > 0) {
            StableCoin.burn(address(this), debtCovered);
        }
        emit Repay(sender, _account, debtToPay, userDebt - debtToPay);
    }

    function _liquidate(address liquidator, address _account) internal whenNotPaused {
        Account storage account = _accounts[_account];
        uint256 userDebt = _getDebt(account);
        uint256 safeLtvUser = _getSafeLoan(account);
        require(isLiquidatable(account, userDebt), "DebtisUnderSafeLTV");
        (uint256 required, uint256 collateralOut) = _getLiquidationDeal(userDebt, safeLtvUser, account.collateral);
        require(required > 0 && collateralOut > 0, "zero amounts");
        _repayFiat(liquidator, _account, required);
        account.collateral -= collateralOut;
        aggregateState.totalCollateral -= collateralOut;
        IERC20(collateralAsset).safeTransfer(liquidator, collateralOut);
        emit Liquidate(liquidator, _account, required, collateralOut);
    }

    // 1 eth = 1000 GBP

    /// @dev Returns the maximum collateral that can be withdrawn without breaching safe LTV.
    /// @param account The account data used to compute available collateral.
    /// @return The amount of collateral that can be safely withdrawn.
    function _getCollateralAvailableToWithdraw(Account memory account) private view returns (uint256) {
        uint256 debt = _getDebt(account);
        if (debt == 0) return account.collateral;
        uint256 safeLoan = _getSafeLoan(account);

        if (debt >= safeLoan) return 0;
        return fromFiatToCollat((safeLoan - debt).mulDiv(BASIS_POINTS, ltvConfig.safeLtvBp, Math.Rounding.Floor));
    }

    function _checkCollateralAvailableToborrowFiat(Account storage account, uint256 _amount)
        private
        view
        returns (bool)
    {
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
        if (currentUsers.length() > 1) {
            return _convertSharesToStablecoin(account.shares);
        } else {
            if (account.shares > 0) {
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
        return _shares.mulDiv(aggregateState.totalDebt + 1, aggregateState.totalShares + 1, _rounding);
    }

    function _convertToShares(uint256 stablecoinAmount, Math.Rounding _rounding) private view returns (uint256) {
        return stablecoinAmount.mulDiv(aggregateState.totalShares + 1, aggregateState.totalDebt + 1, _rounding);
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

    function isLiquidatable(Account memory account, uint256 _debt) internal view returns (bool) {
        return _debt > getLiqLoan(account);
    }

    function getLiqLoan(Account memory account) internal view returns (uint256) {
        return fromCollatToStablecoin(account.collateral).mulDiv(ltvConfig.liquidationLtvBp, BASIS_POINTS);
    }

    function _getLiquidationDeal(uint256 debt, uint256 safeDebt, uint256 collateral)
        private
        view
        returns (uint256 requiredStablecoin, uint256 collateralOut)
    {
        uint256 LtvBp = _getLtvRatioBp(debt, collateral);

        if (LtvBp >= ltvConfig.liquidationLtvBp) {
            if (LtvBp < BASIS_POINTS) {
                requiredStablecoin = getPartialLiquidationAmount(debt, safeDebt);
                collateralOut = getPartialcollateralReward(requiredStablecoin);
            } else {
                requiredStablecoin = debt;
                collateralOut = collateral;
            }
        } else {
            requiredStablecoin = 0;
            collateralOut = 0;
        }
    }

    function _getLtvRatioBp(uint256 debt, uint256 collateral) internal view returns (uint256) {
        require(collateral > 0, "zero collateral");
        return debt.mulDiv(BASIS_POINTS, fromCollatToStablecoin(collateral));
    }

    function getPartialLiquidationAmount(uint256 _debt, uint256 safeDebt) private view returns (uint256) {
        // Calculate the exact stablecoin amount to bring the CDP back to health
        uint256 denominator = getLiquidationDenominator(ltvConfig.safeLtvBp, ltvConfig.liquidationPenaltyBp);

        return (_debt - safeDebt).mulDiv(BASIS_POINTS, denominator, Math.Rounding.Floor);
    }

    function getLiquidationDenominator(uint16 safeLtvBp, uint16 liquidationPenaltyBp) private pure returns (uint256) {
        return (BASIS_POINTS - safeLtvBp - uint256(safeLtvBp).mulDiv(liquidationPenaltyBp, BASIS_POINTS));
    }

    function getPartialcollateralReward(uint256 fiatAmount) internal view returns (uint256) {
        uint256 reward = fiatAmount.mulDiv( // 377.358490566 * 100 + 5 / 100 = 396.2264150943
        BASIS_POINTS + ltvConfig.liquidationPenaltyBp, BASIS_POINTS, Math.Rounding.Floor);
        return fromFiatToCollat(reward);
    }

    /// @dev Validates that the provided LTV and liquidation parameters are within safe bounds.
    /// @param _safeLtvBp Safe LTV in basis points.
    /// @param _liquidationLtvBp Liquidation LTV in basis points.
    /// @param _liquidationPenaltyBp Liquidation penalty in basis points.
    function _validateLtvSettings(uint16 _safeLtvBp, uint16 _liquidationLtvBp, uint16 _liquidationPenaltyBp)
        internal
        pure
    {
        require(_safeLtvBp >= MIN_SAFE_LTV_BP && _safeLtvBp <= MAX_SAFE_LTV_BP, "SafeLtvBpOutOfRange");
        require(_liquidationLtvBp <= BASIS_POINTS - MAX_PENALTY_BP, "LiquidationLtvBpTooLarge");
        require(_liquidationPenaltyBp <= MAX_PENALTY_BP, "LiquidationPenaltyBpTooLarge");
        require(_safeLtvBp < _liquidationLtvBp, "SafeLtvBpTooLarge");
    }

    function getUserDebt(address _account) external view returns (uint256) {
        return _getDebt(_accounts[_account]);
    }

    function getUserCollateral(address _account) external view returns (uint256) {
        return _accounts[_account].collateral;
    }

    function getTotalDebt() external view returns(uint256) {
        uint256 timeElapsed = block.timestamp - lastAccrual;
        uint256 totalDebt = aggregateState.totalDebt;
        uint256 interest = (borrowRatePerSecond * timeElapsed).mulDiv(totalDebt, 10 ** 18);
        return totalDebt + interest;
    }

    function getTotalCollateral() external view returns(uint256) {
        return aggregateState.totalCollateral;
    }

    /// @notice Calculates the maximum exact amount of collateral a user can safely withdraw.
    /// @dev Accounts for the minCollatAmount constraint to prevent UX reverts.
    /// @param _user The address of the CDP owner.
    /// @return safeAmount The maximum withdrawable amount that won't trigger a dust revert.
    function getSafeWithdrawableCollateral(address _user) external view returns (uint256 safeAmount) {
        Account memory account = _accounts[_user];
        uint256 currentCollateral = account.collateral;

        if (currentCollateral == 0) return 0;

        uint256 debt = _getDebt(account);

        // 1. If the user has no debt, they can always withdraw 100% of their collateral.
        // Your _withdraw logic explicitly allows wiping remainingCollateral to 0 if debt == 0.
        if (debt == 0) {
            return currentCollateral;
        }

        // 2. Calculate the theoretical maximum allowed by the LTV math.
        uint256 theoreticalMax = _getCollateralAvailableToWithdraw(account);

        // Safety cap (should naturally be true, but protects against math edge cases)
        if (theoreticalMax > currentCollateral) {
            theoreticalMax = currentCollateral;
        }

        // 3. Simulate the remaining collateral after the theoretical max withdrawal.
        uint256 remainingCollateral = currentCollateral - theoreticalMax;

        // 4. Check for the "Dust Trap"
        // If taking the max leaves an invalid dust position, we must reduce the withdrawal 
        // amount so they leave exactly `minCollatAmount` behind.
        if (remainingCollateral > 0 && remainingCollateral < collateralConfig.minCollatAmount) {
            // Prevent underflow if the user somehow has less than minCollatAmount to begin with
            if (currentCollateral > collateralConfig.minCollatAmount) {
                safeAmount = currentCollateral - collateralConfig.minCollatAmount;
            } else {
                safeAmount = 0; // The position is too small to safely extract anything while holding debt.
            }
        } else {
            // Taking the theoretical max perfectly clears to 0, or leaves a healthy amount.
            safeAmount = theoreticalMax;
        }

        return safeAmount;
    }

}
