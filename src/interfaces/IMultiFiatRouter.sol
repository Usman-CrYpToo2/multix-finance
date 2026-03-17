// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Interface for MultiFiatRouter
/// @notice The primary entry point for users to interact with various fiat CDP markets.
interface IMultiFiatRouter {
    /// **********
    /// * Errors *
    /// **********

    error MarketDoesNotExist(address stableCoin);

    /// ***************************
    /// * Public State Variables  *
    /// ***************************

    /// @notice Returns the address of the MultiFiatFactory
    function factory() external view returns (address);

    /// @notice Returns the global WETH address used as collateral
    function WETH() external view returns (address);

    /// **************************
    /// * Core Router Functions  *
    /// **************************

    /// @notice Deposit collateral into a specific fiat market.
    /// @param stableCoin The address of the synthetic fiat token (e.g., GBP, PKR)
    /// @param receiver Address whose account receives the collateral credit
    /// @param amount Amount of WETH to deposit
    function depositCollateral(address stableCoin, address receiver, uint256 amount) external;

    /// @notice Withdraw collateral from a specific fiat market.
    /// @param stableCoin The address of the synthetic fiat token
    /// @param amount Amount of WETH to withdraw
    function withdrawCollateral(address stableCoin, uint256 amount) external;

    /// @notice Borrow synthetic fiat against deposited collateral.
    /// @param stableCoin The address of the synthetic fiat token
    /// @param stablecoinAmount Amount of stablecoins to borrow
    function borrowFiat(address stableCoin, uint256 stablecoinAmount) external;

    /// @notice Repay synthetic fiat debt.
    /// @param stableCoin The address of the synthetic fiat token
    /// @param account The address of the CDP owner being repaid
    /// @param stablecoinAmount Amount of stablecoins to repay
    function repayFiat(address stableCoin, address account, uint256 stablecoinAmount) external;

    /// @notice Liquidate an undercollateralized CDP.
    /// @param stableCoin The address of the synthetic fiat token
    /// @param account The address of the CDP to liquidate
    function liquidate(address stableCoin, address account) external;
}
