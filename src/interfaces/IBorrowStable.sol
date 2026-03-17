// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IHybridFiatPriceFeed} from "./Oracle/IHybridFiatPriceFeed.sol";

interface IBorrowStable {
    /// **********
    /// * Events *
    /// **********

    event Deposit(address indexed sender, address indexed receiver, uint256 amount);
    event Borrow(address indexed borrower, uint256 indexed stablecoin);
    event Withdraw(address indexed sender, uint256 amount);
    event Repay(address indexed payer, address indexed account, uint256 repaidDebt, uint256 remainingDebt);
    event Liquidate(address indexed liquidator, address indexed account, uint256 debtRepaid, uint256 collateralSeized);

    /// **********
    /// * Errors *
    /// **********

    error LessThanMinCollateralRemaining();

    /// ***********
    /// * Structs *
    /// ***********

    struct Account {
        uint256 shares;
        uint256 collateral;
    }

    /// @dev Configuration for LTV and liquidation risk parameters.
    struct LtvConfig {
        uint16 safeLtvBp;
        uint16 liquidationLtvBp;
        uint16 liquidationPenaltyBp;
    }

    /// @dev Configuration related to collateral asset and price feed.
    struct CollateralConfig {
        IHybridFiatPriceFeed collatToFiatOracle;
        uint256 minCollatAmount;
        uint256 minBorrowAmount;
        uint256 collatTofiatConversionConstant;
    }

    /// @dev Aggregate protocol-wide accounting values.
    struct AggregateState {
        uint256 totalCollateral;
        uint256 totalDebt;
        uint256 totalShares;
    }

    // constructor param
    struct InitailConsParams {
        address StableCoin;
        address collateralAsset;
        address collatToFiatOracle;
        address owner;
        address router;
        // config setting
        uint256 minBorrowAmount;
        uint256 minCollatAmount;
        uint16 safeLtvBp;
        uint16 liquidationLtvBp;
        uint16 liquidationPenaltyBp;
        uint16 borrowRatePerYearBp;
        uint256 collatTofiatConversion;
    }

    /// ***************************
    /// * Public State Variables  *
    /// ***************************

    function ltvConfig()
        external
        view
        returns (uint16 safeLtvBp, uint16 liquidationLtvBp, uint16 liquidationPenaltyBp);

    function collateralConfig()
        external
        view
        returns (
            IHybridFiatPriceFeed collatToFiatOracle,
            uint256 minCollatAmount,
            uint256 minBorrowAmount,
            uint256 collatTofiatConversionConstant
        );

    function aggregateState() external view returns (uint256 totalCollateral, uint256 totalDebt, uint256 totalShares);

    function lastAccrual() external view returns (uint256);
    function borrowRatePerSecond() external view returns (uint256);
    function collateralAsset() external view returns (address);
    function Router() external view returns (address);

    /// **************************
    /// * Core Engine Functions  *
    /// **************************

    /// @notice Pause all state-changing operations.
    function pause() external;

    /// @notice Unpause all state-changing operations.
    function unpause() external;

    /// @notice Public entry point to accrue interest on total protocol debt.
    function accureInterest() external;

    /// @notice Deposit collateral on behalf of a receiver.
    function depositCollateral(address receiver, uint256 amount) external;

    /// @notice Withdraw collateral from the caller’s account.
    function withdrawCollateral(address supplier, uint256 amount) external;

    /// @notice Borrow stablecoins against the caller’s collateral.
    function borrowFiat(address borrower, uint256 stablecoinAmount) external;

    /// @notice Repay synthetic fiat debt.
    function repayFiat(address supplier, address account, uint256 stablecoinAmount) external;

    /// @notice Liquidate an undercollateralized CDP.
    function liquidate(address liquidator, address account) external;
}
