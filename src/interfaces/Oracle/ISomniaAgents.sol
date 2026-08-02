// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Somnia Agents platform interface
/// @notice Mirrors the on-chain agent-invocation platform documented at
/// https://docs.somnia.network/agents/invoking-agents/from-solidity - a contract
/// submits an ABI-encoded request to a base agent (e.g. the JSON API Request agent),
/// a decentralized subcommittee of network nodes executes it off-chain, and the
/// validated, consensus-reached result is delivered asynchronously to the
/// requester's callback.
enum ConsensusType {
    Majority,
    Threshold
}

enum ResponseStatus {
    None, // 0 - default zero value (uninitialized storage)
    Pending, // 1 - awaiting responses
    Success, // 2 - consensus reached normally
    Failed, // 3 - validators reported failure
    TimedOut // 4 - request timed out

}

struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;
    uint256 threshold;
    uint256 createdAt;
    uint256 deadline;
    ResponseStatus status;
    ConsensusType consensusType;
    uint256 remainingBudget;
    uint256 perAgentBudget;
}

/// @notice The Somnia Agents platform contract - request entrypoint.
interface IAgentRequester {
    event RequestCreated(
        uint256 indexed requestId, uint256 indexed agentId, uint256 perAgentBudget, bytes payload, address[] subcommittee
    );
    event RequestFinalized(uint256 indexed requestId, ResponseStatus status);
    event SubcommitteePaid(uint256 indexed requestId, uint256 totalPaid, uint256 perMember);
    event CommitteeDepositFailed(uint256 indexed requestId, uint256 attemptedAmount);

    function createRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes calldata payload)
        external
        payable
        returns (uint256 requestId);

    function createAdvancedRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 subcommitteeSize,
        uint256 threshold,
        ConsensusType consensusType,
        uint256 timeout
    ) external payable returns (uint256 requestId);

    function getRequest(uint256 requestId) external view returns (Request memory);
    function hasRequest(uint256 requestId) external view returns (bool);
    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subcommitteeSize) external view returns (uint256);
}

/// @notice Implemented by any contract that wants to receive an agent's result.
interface IAgentRequesterHandler {
    function handleResponse(uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory details)
        external;
}

/// @notice The built-in "JSON API Request" base agent - fetches and decodes a field
/// from an external HTTP JSON API. `selector` is a dot-notation path into the JSON body.
interface IJsonApiAgent {
    function fetchUint(string calldata url, string calldata selector, uint8 decimals) external returns (uint256);
    function fetchInt(string calldata url, string calldata selector, uint8 decimals) external returns (int256);
    function fetchString(string calldata url, string calldata selector) external returns (string memory);
    function fetchBool(string calldata url, string calldata selector) external returns (bool);
}
