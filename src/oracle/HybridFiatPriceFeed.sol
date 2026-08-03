// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IHybridFiatPriceFeed} from "../interfaces/Oracle/IHybridFiatPriceFeed.sol";
import {
    IAgentRequester,
    IAgentRequesterHandler,
    IJsonApiAgent,
    Request,
    Response,
    ResponseStatus
} from "../interfaces/Oracle/ISomniaAgents.sol";

contract HybridFiatPriceFeed is IHybridFiatPriceFeed, IAgentRequesterHandler, Ownable {
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

    /// **************************************
    /// * AI Oracle (Somnia Agents) Storage *
    /// **************************************
    // https://docs.somnia.network/agents/invoking-agents/from-solidity - platform request entrypoint.
    IAgentRequester public somniaAgents;

    // The built-in "JSON API Request" base agent id on Somnia Agents (Testnet).
    // https://docs.somnia.network/agents/base-agents/json-api-request
    uint256 public jsonApiAgentId;

    // Subcommittee size / per-agent reward used to size the request deposit.
    uint256 public agentSubcommitteeSize = 3;
    uint256 public agentPerRewardWei = 0.03 ether;

    enum AiRequestKind {
        None,
        Fx,
        Eth
    }

    struct AiRequest {
        AiRequestKind kind;
        address pool; // unused for Eth requests
    }

    // MAPPING: Somnia Agents requestId => pending AI price request
    mapping(uint256 => AiRequest) public pendingAiRequests;

    // MAPPING: Pool Address => JSON API URL to fetch its USD FX rate from
    mapping(address => string) public poolApiUrl;
    // MAPPING: Pool Address => dot-notation JSON selector for the FX rate field
    mapping(address => string) public poolApiSelector;

    // JSON API URL / selector used to fetch the ETH/USD price
    string public ethApiUrl;
    string public ethApiSelector;

    error InsufficientAgentDeposit();
    error UnauthorizedAgentCallback();
    error UnknownAgentRequest();
    error ApiSourceNotConfigured();
    error AgentRefundFailed();

    event AiFxRateRequested(uint256 indexed requestId, address indexed pool);
    event AiEthPriceRequested(uint256 indexed requestId);
    event AiPriceUpdateFailed(uint256 indexed requestId, AiRequestKind kind, address pool, ResponseStatus status);

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
    constructor(address _initialBot, address owner) Ownable(owner) {
        live = true;
        authorizedBots[_initialBot] = true;

        // Somnia Agents platform contract - Somnia Testnet (chain 50312).
        // https://docs.somnia.network/agents/invoking-agents/from-solidity
        somniaAgents = IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

        // Built-in "JSON API Request" base agent id - Somnia Testnet.
        jsonApiAgentId = 13174292974160097713;

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

    function setPoolWhitelist(address _pool, bool _status) external onlyBot {
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

    /// @notice Points this oracle at a different Somnia Agents platform deployment
    /// (e.g. mainnet instead of testnet). Defaults to the testnet address set in the constructor.
    function setSomniaAgentsPlatform(address _platform) external onlyOwner {
        somniaAgents = IAgentRequester(_platform);
    }

    /// @notice Sets the numeric agentId of the built-in "JSON API Request" base agent
    /// for the configured Somnia Agents platform. Required before any AI price request works.
    function setJsonApiAgentId(uint256 _agentId) external onlyOwner {
        jsonApiAgentId = _agentId;
    }

    function setAgentRequestParams(uint256 _subcommitteeSize, uint256 _perAgentRewardWei) external onlyOwner {
        agentSubcommitteeSize = _subcommitteeSize;
        agentPerRewardWei = _perAgentRewardWei;
    }

    /// @notice Configures where a whitelisted pool's USD FX rate is fetched from.
    /// `_selector` is a dot-notation path into the JSON response body (e.g. "rates.GBP").
    function setPoolApiSource(address _pool, string calldata _url, string calldata _selector)
        external
        onlyOwner
        onlyWhitelistedPool(_pool)
    {
        poolApiUrl[_pool] = _url;
        poolApiSelector[_pool] = _selector;
    }

    /// @notice Configures where the ETH/USD price is fetched from.
    function setEthApiSource(string calldata _url, string calldata _selector) external onlyOwner {
        ethApiUrl = _url;
        ethApiSelector = _selector;
    }

    function killOracle() external onlyOwner {
        live = false;
        emit OracleKilled(msg.sender);
    }

    /// ***************************************
    /// * AI Oracle (Somnia Agents) Functions *
    /// ***************************************
    /// @dev Async request/response flow on top of the same storage the bot-push
    /// functions write to (poolFxRates/lastFxUpdateTimestamps, ethUsdPrice/
    /// lastEthUpdateTimestamp). latestRoundData() and getEthPriceForPool() read that
    /// storage regardless of whether it was last written by a bot push or an AI
    /// agent callback, so their return format/decimals is completely unaffected.
    /// https://docs.somnia.network/agents

    /// @notice Requests a fresh USD FX rate for `_pool` from its configured JSON API
    /// via the Somnia Agents "JSON API Request" base agent. The result is applied to
    /// poolFxRates in `handleResponse` once network consensus is reached.
    function requestFxRateUpdate(address _pool)
        external
        payable
        onlyBot
        isAlive
        onlyWhitelistedPool(_pool)
        returns (uint256 requestId)
    {
        if (bytes(poolApiUrl[_pool]).length == 0) revert ApiSourceNotConfigured();

        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector, poolApiUrl[_pool], poolApiSelector[_pool], decimals
        );

        requestId = _createAgentRequest(payload);
        pendingAiRequests[requestId] = AiRequest({kind: AiRequestKind.Fx, pool: _pool});

        emit AiFxRateRequested(requestId, _pool);
    }

    /// @notice Requests a fresh ETH/USD price from the configured JSON API via the
    /// Somnia Agents "JSON API Request" base agent. The result is applied to
    /// ethUsdPrice in `handleResponse` once network consensus is reached.
    function requestEthPriceUpdate() external payable onlyBot isAlive returns (uint256 requestId) {
        if (bytes(ethApiUrl).length == 0) revert ApiSourceNotConfigured();

        bytes memory payload = abi.encodeWithSelector(IJsonApiAgent.fetchUint.selector, ethApiUrl, ethApiSelector, decimals);

        requestId = _createAgentRequest(payload);
        pendingAiRequests[requestId] = AiRequest({kind: AiRequestKind.Eth, pool: address(0)});

        emit AiEthPriceRequested(requestId);
    }

    function _createAgentRequest(bytes memory _payload) private returns (uint256 requestId) {
        uint256 deposit = somniaAgents.getRequestDeposit() + agentPerRewardWei * agentSubcommitteeSize;
        if (msg.value < deposit) revert InsufficientAgentDeposit();

        requestId = somniaAgents.createRequest{value: deposit}(
            jsonApiAgentId, address(this), this.handleResponse.selector, _payload
        );

        if (msg.value > deposit) {
            (bool ok,) = msg.sender.call{value: msg.value - deposit}("");
            if (!ok) revert AgentRefundFailed();
        }
    }

    /// @notice Callback invoked by the Somnia Agents platform once subcommittee
    /// consensus is reached on a requested price. Writes the same storage the
    /// bot-push functions use, so it feeds latestRoundData() transparently.
    function handleResponse(uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory)
        external
        override
    {
        if (msg.sender != address(somniaAgents)) revert UnauthorizedAgentCallback();

        AiRequest memory pending = pendingAiRequests[requestId];
        if (pending.kind == AiRequestKind.None) revert UnknownAgentRequest();
        delete pendingAiRequests[requestId];

        if (!live || status != ResponseStatus.Success || responses.length == 0) {
            emit AiPriceUpdateFailed(requestId, pending.kind, pending.pool, status);
            return;
        }

        uint256 value = abi.decode(responses[0].result, (uint256));
        if (value == 0) {
            emit AiPriceUpdateFailed(requestId, pending.kind, pending.pool, status);
            return;
        }

        if (pending.kind == AiRequestKind.Fx) {
            poolFxRates[pending.pool] = value;
            lastFxUpdateTimestamps[pending.pool] = block.timestamp;
            emit FxRateUpdated(msg.sender, pending.pool, value);
        } else {
            ethUsdPrice = value;
            lastEthUpdateTimestamp = block.timestamp;
            emit EthPriceUpdated(msg.sender, value);
        }
    }

    /// @notice Accepts deposit refunds forwarded back by the Somnia Agents platform.
    receive() external payable {}

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
