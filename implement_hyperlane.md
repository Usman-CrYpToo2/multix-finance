# Implementing Hyperlane Cross-Chain Transfer for MultiX Stablecoins

Goal: let the synthetic fiat stablecoins minted by `CDPEngine`/`Stablecoin.sol` (GBP, USD, PKR, ...) move from **Somnia testnet** (where the protocol is deployed) to **Ethereum Sepolia testnet**, using [Hyperlane](https://www.hyperlane.xyz/).

This is a research/planning document only — no contracts or scripts are added here. It lays out exactly what has to be built, in what order, and why, so it can be implemented (or handed to another engineer) without further discovery work.

---

## 1. Core Hyperlane concepts you need before touching config

Hyperlane is a messaging protocol; token bridging ("Warp Routes") is just an application built on top of it.

- **Mailbox** — the same minimal contract deployed on every connected chain. Apps call `dispatch()` on the origin Mailbox to send a message, and the destination Mailbox exposes `process()` to deliver it. The Mailbox itself does no validation — it defers to whatever ISM the app has chosen. ([Hyperlane docs](https://docs.hyperlane.xyz/docs/protocol/agents/relayer))
- **ISM (Interchain Security Module)** — a pluggable contract implementing `verify(metadata, message)`. Every app picks its own ISM, i.e. its own trust model for incoming messages. For testnet use, the default multisig ISM (signed by Abacus Works' hosted testnet validators) is fine — you don't need to run your own validators to get started.
- **Validators** — off-chain agents that watch the origin chain, sign Merkle roots of dispatched messages, and publish signatures. For testnet chains already in the public Hyperlane registry, Abacus Works already runs these — you don't have to run your own.
- **Relayers** — permissionless off-chain agents that pick up a dispatched message + validator signatures and deliver it to the destination Mailbox. On testnet you can either rely on the hosted relayer (if it already watches your route) or **self-relay** using the CLI (`--self-relay` flag), which lets you deliver the message yourself with your own key — this is the recommended path while testing a brand-new route, since the hosted relayer may not pick up custom warp routes immediately.
- **IGP (Interchain Gas Paymaster)** — an origin-chain contract where the sender prepays destination-chain gas so a relayer will deliver the message. If you self-relay, you pay destination gas directly instead and can skip funding the IGP.
- **Warp Route** — the token-bridging primitive: a matched pair (or set) of `HypERC20`-family router contracts, one per chain, that call each other's Mailbox to move value. Two token types matter here:
  - **Collateral** — wraps an *existing* ERC20. The router contract just locks the real token via `transferFrom`/`transfer` (no mint/burn rights needed on the underlying token).
  - **Synthetic** — a brand-new `HypERC20` that Hyperlane deploys and that mints/burns its own supply as messages arrive/depart.

Sources: [Bridge a Token](https://docs.hyperlane.xyz/docs/guides/quickstart/deploy-warp-route), [Deploy Multi-Collateral Warp Routes](https://docs.hyperlane.xyz/docs/protocol/warp-routes/deploy-multicollateral-warp-routes), [Relayer docs](https://docs.hyperlane.xyz/docs/protocol/agents/relayer), [Interchain Gas docs](https://docs.hyperlane.xyz/docs/reference/hooks/interchain-gas)

## 2. Why "Collateral ↔ Synthetic" is the right pattern for us — and what it means for existing contracts

`Stablecoin.sol` restricts `mint`/`burn` to a single `_mintAndBurnProtocol` address (the market's `CDPEngine`, set once by the factory — see `src/token/Stablecoin.sol`). That rules out giving a Hyperlane router mint/burn rights on the *existing* stablecoin without changing that access-control model.

The **Collateral** warp route type avoids this entirely:

- On **Somnia** (origin, where the real stablecoin lives and where `CDPEngine` mints/burns it normally), Hyperlane deploys a `HypERC20Collateral` contract pointed at the existing `Stablecoin` address. It just locks/unlocks the real token — no changes to `Stablecoin.sol`, `CDPEngine.sol`, `MultiFiatRouter.sol`, or `MultiFiatFactory.sol` are required.
- On **Ethereum Sepolia** (destination), Hyperlane deploys a brand-new `HypERC20` **synthetic** token — a wrapped representation of the stablecoin that only exists there. This is a *new* contract, separate from the on-chain protocol.

So: **zero modifications to the existing Solidity contracts.** Everything Hyperlane needs is new, additional infrastructure deployed alongside the protocol.

Each fiat stablecoin (GBP, USD, PKR, ...) is its own independent ERC20 (`getMarket[stablecoin][WETH]` in the factory), so **each currency needs its own separate Warp Route** — there's no single multi-asset route. Budget for one collateral/synthetic pair per currency you want bridgeable.

## 3. Chains involved

| Role | Chain | Notes |
|---|---|---|
| Origin (collateral side) | Somnia Testnet ("Shannon"), chain ID `50312` | Where MultiX Finance is deployed; confirmed present in the Hyperlane chain registry as `somniatestnet`. |
| Destination (synthetic side) | Ethereum Sepolia | Standard Ethereum testnet; Hyperlane core contracts are already live there as a first-class supported chain. |

Because both chains are expected to already have Hyperlane **core** contracts (Mailbox, default ISM, IGP) deployed and registered, you likely do **not** need to run `hyperlane core deploy` yourself — verify this first (step 4 below) before assuming you need to bootstrap a new chain.

Source: [Somnia network info](https://docs.somnia.network/developer/network-info), [Hyperlane "Deploy to a New Chain" guide](https://docs.hyperlane.xyz/docs/guides/chains/deploy-hyperlane) (only needed if a chain is *not* already in the registry).

## 4. Step-by-step implementation plan

### Step 0 — Prerequisites
- Node.js + `npm install -g @hyperlane-xyz/cli`.
- A funded deployer wallet on **both** Somnia testnet (STT faucet) and Ethereum Sepolia (ETH faucet) — deployment and later transfers cost gas on both sides.
- Export the deployer key as `HYP_KEY` (or enter it interactively when the CLI prompts).

### Step 1 — Confirm registry state for both chains
- Run `hyperlane registry init` / inspect `$HOME/.hyperlane/chains` (or the public [hyperlane-registry](https://github.com/hyperlane-xyz/hyperlane-registry) repo) for `somniatestnet` and `sepolia`.
- Check each chain's `addresses.yaml` for an existing Mailbox address. Ethereum Sepolia will certainly have one. If Somnia testnet's core contracts are *not* yet registered/deployed:
  - Run `hyperlane core init` then `hyperlane core deploy` targeting Somnia to deploy Mailbox + default ISM + IGP there, then keep the generated `addresses.yaml`/`metadata.yaml` — this is a one-time bootstrap, not something you repeat per stablecoin.
- If both chains already have core contracts, skip straight to Step 2.

### Step 2 — Deploy one Warp Route per stablecoin
Repeat this for each currency (GBP, USD, PKR, ...):

1. `hyperlane warp init` — interactive config wizard. Choose:
   - Somnia testnet → type `collateral`, token address = the deployed `Stablecoin` address for that currency (from `frontend/constants/addresses.ts`, e.g. `GBP_STABLE`, `USD_Stable`).
   - Ethereum Sepolia → type `synthetic` (Hyperlane deploys the new wrapped token here; no address to supply).
   - Pick the default Hyperlane-hosted ISM for testnet (no custom validator set needed yet).
   This produces `configs/warp-route-deployment.yaml`, e.g.:
   ```yaml
   somniatestnet:
     type: collateral
     token: "0x...GBP_STABLE_ADDRESS..."
   sepolia:
     type: synthetic
   ```
2. `hyperlane warp deploy` — deploys `HypERC20Collateral` on Somnia (wrapping the existing stablecoin) and `HypERC20` synthetic on Sepolia, wires their routers to each other, and writes the new addresses back into your local registry/`warp-route-deployment.yaml`.
3. Record the two new addresses (Somnia collateral router, Sepolia synthetic token) somewhere durable — these are new infrastructure addresses, analogous to how `deploy.sh` records protocol addresses into `frontend/constants/addresses.ts`. Consider a parallel `frontend/constants/hyperlaneAddresses.ts` once you're ready to wire up a bridging UI (out of scope for this doc).

### Step 3 — Test a transfer end-to-end
1. Approve the Somnia `HypERC20Collateral` router to pull your stablecoin (standard ERC20 `approve`), same pattern as approving `MultiFiatRouter` for WETH today.
2. `hyperlane warp send` (or the equivalent SDK call) — locks tokens in the Somnia collateral router and dispatches a message.
3. Since this is a freshly deployed, not-yet-widely-watched route, pass `--self-relay` so your own key delivers the message to Sepolia instead of waiting on a hosted relayer — this exercises the whole path without depending on third-party relayer uptime.
4. Confirm the synthetic balance appears on Sepolia, then test the reverse direction (Sepolia synthetic → burn → message → Somnia collateral unlock) to prove round-trip correctness.

### Step 4 — Repeat Step 2–3 for every other stablecoin market
Each market (USD, PKR, future currencies added via `MultiFiatFactory.createMarket`) needs its own independent warp-route deployment and its own test transfer. There is no shared "factory" step on the Hyperlane side — each is a fully separate CLI run.

## 5. What changes vs. what doesn't

| Component | Change needed? |
|---|---|
| `src/token/Stablecoin.sol` | None. Collateral-type warp routes only need standard `transferFrom`/`transfer`, which any ERC20 already supports. |
| `src/CDPEngine.sol`, `MultiFiatRouter.sol`, `MultiFiatFactory.sol` | None. |
| `src/oracle/HybridFiatPriceFeed.sol` | None. |
| New: `HypERC20Collateral` (one per stablecoin, on Somnia) | Deployed by Hyperlane CLI, not hand-written. |
| New: `HypERC20` synthetic (one per stablecoin, on Sepolia) | Deployed by Hyperlane CLI, not hand-written. |
| `frontend/` | No change required for the bridge to function on-chain. A future "Bridge" UI page would need new addresses + a minimal `HypERC20`/router ABI (approve → transferRemote), following the same pattern `useVaultData.ts` already uses for the protocol's own router. |

## 6. Operational / security notes for later (not blocking for testnet)

- **ISM trust model**: the default testnet multisig ISM is fine for testing but is a shared, Abacus-Works-run validator set — before any real value crosses on mainnet, decide whether MultiX should run its own validators or stick with a shared/aggregation ISM.
- **IGP funding**: if you stop self-relaying and want the hosted relayer to deliver messages automatically, the Somnia-side IGP needs to be funded/configured with a gas oracle for the Sepolia destination (`docs/reference/hooks/interchain-gas`) — otherwise dispatched messages sit unrelayed.
- **Proxy admin**: Hyperlane deploys warp route contracts behind upgradeable proxies; the CLI manages the `ProxyAdmin` for you, but note who ends up owning it (defaults to your deployer key) since that's an upgrade key over the bridge contracts.
- **Per-currency scope**: adding a new fiat market via `MultiFiatFactory.createMarket` in the future means an explicit, separate `hyperlane warp init && hyperlane warp deploy` for that new stablecoin — this is a manual step, not automated by `deploy.sh`.

## 7. Summary of commands (once prerequisites are met)

```shell
npm install -g @hyperlane-xyz/cli

# one-time, only if Somnia core contracts aren't already in the registry
hyperlane core init
hyperlane core deploy

# per stablecoin (repeat for GBP, USD, PKR, ...)
hyperlane warp init      # collateral=Somnia existing token, synthetic=Sepolia
hyperlane warp deploy
hyperlane warp send --self-relay   # test transfer Somnia -> Sepolia
```

## Sources
- [Bridge a Token — Hyperlane Docs](https://docs.hyperlane.xyz/docs/guides/quickstart/deploy-warp-route)
- [Deploy Multi-Collateral Warp Routes — Hyperlane Docs](https://docs.hyperlane.xyz/docs/protocol/warp-routes/deploy-multicollateral-warp-routes)
- [Relayer — Hyperlane Docs](https://docs.hyperlane.xyz/docs/protocol/agents/relayer)
- [Post-Dispatch Interchain Gas — Hyperlane Docs](https://docs.hyperlane.xyz/docs/reference/hooks/interchain-gas)
- [Deploy to a New Chain — Hyperlane Docs](https://docs.hyperlane.xyz/docs/guides/chains/deploy-hyperlane)
- [hyperlane-registry (GitHub)](https://github.com/hyperlane-xyz/hyperlane-registry)
- [Somnia Network Info — Somnia Docs](https://docs.somnia.network/developer/network-info)
- [warp-route-deployment.yaml example — hyperlane-monorepo (GitHub)](https://github.com/hyperlane-xyz/hyperlane-monorepo/blob/main/typescript/cli/examples/warp-route-deployment.yaml)
