// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {HybridFiatPriceFeed} from "../src/oracle/HybridFiatPriceFeed.sol";
import {MultiFiatFactory} from "../src/MultiFiatFactory.sol";
import {MultiFiatRouter} from "../src/MultiFiatRouter.sol";
import {IMultiFiatFactory} from "../src/interfaces/IMultiFiatFactory.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockWETH is ERC20 {
    constructor() ERC20("Mock WETH", "WETH") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MultixScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy WETH
        MockWETH weth = new MockWETH();

        // 2. Deploy Oracle
        HybridFiatPriceFeed oracle = new HybridFiatPriceFeed(deployer, deployer);

        // 3. Deploy Factory
        MultiFiatFactory factory = new MultiFiatFactory(address(weth), address(oracle));

        // 4. Deploy Router
        MultiFiatRouter router = new MultiFiatRouter(address(factory));

        // 5. Set Router
        factory.setRouter(address(router));

        // 6. Allow factory as oracle bot
        oracle.setBotAuthorization(address(factory), true);

        // 7. Create GBP Market
        IMultiFiatFactory.TokenParams memory tParamsGbp =
            IMultiFiatFactory.TokenParams({country: "GB", currency: "GBP"});

        IMultiFiatFactory.BorrowParams memory bParams = IMultiFiatFactory.BorrowParams({
            minBorrowAmount: 10000,
            minCollatAmount: 10000,
            safeLtvBp: 7000,
            liquidationLtvBp: 7500,
            liquidationPenaltyBp: 500,
            borrowRatePerYearBp: 1000
        });

        (address gbpStable, address gbpPool) = factory.createMarket(tParamsGbp, bParams);

        // 8. Set Prices
        oracle.updateEthPrice(1000 * 1e8);
        oracle.updateFxRate(gbpPool, 13e7); // 1.3 USD per GBP

        vm.stopBroadcast();

        // Logs
        console2.log("Deployer:", deployer);
        console2.log("WETH:", address(weth));
        console2.log("Oracle:", address(oracle));
        console2.log("Factory:", address(factory));
        console2.log("Router:", address(router));
        console2.log("GBP Stable:", gbpStable);
        console2.log("GBP Pool:", gbpPool);
    }
}
