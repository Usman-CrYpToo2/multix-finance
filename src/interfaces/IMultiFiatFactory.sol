// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Interface for MultiFiatFactory
/// @notice Deploys and manages the registry of Synthetic Fiat Tokens and their paired CDP Engines.
interface IMultiFiatFactory {
    /// @dev Structs to organize the factory inputs cleanly
    struct TokenParams {
        string country;
        string currency;
    }

    struct BorrowParams {
        uint256 minBorrowAmount;
        uint256 minCollatAmount;
        uint16 safeLtvBp;
        uint16 liquidationLtvBp;
        uint16 liquidationPenaltyBp;
        uint16 borrowRatePerYearBp;
    }

    // --- Events ---
    event MarketCreated(
        address indexed stableCoin, address indexed collateral, address indexed borrowStable, uint256 marketLength
    );

    event routerUpdated(address indexed owner, address indexed router);

    // --- State Variable Getters ---

    /// @notice Returns the global WETH address used as collateral
    function WETH() external view returns (address);

    /// @notice Returns the Master Hybrid Oracle address
    function MASTER_ORACLE() external view returns (address);

    /// @notice Fetches the deployed BorrowStable engine for a specific StableCoin and Collateral pair
    /// @param stableCoin The address of the synthetic fiat token
    /// @param collateral The address of the collateral asset (e.g., WETH)
    /// @return The address of the paired BorrowStable contract
    function getMarket(address stableCoin, address collateral) external view returns (address);

    /// @notice Fetches a deployed market address directly from the array by index
    /// @param index The index in the allMarkets array
    /// @return The address of the BorrowStable contract
    function allMarkets(uint256 index) external view returns (address);

    // --- Core Functions ---

    /// @notice Deploys a new Synthetic Fiat Token, its paired CDP Engine, and registers it to the Oracle
    /// @param tParams Struct containing the country and currency strings
    /// @param bParams Struct containing the LTV, penalty, and borrow rate configurations
    /// @return stableCoin The address of the newly deployed StableCoin
    /// @return borrowStable The address of the newly deployed BorrowStable engine
    function createMarket(TokenParams calldata tParams, BorrowParams calldata bParams)
        external
        returns (address stableCoin, address borrowStable);

    /// @notice Returns the total number of markets (CDPs) deployed by this factory
    function allMarketsLength() external view returns (uint256);

    /// @notice Fetches a specific market by its index
    function getMarketAtIndex(uint256 index) external view returns (address);
}
