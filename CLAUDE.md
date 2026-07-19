# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

MultiX Finance is a multi-fiat synthetic stablecoin CDP (collateralized debt position) protocol. Users deposit WETH as collateral and borrow synthetic fiat stablecoins (e.g. GBP, USD) against it, similar to MakerDAO but supporting multiple fiat-pegged markets from one factory. The repo has two independent halves:

- **Solidity contracts** at the repo root (Foundry project) — the on-chain protocol.
- **`frontend/`** — a Next.js/wagmi dApp that talks to the deployed contracts.

## Commands

### Contracts (run from repo root)

```shell
forge build              # compile
forge test                # run all tests
forge test -vvv            # run tests with traces (use for debugging failures)
forge test --match-test <testName>       # run a single test
forge test --match-contract <ContractName>  # run all tests in one test contract
forge fmt                  # format Solidity
forge snapshot              # gas snapshots
anvil                    # local devnet
```

Full deploy + frontend address sync: `./deploy.sh` (requires `.env` with `RPC_URL` and `PRIVATE_KEY`). It runs `forge install`, wipes `out/cache/broadcast`, builds, runs `script/multix.s.sol:MultixScript`, then parses the broadcast log for deployed addresses (WETH, Oracle, Factory, Router, GBP/USD stablecoin+pool pairs) and regenerates `frontend/constants/addresses.ts`. That file is auto-generated — don't hand-edit it; re-run `deploy.sh` instead, or update the extraction labels in `deploy.sh` if the deploy script's log output changes.

### Frontend (run from `frontend/`)

```shell
npm run dev      # Next.js dev server
npm run build
npm run lint
```

## Architecture (contracts)

Four contracts under `src/`, wired together as: **Factory → Router → CDPEngine (one per market) → Stablecoin**, with a shared **Oracle**.

- **`MultiFiatFactory.sol`** — deploys new fiat markets. `createMarket()` CREATE2-deploys a `Stablecoin` and a paired `CDPEngine`, whitelists the new pool on the oracle, and hands ownership of the stablecoin to the caller. `getMarket[stablecoin][collateral]` (and reverse) maps to the CDPEngine address; all deployed engines are tracked in `allMarkets`.
- **`MultiFiatRouter.sol`** — single user-facing entry point across all markets. Every method (`depositCollateral`, `withdrawCollateral`, `borrowFiat`, `repayFiat`, `liquidate`) looks up the target CDPEngine via `factory.getMarket(stableCoin, WETH)` and forwards the call, passing `msg.sender` through as the actual account. `CDPEngine` functions that mutate user state are gated by an `onlyRouter` modifier — the router is the only allowed caller, so all user-facing calls must go through it, never directly against a CDPEngine.
- **`CDPEngine.sol`** — the core per-market lending pool (one deployed per stablecoin×collateral pair). Tracks each account's collateral and debt (debt stored as **shares**, not raw amounts, via `convertStablecoinToShares`/`_convertToStablecoin`, so accrued interest is distributed pro-rata across borrowers). Key mechanics:
  - Interest accrues lazily in `_accureInterest()` (called at the top of every state-changing entry point) based on elapsed time since `lastAccrual`, using `borrowRatePerSecond` derived from `borrowRatePerYearBp` at construction.
  - Of the interest accrued, only 50% is actually minted (25% to the owner, 25% into `internalOpBalance`); the other 50% is added to `aggregateState.totalDebt` but never minted — effectively a protocol-level burn/subsidy baked into the debt-share math.
  - LTV logic: `safeLtvBp` (borrow/withdraw limit) vs `liquidationLtvBp` (liquidation trigger) vs `liquidationPenaltyBp`, all validated at construction in `_validateLtvSettings` against `MIN_SAFE_LTV_BP`/`MAX_SAFE_LTV_BP`/`MAX_PENALTY_BP` constants.
  - Liquidation (`_liquidate`) supports partial liquidations: if LTV is over the liquidation threshold but under 100%, only enough debt is repaid to restore the account to `safeLtvBp` (`getPartialLiquidationAmount`); if LTV ≥ 100%, it's a full wipeout.
  - All collateral↔fiat conversions (`fromCollatToStablecoin`, `fromFiatToCollat`) go through the injected oracle (`collateralConfig.collatToFiatOracle`), never a hardcoded price.
- **`oracle/HybridFiatPriceFeed.sol`** — a single shared oracle across all markets, mimicking Chainlink's `latestRoundData()` interface. It combines a pushed ETH/USD price (`updateEthPrice`, bot-only) with a per-pool FX rate (`updateFxRate`, bot-only, requires the pool be whitelisted). `latestRoundData()` routes by `msg.sender`, so **only a whitelisted CDPEngine can read its own price** — the oracle is not a generic public price feed. Both the ETH price and the FX rate individually go stale after 86400s (`RateStale`). `killOracle()` is a one-way owner kill switch.
- **`token/Stablecoin.sol`** — plain ERC20 (18 decimals) whose mint/burn is restricted to a single `_mintAndBurnProtocol` address (the CDPEngine, set once by the factory then transferable by the owner).

Deployment glue is in `script/multix.s.sol`; tests live under `test/` (`multixFinance.t.sol` for the core protocol, `test/Oracle_Test/oracle_test.t.sol` for the oracle). CI (`.github/workflows`) runs `forge build --sizes` and `forge test -vvv` on push/PR.

## Architecture (frontend)

Next.js App Router app under `frontend/app/` (routes: `/`, `/borrow`, `/faucet`, `/markets`), using `wagmi` + `viem` + Reown AppKit for wallet/chain connectivity (`components/Web3Provider.tsx`).

- **`constants/addresses.ts`** — auto-generated by `deploy.sh`; the single source of truth for all deployed contract addresses the frontend reads.
- **`hooks/useVaultData.ts`** — the main data/state hook for the borrow flow. It hardcodes a `SUPPORTED_ASSETS` map (GBP/USD → pool + stablecoin address + a locally-assumed fiat price) and inline minimal ABIs for the router/CDPEngine calls it needs, rather than importing full contract ABIs. It computes projected LTV/health-factor client-side by combining on-chain reads (`getUserCollateral`, `getUserDebt`, `ltvConfig`, `borrowRatePerSecond`) with local pending-input state (`depositAmount`/`borrowAmount`), and drives a step-based button state machine (approve → deposit → borrow) based on current allowance/balance/LTV checks. When adding a new fiat market end-to-end, this hook's `SUPPORTED_ASSETS` map and ABIs need to stay in sync with `addresses.ts`.
- **`hooks/useLivePrices.ts`** — newer hook, presumably intended to replace the hardcoded `price` fields in `SUPPORTED_ASSETS` with live oracle data; check its current state before assuming prices are still static.
- Modals under `components/modals/` (`WithdrawModal.tsx`, `RepayModal.tsx`) mirror the deposit/borrow pattern in `useVaultData.ts` for the reverse operations (withdraw collateral, repay debt) — each talks to the router, not directly to a CDPEngine.

Since the frontend is wired to specific deployed contract addresses, changes to CDPEngine/Router/Factory function signatures require updating both the Solidity interfaces and every ABI fragment hardcoded in the frontend hooks/components that call them (there is no shared ABI-generation step between the two halves of this repo).
