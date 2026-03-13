// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IBorrowStable {
    struct PauseOperations {
        bool pauseDeposit;
        bool pauseWithdraw;
        bool pauseBorrow;
    }

    struct Account {
        uint256 creditShares;
        uint256 collateral;
    }

    struct InitialParams {
        uint256 debtCap;
        uint256 minBorrowAmount;
        uint16 safeLtvBp;
        uint16 liquidationLtvBp;
        uint16 liquidationPenaltyBp;
        uint16 borrowRatePerYearBp;
    }
}
