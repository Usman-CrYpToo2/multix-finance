// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IHybridFiatPriceFeed} from "./Oracle/IHybridFiatPriceFeed.sol";


interface IBorrowStable {

    struct Account {
        uint256 creditShares;
        uint256 collateral;
    }


    /// @dev Configuration for LTV and liquidation risk parameters.
    struct LtvConfig {
        uint16 safeLtvBp;
        uint16 liquidationLtvBp;
        uint16 liquidationPenaltyBp;
    }

    /// @dev Configuration related to collateral asset and price feed.
    struct CollateralConfig {
        IHybridFiatPriceFeed collatToFiatOracle;
        uint256 minCollatAmount;
        uint256 minBorrowAmount;
        uint256 collatTofiatConversionConstant;
    }

    /// @dev Aggregate protocol-wide accounting values.
    struct AggregateState {
        uint256 totalCollateral;
        uint256 totalDebt;
        uint256 totalCredit;
    }

    // constructor param
    struct InitailConsParams {
        address StableCoin;
        address collateralAsset;
        address collatToFiatOracle;

        address owner;

        // config setting 
        uint256 minBorrowAmount;
        uint256 minCollatAmount;
        uint16 safeLtvBp;
        uint16 liquidationLtvBp;
        uint16 liquidationPenaltyBp; 
        uint16 borrowRatePerYearBp;
        uint256 collatTofiatConversion;
    }
}
