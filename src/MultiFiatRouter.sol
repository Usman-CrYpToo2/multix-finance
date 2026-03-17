// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMultiFiatFactory} from "./interfaces/IMultiFiatFactory.sol";
import {IBorrowStable} from "./interfaces/IBorrowStable.sol";
import {IMultiFiatRouter} from "./interfaces/IMultiFiatRouter.sol";

contract MultiFiatRouter is IMultiFiatRouter {
    using SafeERC20 for IERC20;

    address public immutable factory;
    address public immutable WETH;

    constructor(address _factory) {
        require(_factory != address(0), "Invalid factory");
        factory = _factory;
        // Fetch WETH directly from the factory to ensure 100% alignment
        WETH = IMultiFiatFactory(_factory).WETH();
    }

    /// @dev Internal helper to fetch and validate the market address
    function _getValidMarket(address stableCoin) internal view returns (address) {
        address pool = IMultiFiatFactory(factory).getMarket(stableCoin, WETH);
        if (pool == address(0)) revert MarketDoesNotExist(stableCoin);
        return pool;
    }

    /// @notice Deposit collateral into a specific fiat market.
    /// @param stableCoin The address of the synthetic fiat token (e.g., GBP, PKR)
    /// @param receiver Address whose account receives the collateral credit
    /// @param amount Amount of WETH to deposit
    function depositCollateral(address stableCoin, address receiver, uint256 amount) external {
        address pool = _getValidMarket(stableCoin);

        // Router pulls WETH from the user, then approves the pool, then deposits.
        IERC20(WETH).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(WETH).forceApprove(pool, amount);

        IBorrowStable(pool).depositCollateral(receiver, amount);
    }

    /// @notice Withdraw collateral from a specific fiat market.
    function withdrawCollateral(address stableCoin, uint256 amount) external {
        address pool = _getValidMarket(stableCoin);

        // Router passes msg.sender as the supplier so the pool knows whose collateral to reduce.
        IBorrowStable(pool).withdrawCollateral(msg.sender, amount);
    }

    /// @notice Borrow synthetic fiat against deposited collateral.
    function borrowFiat(address stableCoin, uint256 stablecoinAmount) external {
        address pool = _getValidMarket(stableCoin);

        // Router passes msg.sender as the borrower. The pool will mint directly to them.
        IBorrowStable(pool).borrowFiat(msg.sender, stablecoinAmount);
    }

    /// @notice Repay synthetic fiat debt.
    /// @param account The address of the CDP owner being repaid
    function repayFiat(address stableCoin, address account, uint256 stablecoinAmount) external {
        address pool = _getValidMarket(stableCoin);

        // Router passes msg.sender as the supplier of the funds.
        IBorrowStable(pool).repayFiat(msg.sender, account, stablecoinAmount);
    }

    /// @notice Liquidate an undercollateralized CDP.
    /// @param account The address of the CDP to liquidate
    function liquidate(address stableCoin, address account) external {
        address pool = _getValidMarket(stableCoin);

        // The pool calculates the exact dynamic penalty amount and pulls it directly from msg.sender.
        IBorrowStable(pool).liquidate(msg.sender, account);
    }
}
