// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IStablecoin } from "../interfaces/IStablecoin.sol";

contract Stablecoin is  IStablecoin, ERC20, Ownable  {
    address private _mintAndBurnProtocol;
    

    modifier onlyValidProtocol() {
        _onlyValidProtocol();
        _;
    }

    constructor(
        address _owner,
        address _protocol,
        string memory country,
        string memory currency
    ) ERC20(string.concat("Stable_", country), string.concat("ST_", currency)) Ownable(_owner) {
        require(_protocol != address(0), "Invalid protocol");
        _mintAndBurnProtocol = _protocol;
    }

    /// ******************
    /// * View functions *
    /// ******************

    function getProtocols() external view returns (address) {
        return _mintAndBurnProtocol;
    }

    function isValidProtocol(address _protocol) external view returns (bool) {
        return _protocol == _mintAndBurnProtocol;
    }

    /// *******************
    /// * Owner functions *
    /// *******************
    function setMintAndBurnProtocol(address _protocol) external onlyOwner {
        require(_protocol != address(0), "Invalid protocol");
        require(_protocol != _mintAndBurnProtocol, "Protocol already set");
        _mintAndBurnProtocol = _protocol;
        emit NewMintAndBurnProtocol(_protocol, msg.sender);
    }

    /// ***********************
    /// * Protocols functions *
    /// ***********************

    /// @dev Protocols can only mint token to themself.
    function mint(address account, uint256 _amount) external onlyValidProtocol {
        _mint(account, _amount);

        emit Mint(msg.sender, account, _amount);
    }

    /// @dev Protocols can only burn token themself, no slashing others.
    function burn(address account, uint256 _amount) external onlyValidProtocol {
        _burn(account, _amount);

        emit Burn(msg.sender, account, _amount);
    }

    /// *********
    /// * ERC20 *
    /// *********

    function decimals() public pure override(ERC20, IStablecoin) returns (uint8) {
        return 6;
    }

    /// ***********
    /// * Private *
    /// ***********

    function _onlyValidProtocol() private view {
        require(msg.sender == _mintAndBurnProtocol, "Invalid protocol");
    }
}