// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IStablecoin {
    /// *****************
    /// * Events *
    /// *****************
    event NewMintAndBurnProtocol(
        address indexed _protocol,
        address indexed _sender
    );
    event BurnByProtocol(
        address indexed _protocol,
        address indexed _receiver,
        uint256 _amount
    );
    event MintByProtocol(
        address indexed _protocol,
        address indexed _receiver,
        uint256 _amount
    );

    /// ******************
    /// * View functions *
    /// ******************
    function getProtocols() external view returns (address);

    function isValidProtocol(address _protocol) external view returns (bool);

    /// *******************
    /// * Owner functions *
    /// *******************
    function setMintAndBurnProtocol(address _protocol) external;

    /// ***********************
    /// * Protocols functions *
    /// ***********************
    function mintToValidProtocol(uint256 _amount) external;

    function burnFromValidProtocol(uint256 _amount) external;

    /// *********
    /// * ERC20 *
    /// *********
    function decimals() external pure returns (uint8);
}
