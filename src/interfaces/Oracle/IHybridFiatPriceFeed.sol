// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Interface for the Hybrid Multi-Fiat Price Feed
/// @notice Universal oracle interface mapping CDP pool addresses to their respective FX rates.
interface IHybridFiatPriceFeed {
    /// **********
    /// * Errors *
    /// **********
    error OracleNoLongerAlive();
    error UnauthorizedBot();
    error InvalidRate();
    error RateStale();
    error InvalidInt256();
    error PoolNotWhitelisted();

    /// **********
    /// * Events *
    /// **********
    event FxRateUpdated(address indexed bot, address indexed pool, uint256 newRate);
    event EthPriceUpdated(address indexed user, uint256 newPrice);
    event BotStatusChanged(address indexed bot, bool isAuthorized);
    event OracleKilled(address indexed owner);
    event PoolWhitelistUpdated(address indexed pool, bool status);

    /// ******************
    /// * View Functions *
    /// ******************

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function getEthPriceForPool(address _pool) external view returns (uint256);

    // --- State Getters ---
    function decimals() external view returns (uint8);
    function ethUsdPrice() external view returns (uint256);
    function poolFxRates(address _pool) external view returns (uint256);
    function lastFxUpdateTimestamps(address _pool) external view returns (uint256);
    function lastEthUpdateTimestamp() external view returns (uint256);
    function whitelistedPools(address _pool) external view returns (bool);
    function live() external view returns (bool);
    function authorizedBots(address _bot) external view returns (bool);

    /// *******************
    /// * Write Functions *
    /// *******************

    function updateFxRate(address _pool, uint256 _newRate) external;
    function updateEthPrice(uint256 currentPrice) external;

    /// *******************
    /// * Admin Functions *
    /// *******************

    function setPoolWhitelist(address _pool, bool _status) external;
    function setBotAuthorization(address _bot, bool _status) external;
    function killOracle() external;
}
