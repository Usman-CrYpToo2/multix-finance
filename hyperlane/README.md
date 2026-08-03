# Hyperlane warp routes for MultiX stablecoins

Scaffolding to bridge MultiX's synthetic fiat stablecoins between **Somnia testnet**
(where the protocol is deployed) and **Ethereum Sepolia**, using Hyperlane
Collateral <-> Synthetic warp routes. Background/rationale: see
`../implement_hyperlane.md` at the repo root.

This directory only contains **config scaffolding** - no live deployment has
been run yet. Nothing here spends gas or touches a real chain until you run
the commands below yourself with a funded key.

## Confirmed ahead of time (no need to re-check)

Both chains already have Hyperlane core contracts deployed and registered by
Abacus Works, so **no `hyperlane core deploy` step is required**:

| Chain (registry name) | Chain ID | Mailbox |
|---|---|---|
| `somniatestnet` | 50312 | `0x7d498740A4572f2B5c6b0A1Ba9d1d9DbE207e89E` |
| `sepolia` | 11155111 | `0xfFAEF09B3cd11D9b20d1a19bECca54EEC2884766` |

(Source: [hyperlane-registry](https://github.com/hyperlane-xyz/hyperlane-registry) `chains/somniatestnet/` and `chains/sepolia/`.)
The Hyperlane CLI resolves these automatically by chain name - the config
files here don't need to repeat them.

## Setup

```shell
cd hyperlane
npm install
cp .env.example .env   # fill in HYP_KEY with a funded testnet private key
```

Fund that wallet with:
- Somnia testnet STT (for deploying/locking collateral + gas)
- Sepolia ETH (for deploying the synthetic token + gas)

## Token addresses (already filled in)

`configs/warp-route-gbp.yaml` and `configs/warp-route-usd.yaml` point at the
real MultiX stablecoins deployed on Somnia testnet:

| Currency | Somnia `Stablecoin` address |
|---|---|
| GBP | `0xD1233bEa81A447aF6DBC5FB6B74EeD92F9397945` |
| USD | `0x74Ac78F74e5cb03975Ef9D7b5A15A3F74Ab9AAa1` |

These match `frontend/constants/addresses.ts` (`GBP_STABLE` / `USD_Stable`).
If the protocol is ever redeployed to Somnia (new `deploy.sh` run), update
these configs to match the new addresses before re-running `warp:deploy`.

## Currently deployed (live)

The GBP route below is live on both chains, default Hyperlane ISM/relayer
(no `trustedRelayerIsm` override), enrolled cross-chain and confirmed via
`routers()` reads on both ends. Full history in `../hyperlaneCCT_walkthrough.md`.

| Currency | Somnia `HypERC20Collateral` | Sepolia synthetic `HypERC20` |
|---|---|---|
| GBP | `0xDB51C9E44423343044a808c99fAF20766013Ff91` | `0x21fd42f82c14Ec1E2feEfe111C40C3bcc5690e16` (wGBP) |
| USD | not yet redeployed on this pass | - |

`frontend/constants/bridgeConfig.ts` is wired to these addresses for the Bridge page.

## Deploy a warp route (per stablecoin)

```shell
# GBP
npm run warp:deploy:gbp

# USD
npm run warp:deploy:usd
```

Each run deploys a `HypERC20Collateral` on `somniatestnet` (wrapping the real
Stablecoin) and a new synthetic `HypERC20` on `sepolia`, and wires them
together. The CLI writes the resulting addresses back into your local
Hyperlane registry (`$HOME/.hyperlane/...`) - copy them out into this repo
(e.g. a future `frontend/constants/hyperlaneAddresses.ts`) once you're ready
to build a bridge UI.

`hyperlane warp init` is available too (`npm run warp:init:gbp` /
`:usd`) if you'd rather regenerate a config interactively instead of editing
the YAML by hand - it will prompt for the same fields already filled in here.

## Test a transfer

```shell
npm run warp:send:gbp   # or warp:send:usd
```

This locks GBP stablecoin on Somnia and mints synthetic wGBP on Sepolia.
`--self-relay` (baked into the script) delivers the message with your own
key rather than waiting on a hosted relayer, which matters for a
freshly-deployed route the hosted relayer may not be watching yet. Confirm
the synthetic balance shows up on Sepolia, then test the reverse direction
(burn synthetic on Sepolia -> unlock collateral on Somnia) to prove the
round trip.

## Repeat per currency

Each fiat market (GBP, USD, and any future one added via
`MultiFiatFactory.createMarket`) needs its own independent warp route - add
a new `configs/warp-route-<currency>.yaml` and matching `package.json`
scripts following the same pattern.

## What this does NOT touch

No changes to `src/CDPEngine.sol`, `MultiFiatRouter.sol`, `MultiFiatFactory.sol`,
`HybridFiatPriceFeed.sol`, or `token/Stablecoin.sol`. The Collateral warp-route
type only needs standard ERC20 `transferFrom`/`transfer`, so the existing
mint/burn-restricted `Stablecoin` contract works as-is with zero code changes.
