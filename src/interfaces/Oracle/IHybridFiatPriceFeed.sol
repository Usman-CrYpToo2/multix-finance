// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IHybridFiatPriceFeed
/// @notice Interface for the HybridFiatPriceFeed oracle adapter
interface IHybridFiatPriceFeed {

    /*//////////////////////////////////////////////////////////////
                               ERRORS
    //////////////////////////////////////////////////////////////*/

    error OracleNoLongerAlive();
    error UnauthorizedBot();
    error InvalidRate();
    error RateStale();
    error InvalidInt256();

    /*//////////////////////////////////////////////////////////////
                               EVENTS
    //////////////////////////////////////////////////////////////*/

    event FxRateUpdated(address indexed bot, uint256 newRate);
    event EthPriceUpdated(address indexed user, uint256 newPrice);
    event BotStatusChanged(address indexed bot, bool isAuthorized);
    event OracleKilled(address indexed owner);

    /*//////////////////////////////////////////////////////////////
                               VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function live() external view returns (bool);

    function decimals() external view returns (uint8);

    function usdToFxRate() external view returns (uint256);

    function lastFxUpdateTimestamp() external view returns (uint256);

    function ethUsdPrice() external view returns (uint256);

    function lastEthUpdateTimestamp() external view returns (uint256);

    function authorizedBots(address bot) external view returns (bool);

    /*//////////////////////////////////////////////////////////////
                            ORACLE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function updateFxRate(uint256 _newRate) external;

    function updateEthPrice() external;

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    /*//////////////////////////////////////////////////////////////
                             ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function setBotAuthorization(address _bot, bool _status) external;

    function killOracle() external;

    /*//////////////////////////////////////////////////////////////
                         REDSTONE OVERRIDES
    //////////////////////////////////////////////////////////////*/

    function getUniqueSignersThreshold() external view returns (uint256);

    function getMaxDataTimestampDelay() external view returns (uint256);
}