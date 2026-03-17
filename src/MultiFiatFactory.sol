// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./CDPEngine.sol";
import {Stablecoin} from "./token/Stablecoin.sol";
import {ICDPEngine} from "./interfaces/ICDPEngine.sol";
import {IMultiFiatFactory} from "./interfaces/IMultiFiatFactory.sol";

contract MultiFiatFactory is IMultiFiatFactory, Ownable {
    // --- State Variables ---
    address public immutable WETH;
    address public immutable MASTER_ORACLE;
    address public ROUTER;

    // Maps StableCoin address => Collateral Asset (WETH) => CDPEngine Address
    mapping(address => mapping(address => address)) public getMarket;

    // Array to keep track of all deployed CDPs
    address[] public allMarkets;

    /// @notice Set the global WETH and Master Oracle addresses upon factory deployment
    constructor(address _weth, address _masterOracle) Ownable(msg.sender) {
        require(_weth != address(0), "Invalid WETH Address");
        require(_masterOracle != address(0), "Invalid Oracle Address");
        WETH = _weth;
        MASTER_ORACLE = _masterOracle;
    }

    function setRouter(address routerAddr) external onlyOwner {
        require(routerAddr != address(0), "zero address");
        ROUTER = routerAddr;
        emit routerUpdated(msg.sender, routerAddr);
    }

    /// @notice Deploys a new Synthetic Fiat Token, its paired CDP Engine, and registers it to the Oracle
    function createMarket(TokenParams calldata tParams, BorrowParams calldata bParams)
        external
        onlyOwner
        returns (address stableCoin, address cdpEngine)
    {
        // 1. Generate CREATE2 Salt for the StableCoin (Country + Currency)
        bytes32 stableSalt = keccak256(abi.encodePacked(tParams.country, tParams.currency));

        // 2. Deploy StableCoin via CREATE2
        Stablecoin newCoin = new Stablecoin{salt: stableSalt}(
            address(this), // Temporary Owner
            address(this), // Temporary Protocol
            tParams.country,
            tParams.currency
        );
        stableCoin = address(newCoin);

        // 3. Dynamically fetch Oracle decimals and calculate the conversion constant (e.g., 10**8)
        uint8 oracleDecimals = IHybridFiatPriceFeed(MASTER_ORACLE).decimals();
        uint256 conversionConstant = 10 ** oracleDecimals;

        // 4. Generate CREATE2 Salt for the CDPEngine (StableCoin + WETH)
        bytes32 borrowSalt = keccak256(abi.encodePacked(stableCoin, WETH));

        // 5. Pack the constructor parameters for the CDP Engine
        ICDPEngine.InitailConsParams memory initParams = ICDPEngine.InitailConsParams({
            StableCoin: stableCoin,
            collateralAsset: WETH,
            collatToFiatOracle: MASTER_ORACLE,
            router: ROUTER,
            owner: msg.sender, // The caller becomes the true owner of the CDPEngine
            minBorrowAmount: bParams.minBorrowAmount,
            minCollatAmount: bParams.minCollatAmount,
            safeLtvBp: bParams.safeLtvBp,
            liquidationLtvBp: bParams.liquidationLtvBp,
            liquidationPenaltyBp: bParams.liquidationPenaltyBp,
            borrowRatePerYearBp: bParams.borrowRatePerYearBp,
            collatTofiatConversion: conversionConstant // Dynamically injected!
        });

        // 6. Deploy CDPEngine Engine via CREATE2
        CDPEngine newBorrow = new CDPEngine{salt: borrowSalt}(initParams);
        cdpEngine = address(newBorrow);

        // 7. --- ORACLE AUTOMATION ---
        // The Factory calls the Oracle to whitelist this new CDPEngine pool.
        // *CRITICAL: The Oracle contract must have this Factory's address granted the `onlyBot` role.*
        IHybridFiatPriceFeed(MASTER_ORACLE).setPoolWhitelist(cdpEngine, true);

        // 8. Transfer rights from the Factory to the actual contracts/owner
        newCoin.setMintAndBurnProtocol(cdpEngine);
        newCoin.transferOwnership(msg.sender);

        // 9. Update Factory State
        getMarket[stableCoin][WETH] = cdpEngine;
        getMarket[WETH][stableCoin] = cdpEngine;
        allMarkets.push(cdpEngine);

        emit MarketCreated(stableCoin, WETH, cdpEngine, allMarkets.length);
    }

    // --- Getter Functions ---

    /// @notice Returns the total number of markets (CDPs) deployed by this factory
    function allMarketsLength() external view returns (uint256) {
        return allMarkets.length;
    }

    /// @notice Fetches a specific market by its index
    function getMarketAtIndex(uint256 index) external view returns (address) {
        require(index < allMarkets.length, "Index out of bounds");
        return allMarkets[index];
    }
}
