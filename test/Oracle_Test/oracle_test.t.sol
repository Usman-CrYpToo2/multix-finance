// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {HybridFiatPriceFeed} from "../../src/oracle/HybridFiatPriceFeed.sol";

contract HybridFiatPriceFeedTest is Test {
    HybridFiatPriceFeed internal oracle;

    address internal constant POOL = address(0xBEEF);

    function setUp() public {
        // Use this test contract as the initial bot.
        oracle = new HybridFiatPriceFeed(address(this), address(this));

        // Whitelist the pool so it can read prices.
        oracle.setPoolWhitelist(POOL, true);
    }

    function test_latestRoundData_usesConfiguredEthAndFxPrices() public {
        // Set ETH/USD price to 2000 * 10^8
        uint256 ethPrice = 2065.62e8;
        oracle.updateEthPrice(ethPrice);

        // Set pool FX rate (USD -> GBP) to 1.3 * 10^8
        uint256 gbpFxRate = 1.328e8; // 1.3e8
        oracle.updateFxRate(POOL, gbpFxRate);

        // Call latestRoundData as the pool
        vm.prank(POOL);
        (, int256 answer,,,) = oracle.latestRoundData();

        console.log("latestRoundData answer (ETH/GBP):", uint256(answer));

        // Expected ETH/GBP price: (ETH_USD * 10^8) / USD_GBP
        uint256 expected = (ethPrice * 1e8) / gbpFxRate;

        assertGt(answer, 0);
        assertEq(uint256(answer), expected);
    }
}
