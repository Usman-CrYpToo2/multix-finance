// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IHybridFiatPriceFeed} from "../interfaces/Oracle/IHybridFiatPriceFeed.sol";

contract HybridFiatPriceFeed is IHybridFiatPriceFeed, Ownable {
    using Math for uint256;

    /// *************
    /// * Constants *
    /// *************
    uint8 public constant decimals = 8;
    bytes32 public constant ETH_USD_ID = bytes32("ETH");

    /// *****************
    /// * Storage slots *
    /// *****************
    bool public live;

    // MAPPING: Pool Address => USD to FX Rate (uint256)
    mapping(address => uint256) public poolFxRates;

    // MAPPING: Pool Address => Last Update Timestamp (uint256)
    mapping(address => uint256) public lastFxUpdateTimestamps;

    // MAPPING: Pool Address => Is Whitelisted (bool)
    mapping(address => bool) public whitelistedPools;

    // The pulled ETH -> USD rate. Updated atomically before CDP interactions.
    uint256 public ethUsdPrice;
    uint256 public lastEthUpdateTimestamp;

    mapping(address => bool) public authorizedBots;

    modifier isAlive() {
        if (!live) revert OracleNoLongerAlive();
        _;
    }

    modifier onlyBot() {
        if (!authorizedBots[msg.sender] && msg.sender != owner()) revert UnauthorizedBot();
        _;
    }

    modifier onlyWhitelistedPool(address _pool) {
        if (!whitelistedPools[_pool]) revert PoolNotWhitelisted();
        _;
    }

    /**
     * @param _initialBot The bot address that pushes prices
     */
    constructor(address _initialBot) Ownable(msg.sender) {
        live = true;
        authorizedBots[_initialBot] = true;

        emit BotStatusChanged(_initialBot, true);
    }

    /// *************************
    /// * Write Functions (Push/Pull) *
    /// *************************

    /**
     * @notice Pushes a new rate into the mapping for a specific CDP Pool.
     */
    function updateFxRate(address _pool, uint256 _newRate) external onlyBot isAlive onlyWhitelistedPool(_pool) {
        if (_newRate == 0) revert InvalidRate();

        poolFxRates[_pool] = _newRate;
        lastFxUpdateTimestamps[_pool] = block.timestamp;

        emit FxRateUpdated(msg.sender, _pool, _newRate);
    }

    /**
     * @notice (PULL) Updates the ETH/USD price.
     */
    function updateEthPrice(uint256 currentPrice) external onlyBot isAlive {
        if (currentPrice == 0) revert InvalidRate();

        ethUsdPrice = currentPrice;
        lastEthUpdateTimestamp = block.timestamp;

        emit EthPriceUpdated(msg.sender, currentPrice);
    }

    /// *******************
    /// * Admin Functions *
    /// *******************

    function setPoolWhitelist(address _pool, bool _status) external onlyOwner {
        whitelistedPools[_pool] = _status;
        if (_status == false) {
            poolFxRates[_pool] = 0;
            lastFxUpdateTimestamps[_pool] = 0;
        }
        emit PoolWhitelistUpdated(_pool, _status);
    }

    function setBotAuthorization(address _bot, bool _status) external onlyOwner {
        authorizedBots[_bot] = _status;
        emit BotStatusChanged(_bot, _status);
    }

    function killOracle() external onlyOwner {
        live = false;
        emit OracleKilled(msg.sender);
    }

    /// **************************
    /// * Core Routing Logic *
    /// **************************

    /**
     * @notice Mimics Chainlink's latestRoundData.
     * Automatically routes the correct FX rate based on `msg.sender`.
     */
    function latestRoundData()
        external
        view
        isAlive
        onlyWhitelistedPool(msg.sender)
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        uint256 currentFxRate = poolFxRates[msg.sender];
        uint256 lastFxUpdate = lastFxUpdateTimestamps[msg.sender];
        uint256 currentEthPrice = ethUsdPrice;

        if (currentFxRate == 0 || currentEthPrice == 0) revert InvalidRate();

        // Security: Ensure neither price has gone stale
        if (block.timestamp - lastFxUpdate > 86400) revert RateStale();
        if (block.timestamp - lastEthUpdateTimestamp > 86400) revert RateStale();

        // MATH: (ETH_USD * 10^8) / USD_FX
        uint256 ethFxPrice = currentEthPrice.mulDiv(10 ** decimals, currentFxRate);

        if (ethFxPrice > uint256(type(int256).max)) revert InvalidInt256();

        return (1, int256(ethFxPrice), lastFxUpdate, block.timestamp, 1);
    }

    /**
     * @notice Helper function for Frontends/AI Agents to read the price for a specific pool.
     */
    function getEthPriceForPool(address _pool) external view isAlive onlyWhitelistedPool(_pool) returns (uint256) {
        uint256 currentFxRate = poolFxRates[_pool];
        if (currentFxRate == 0 || ethUsdPrice == 0) revert InvalidRate();
        return ethUsdPrice.mulDiv(10 ** decimals, currentFxRate);
    }
}
