// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// openzeppelin imports
import {
    EnumerableSet
} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
// interface
import {IBorrowStable} from "./interfaces/IBorrowStable.sol";
import {IStablecoin} from "./interfaces/IStablecoin.sol";
import {
    IHybridFiatPriceFeed
} from "./interfaces/Oracle/IHybridFiatPriceFeed.sol";

contract BorrowStable is IBorrowStable, Ownable, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;
    using SafeERC20 for IERC20;

    /// *************
    /// * Constants *
    /// *************
    // Standard unit for percentage math (1% = 100 basis points).
    uint16 private constant BASIS_POINTS = 10000; // 100.0%

    // MAX_BORROW_APR_BP: Max interest borrower pays per year.
    uint16 private constant MAX_BORROW_APR_BP = 1500; // 15.00%

    // MAX_PENALTY_BP: Max liquidation penalty to avoid predatory liquidations.
    uint16 private constant MAX_PENALTY_BP = 1000; // 10.00%

    // Valid bounds for Loan-To-Value (LTV) configuration.
    // Keeps user LTV within safe range.
    uint16 private constant MIN_SAFE_LTV_BP = 4000; // 40.00%
    uint16 private constant MAX_SAFE_LTV_BP = 7000; // 70.00%

    /// @dev 24 hours * 60 minutes * 60 seconds
    uint32 private constant SECONDS_PER_DAY = 86_400;
    uint64 private constant DAYS_PER_YEAR = 365;

    // Blocks dust-level deposits or borrows.
    uint256 internal constant MIN_OPERATION_AMOUNT = 10_000;

    /// *****************
    /// * Storage slots *
    /// *****************

    /// @dev LTV and liquidation parameters.
    LtvConfig public ltvConfig;

    /// @dev Collateral, oracle and min-amount configuration.
    CollateralConfig public collateralConfig;

    /// @dev Aggregate accounting for all users.
    AggregateState public aggregateState;

    /// @dev Internal balance used for operational accounting.
    uint256 internal internalOperationBalance;

    /// @dev Last day (in days since epoch) when interest was accrued.
    uint32 public lastAccrualDay;

    /// @dev Daily borrow rate in basis points (derived from APR).
    uint256 public borrowRatePerDay;

    IStablecoin public immutable StableCoin;

    address public immutable collateralAsset; // collateral token (e.g. WETH)

    EnumerableSet.AddressSet private _activeLoans;
    mapping(address => Account) internal _accounts;

    constructor(InitailConsParams memory params) Ownable(params.owner) {
        require(
            params.minBorrowAmount >= MIN_OPERATION_AMOUNT &&
                params.minCollatAmount >= MIN_OPERATION_AMOUNT,
            "LessThanMinOpAmount"
        );

        _validateLtvConfig(
            params.safeLtvBp,
            params.liquidationLtvBp,
            params.liquidationPenaltyBp
        );

        require(
            params.borrowRatePerYearBp <= MAX_BORROW_APR_BP,
            "BorrowRateTooHigh"
        );

        StableCoin = IStablecoin(params.StableCoin);
        collateralAsset = params.collateralAsset;

        ltvConfig = LtvConfig({
            safeLtvBp: params.safeLtvBp,
            liquidationLtvBp: params.liquidationLtvBp,
            liquidationPenaltyBp: params.liquidationPenaltyBp
        });

        collateralConfig = CollateralConfig({
            collatToFiatOracle: IHybridFiatPriceFeed(params.collatToFiatOracle),
            minCollatAmount: params.minCollatAmount,
            minBorrowAmount: params.minBorrowAmount,
            collatTofiatConversionConstant: params.collatTofiatConversion
        });

        // Convert yearly rate in basis points to a per-day rate.
        borrowRatePerDay = uint256(params.borrowRatePerYearBp).mulDiv(
            10 ** 14,
            DAYS_PER_YEAR,
            Math.Rounding.Ceil
        );

        lastAccrualDay = _getDays();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _getDays() private view returns (uint32) {
        return uint32(block.timestamp) / SECONDS_PER_DAY;
    }

    function _validateLtvConfig(
        uint16 _safeLtvBp,
        uint16 _liquidationLtvBp,
        uint16 _liquidationPenaltyBp
    ) internal pure {
        require(
            _safeLtvBp >= MIN_SAFE_LTV_BP && _safeLtvBp <= MAX_SAFE_LTV_BP,
            "SafeLtvBpOutOfRange"
        );
        require(
            _liquidationLtvBp <= BASIS_POINTS - MAX_PENALTY_BP,
            "LiquidationLtvBpTooLarge"
        );
        require(
            _liquidationPenaltyBp <= MAX_PENALTY_BP,
            "LiquidationPenaltyBpTooLarge"
        );
        require(_safeLtvBp < _liquidationLtvBp, "SafeLtvBpTooLarge");
    }
}
