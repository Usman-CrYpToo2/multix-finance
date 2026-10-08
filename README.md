# MultiX Finance

[![CI](https://github.com/Usman-CrYpToo2/multix-finance/actions/workflows/test.yml/badge.svg)](https://github.com/Usman-CrYpToo2/multix-finance/actions/workflows/test.yml)

A multi-currency CDP protocol on [Somnia](https://somnia.network). Users lock
WETH and borrow synthetic fiat stablecoins (GBP, USD, EUR and PKR), each issued
by its own isolated market. A hybrid oracle accepts prices from a keeper bot or
from Somnia Agents, a validator-consensus HTTP fetch made on-chain. Stablecoins
bridge to Ethereum Sepolia over a Hyperlane warp route.

## Architecture

| Contract | Responsibility |
|---|---|
| [`MultiFiatFactory`](src/MultiFiatFactory.sol) | Deploys a `Stablecoin` and its paired `CDPEngine` per currency with CREATE2, and whitelists the new market on the oracle |
| [`MultiFiatRouter`](src/MultiFiatRouter.sol) | Single user entry point. Resolves the market for a stablecoin and forwards `msg.sender` as the account |
| [`CDPEngine`](src/CDPEngine.sol) | One per market. Collateral and debt accounting, interest accrual, LTV checks, partial and full liquidation |
| [`Stablecoin`](src/token/Stablecoin.sol) | 18-decimal ERC-20. Mint and burn restricted to its `CDPEngine` |
| [`HybridFiatPriceFeed`](src/oracle/HybridFiatPriceFeed.sol) | Shared oracle with a Chainlink-style `latestRoundData()`. Combines a global ETH/USD price with a per-market FX rate |

```
User ──► MultiFiatRouter ──► CDPEngine (GBP) ──► Stablecoin (ST_GBP)
                        ├──► CDPEngine (USD) ──► Stablecoin (ST_USD)
                        ├──► CDPEngine (EUR) ──► ...
                        └──► CDPEngine (PKR) ──► ...
                                  │
                                  ▼ latestRoundData()
                          HybridFiatPriceFeed ◄── keeper bot (push)
                                              ◄── Somnia Agents JSON API (pull)

Stablecoin (Somnia) ◄──► HypERC20Collateral ══ Hyperlane ══► HypERC20 (Sepolia)
```

## Protocol mechanics

### Positions

| Parameter | Bounds enforced in `CDPEngine` | GBP market | USD market |
|---|---|---|---|
| Safe LTV (borrow and withdraw limit) | 40% to 70% | 70% | 70% |
| Liquidation LTV | above safe LTV, at most 90% | 75% | 80% |
| Liquidation penalty | at most 10% | 5% | 5% |
| Borrow APR | at most 15% | 10% | 6% |

Collateral value comes from the oracle in the market's currency:
`collateral × price / 10^8`. Borrowing and withdrawing are allowed while the
position stays within the safe LTV.

### Debt and interest

Debt is held as shares of the market's total debt, so interest accrues to every
borrower pro rata without per-account updates. Interest accrues lazily on every
state-changing call from a per-second rate derived from the APR. Of each accrual,
25% is minted to the owner and 25% to an internal reserve that absorbs dust left
by near-full repayments; the full amount is added to total debt.

### Liquidation

A position is liquidatable once its debt exceeds the liquidation LTV.

| LTV | Outcome |
|---|---|
| Liquidation LTV to 100% | Partial: the liquidator repays exactly enough to restore the safe LTV and receives that value plus the penalty in collateral |
| 100% or more | Full: the liquidator repays the whole debt and receives all collateral |

### Oracle

`price(ETH in fiat) = ethUsdPrice × 10^8 / fxRate[market]`

| Property | Behaviour |
|---|---|
| Access | `latestRoundData()` serves only whitelisted markets, each reading its own FX rate |
| Staleness | Reverts if the ETH/USD price or the market's FX rate is older than 24 hours |
| Push updates | `updateEthPrice` / `updateFxRate` from authorized bots |
| Pull updates | `requestEthPriceUpdate` / `requestFxRateUpdate` ask Somnia Agents' JSON API agent to fetch a configured URL; validators agree on the value and the platform calls `handleResponse` |
| Migration | `CDPEngine.setOracle` repoints a market without redeploying it |
| Kill switch | `killOracle()` permanently disables reads |

Design notes for the agent path: [`ai_oracle.md`](ai_oracle.md).

### Cross-chain

The GBP stablecoin is locked in a `HypERC20Collateral` router on Somnia and minted
as `wGBP` (a synthetic `HypERC20`) on Sepolia, using Hyperlane's default ISM and
relayers. Configuration is in [`hyperlane/`](hyperlane); the deployment record is
in [`hyperlaneCCT_walkthrough.md`](hyperlaneCCT_walkthrough.md).

## Deployments

Somnia testnet (chain ID 50312). Collateral is a mock WETH.

| Contract | Address |
|---|---|
| Router | [`0x7A8A5221E7855FE315E494b84A9aEF8686fb4513`](https://shannon-explorer.somnia.network/address/0x7A8A5221E7855FE315E494b84A9aEF8686fb4513) |
| Factory | [`0xe26535AbbC2012eBF9e73c4babE0aF1E074769bf`](https://shannon-explorer.somnia.network/address/0xe26535AbbC2012eBF9e73c4babE0aF1E074769bf) |
| Oracle | [`0x0E118934456f0CA503a409C98b2e13B00747DF6a`](https://shannon-explorer.somnia.network/address/0x0E118934456f0CA503a409C98b2e13B00747DF6a) |

| Market | Stablecoin | CDPEngine |
|---|---|---|
| GBP | [`0xD123...7945`](https://shannon-explorer.somnia.network/address/0xD1233bEa81A447aF6DBC5FB6B74EeD92F9397945) | [`0xDad2...19fF`](https://shannon-explorer.somnia.network/address/0xDad2fDd5fCc373f28Bf68665d41C2875C5e019fF) |
| USD | [`0x74Ac...AAa1`](https://shannon-explorer.somnia.network/address/0x74Ac78F74e5cb03975Ef9D7b5A15A3F74Ab9AAa1) | [`0xa6B1...9266`](https://shannon-explorer.somnia.network/address/0xa6B1226beDaFE8c3912F8d0a5c3e467700999266) |
| EUR | [`0x57EE...8B03`](https://shannon-explorer.somnia.network/address/0x57EE5f7a7d04F7767e4aD0a72625daCA03E78B03) | [`0x3104...fCC4`](https://shannon-explorer.somnia.network/address/0x3104AF8e0671194210810E54854dd15Af200fCC4) |
| PKR | [`0x0f26...F6eE`](https://shannon-explorer.somnia.network/address/0x0f2643F0bc1A16e33b26eD76C7D38aC9A6c1F6eE) | [`0x748b...0bF1`](https://shannon-explorer.somnia.network/address/0x748b4770494Eb691CF19781CcC064515887e0bF1) |

Hyperlane GBP route: Somnia collateral router
[`0xDB51...Ff91`](https://shannon-explorer.somnia.network/address/0xDB51C9E44423343044a808c99fAF20766013Ff91),
Sepolia `wGBP`
[`0x21fd...0e16`](https://sepolia.etherscan.io/address/0x21fd42f82c14Ec1E2feEfe111C40C3bcc5690e16).

## Usage

Requires [Foundry](https://book.getfoundry.sh/getting-started/installation) and Node.js.

```bash
git clone --recurse-submodules https://github.com/Usman-CrYpToo2/multix-finance.git
cd multix-finance
forge test
```

### Local deployment

```bash
anvil                          # in a separate terminal
./deploy-local.sh              # deploys all four markets and pushes live prices
cd frontend && npm install && npm run dev:local
```

`deploy-local.sh` fetches ETH/USD and FX rates (Coinbase, CoinGecko, Frankfurter,
with static fallbacks) and writes `frontend/constants/addresses.local.ts`.
`./deploy-local.sh prices` refreshes prices, and `ETH_PRICE=1500 ./deploy-local.sh prices`
forces a price to exercise liquidations. Full guide: [`instructionlocal.md`](instructionlocal.md).

### Somnia testnet

```bash
# .env needs RPC_URL (Somnia testnet) and PRIVATE_KEY
./deploy.sh                    # deploy, then regenerate frontend/constants/addresses.ts
cd frontend && npm install && npm run dev
```

## Frontend

Next.js, wagmi, viem and Reown AppKit. Pages for borrowing (deposit, borrow,
repay, withdraw with projected LTV), markets, a test-token faucet, and the
Hyperlane bridge with live transfer tracking. The app targets Somnia testnet or
a local anvil chain via `NEXT_PUBLIC_NETWORK`.

## Testing

9 Foundry tests: deposits and withdrawals, borrowing with interest accrual,
repayment and burning, liquidation after debt growth, isolation between markets,
multi-borrower repayment after one year, and oracle price composition. CI runs
`forge build --sizes` and `forge test` on every push.

## Repository structure

| Path | Contents |
|---|---|
| [`src/`](src) | Contracts and interfaces |
| [`test/`](test) | Protocol and oracle tests |
| [`script/`](script) | Foundry deployment script |
| [`frontend/`](frontend) | Web application |
| [`hyperlane/`](hyperlane) | Warp-route configuration and CLI scripts |
| [`deploy.sh`](deploy.sh), [`deploy-local.sh`](deploy-local.sh) | Deployment and address generation |

## Team

Built as a final-year project by Muhammad Usman Atique and
[Zaid Rana](https://github.com/zaid-rana).

| Contributor | Areas |
|---|---|
| Muhammad Usman Atique | Protocol contracts, hybrid oracle and Somnia Agents integration, tests, deployment scripts, landing page and borrow flow, bridge fixes, EUR and PKR markets |
| Zaid Rana | Hyperlane warp-route setup and bridge page, markets and faucet pages, repay and withdraw flows, live price hooks |

## Security

Not audited. The oracle is operated by trusted keepers and the market parameters
are owner-controlled; treat this deployment as a testnet prototype.
