// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IStablecoin is IERC20 {
    /// *****************
    /// * Events *
    /// *****************
    event NewMintAndBurnProtocol(address indexed _protocol, address indexed _sender);
    event Burn(address indexed _protocol, address indexed _receiver, uint256 _amount);
    event Mint(address indexed _protocol, address indexed _receiver, uint256 _amount);

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
    function mint(address account, uint256 _amount) external;

    function burn(address account, uint256 _amount) external;

    /// *********
    /// * ERC20 *
    /// *********
    function decimals() external pure returns (uint8);
}
