# Hyperlane Cross-Chain Transfer (CCT) Walkthrough

This document is a full, chronological record of everything done to take MultiX Finance from "two stablecoins deployed on Somnia testnet" to "GBP stablecoin successfully bridged to Ethereum Sepolia and back, burn-and-unlock proven on-chain." It includes every command run, every resulting transaction, what each transaction actually did, and explorer links so each step can be independently verified.

**Chains involved:**
- **Somnia Testnet** — chain ID `50312`, explorer `https://shannon-explorer.somnia.network`
- **Ethereum Sepolia** — chain ID `11155111`, explorer `https://sepolia.etherscan.io`
- **Hyperlane Explorer** (cross-chain message tracking) — `https://explorer.hyperlane.xyz`

**Deployer/test wallet used throughout:** `0xcf9e1825Fe713bD6c7508b9f12c42Cb333fe839e`

---

## Phase 1 — Deploying the MultiX protocol (and the two stablecoins) on Somnia

### 1.1 Why the normal `deploy.sh` (`forge script`) didn't work

The first attempts to run `./deploy.sh` against Somnia failed with transactions reverting out of gas. The root cause: Somnia intentionally charges very different gas costs than Ethereum for some operations — most importantly **3125 gas per byte of deployed contract bytecode**, versus Ethereum's 200 gas/byte (documented at [Somnia Gas Differences to Ethereum](https://docs.somnia.network/developer/deployment-and-production/somnia-gas-differences-to-ethereum)). `forge script` computes gas limits by simulating transactions **locally** using standard Ethereum opcode costs, so its estimates came out roughly 10-15x too low for anything that deploys a contract. No `--gas-estimate-multiplier` value fixed this because it was scaling the wrong baseline number.

The fix: deploy **one contract/call at a time** using `forge create` (single contract deploy) and `cast send` (single call), each with an **explicit `--gas-limit`** sourced from a live `cast estimate` call against Somnia's real RPC (which *does* report accurate numbers — it was only Foundry's local simulator that was wrong).

### 1.2 Contracts deployed

Each row below is a real, verified (`status: 1 (success)`) transaction on Somnia.

| Contract | Address | Deploy tx |
|---|---|---|
| `MockWETH` (collateral asset) | `0x1b5A97335E5f1236B709C9DEa843fDd4Cc655094` | [`0x2254677d...`](https://shannon-explorer.somnia.network/tx/0x2254677df55de40002fa8aaf6b93e588b21b7ead25a7664d0702ef4014c9a243) — gas used 7,115,761 |
| `HybridFiatPriceFeed` (Oracle) | `0x2A1603a216F0ceb626162dE9Ce4f47f305452b33` | [`0x82bc1f89...`](https://shannon-explorer.somnia.network/tx/0x82bc1f893e5c9f65ef2882edff9f40a75b17bf007605e1e4ad5354a96fb75968) — gas used 11,196,515 |
| `MultiFiatFactory` | `0x0ABC1966B66DDa33428208CcB31716D93C357f9a` | [`0x8c051816...`](https://shannon-explorer.somnia.network/tx/0x8c0518164cef91b391383202a404c3e82f8217cc5da0ce36635b2d828971f1ed) — gas used 61,002,530 (largest single deploy: Factory's ~18KB bytecode × 3125 gas/byte) |
| `MultiFiatRouter` | `0xe927D7487BCE9D07fdAB3d898705e2febAf0F9c5` | [`0x79d6cdaa...`](https://shannon-explorer.somnia.network/tx/0x79d6cdaa1535b6cb9a1a19e5f680a7a959912c612f616d6ac6a3adc0ea721bc0) — gas used 7,930,236 |

Command shape used for each (example — Oracle):
```shell
forge create src/oracle/HybridFiatPriceFeed.sol:HybridFiatPriceFeed \
  --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" \
  --gas-limit 21000000 --broadcast --json \
  --constructor-args $DEPLOYER $DEPLOYER
```
(`--gas-limit` in each case came from a preceding `cast estimate --rpc-url ... --create <initcode>` call against the live chain, plus a ~25-30% safety buffer.)

### 1.3 Wiring the protocol together

| Step | tx | What it did |
|---|---|---|
| `factory.setRouter(router)` | [`0x956214f7...`](https://shannon-explorer.somnia.network/tx/0x956214f70482453248848ad397f95c1274b249b4396ff508bfecd1d1a90cf675) | Registers the Router as the Factory's authorized router |
| `oracle.setBotAuthorization(factory, true)` | [`0x9c49ac75...`](https://shannon-explorer.somnia.network/tx/0x9c49ac7527bac8fc9efdb4d393dcaa732ad8cd9f3a0523b552ae4e01710e2121) | Lets the Factory whitelist new pools on the Oracle when it creates markets |
| `factory.createMarket(GB, GBP, ...)` | [`0x83b356c9...`](https://shannon-explorer.somnia.network/tx/0x83b356c9d895056c938a60cf4a84a48bbc47d64612522ea702ae0fe2d2346155) | CREATE2-deploys the GBP `Stablecoin` + its `CDPEngine`, whitelists the pool on the oracle. Gas used: 39,427,338 |
| `factory.createMarket(USD, USD, ...)` | [`0xe4622637...`](https://shannon-explorer.somnia.network/tx/0xe46226373b6482e234d2a4e8c65d48829c1ccedee79ead98269158dd8f6ea323) | Same, for the USD market. Gas used: 39,227,338 |
| `oracle.updateEthPrice(1000e8)` | [`0xc09536d2...`](https://shannon-explorer.somnia.network/tx/0xc09536d2e1d25eb089b11fc0f1b156ec2763c4ebf9d0eb609b3c15a355594a59) | Sets the ETH/USD price bots push (1 ETH = 1000 USD) |
| `oracle.updateFxRate(gbpPool, 1.3e8)` | [`0x1e52b723...`](https://shannon-explorer.somnia.network/tx/0x1e52b7232ae03bd1469e536ec6c104a81562eab4c472ba33ce644dd8cccee8b2) | Sets the GBP FX rate (1.30 USD per GBP) |
| `oracle.updateFxRate(usdPool, 1e8)` | [`0xc8608304...`](https://shannon-explorer.somnia.network/tx/0xc860830425688b0f92b1d45b46fa351d92cfb48de8671af79d4f33a339cb8154) | Sets the USD FX rate (1.00, baseline peg) |

`createMarket`'s `MarketCreated(stableCoin, collateral, cdpEngine, marketLength)` event logs are what gave us the resulting stablecoin/pool addresses:

| Market | Stablecoin | CDPEngine (Pool) |
|---|---|---|
| GBP | [`0x84Bfd04993EE99D4f53ADA9e9F6B7B8A37f797aC`](https://shannon-explorer.somnia.network/address/0x84Bfd04993EE99D4f53ADA9e9F6B7B8A37f797aC) | `0xC3b4c0a02636F1b2F5c8Fd8cE089836D343177cd` |
| USD | [`0xEA4351cCDBAEed93847FC8620Ac742f17fA28399`](https://shannon-explorer.somnia.network/address/0xEA4351cCDBAEed93847FC8620Ac742f17fA28399) | `0xAC42f0c3C1407E5C3cCee6874d196DF703c893B6` |

These two `Stablecoin` addresses are the ones later bridged via Hyperlane.

Post-deploy, correctness was double-checked with read-only calls: `factory.ROUTER()` matched the Router address, `factory.getMarket(gbpStable, weth)` matched the GBP pool, and `oracle.whitelistedPools(gbpPool)` returned `true`.

---

## Phase 2 — Setting up Hyperlane

### 2.1 Installing the CLI

```shell
cd hyperlane
npm install          # installs @hyperlane-xyz/cli@^36.0.0
npx hyperlane --version   # -> 36.0.0
```

### 2.2 Writing the warp-route config files

Two YAML configs were authored by hand (`hyperlane/configs/warp-route-gbp.yaml`, `hyperlane/configs/warp-route-usd.yaml`), one per stablecoin, each describing a **Collateral** leg on Somnia (wrapping the real, already-deployed `Stablecoin`) and a **Synthetic** leg on Sepolia (a brand-new wrapped token Hyperlane deploys):

```yaml
# warp-route-gbp.yaml
somniatestnet:
  type: collateral
  token: "0x84Bfd04993EE99D4f53ADA9e9F6B7B8A37f797aC"   # real GBP Stablecoin

sepolia:
  type: synthetic
  name: "MultiX Wrapped GBP"
  symbol: "wGBP"
```

This uses the **Collateral** token type specifically because `Stablecoin.sol` restricts `mint`/`burn` to a single `_mintAndBurnProtocol` address (the `CDPEngine`). Collateral-type warp routes never need mint rights — they just lock/unlock the real token via standard `transferFrom`/`transfer` — so **zero changes were needed to any MultiX Solidity contract** to make this bridge work.

### 2.3 Discovering the CLI's actual deployment model

The originally-researched `hyperlane warp deploy --config <path>` flag turned out not to exist in CLI v36 — `--config` isn't a recognized argument in this version (confirmed directly: `Unknown arguments: config`). Instead, this CLI version resolves everything through a **warp route ID** looked up in a registry (a GitHub registry plus a local folder registry at `~/.hyperlane`), meant to be created interactively via `hyperlane warp init`.

Since `warp init` is a raw-terminal arrow-key wizard (not reliably scriptable without a real pty, and risky to blindly automate against live chains), the equivalent config was instead placed **directly** into the expected local registry location, mirroring the exact structure of real entries in the public [hyperlane-registry](https://github.com/hyperlane-xyz/hyperlane-registry/tree/main/deployments/warp_routes) (e.g. `deployments/warp_routes/BLEND/fluent-deploy.yaml`):

```shell
mkdir -p ~/.hyperlane/deployments/warp_routes/GBP
cat > ~/.hyperlane/deployments/warp_routes/GBP/somnia-sepolia-deploy.yaml <<'EOF'
somniatestnet:
  type: collateral
  token: "0x84Bfd04993EE99D4f53ADA9e9F6B7B8A37f797aC"
  owner: "0xcf9e1825Fe713bD6c7508b9f12c42Cb333fe839e"

sepolia:
  type: synthetic
  name: "MultiX Wrapped GBP"
  symbol: "wGBP"
  decimals: 18
  owner: "0xcf9e1825Fe713bD6c7508b9f12c42Cb333fe839e"
EOF
```

This gave the route the ID `GBP/somnia-sepolia`, and the same pattern was repeated for `USD/somnia-sepolia`.

Before running for real, the plan was previewed (deliberately killed via `timeout` right at the confirmation prompt, so nothing could be broadcast yet):
```shell
timeout 25 npx hyperlane warp deploy -w GBP/somnia-sepolia
```
This printed a deployment plan table showing both chains, correctly resolving each chain's **real Mailbox address** from the public registry (`0x7d498740A4572f2B5c6b0A1Ba9d1d9DbE207e89E` on Somnia, `0xfFAEF09B3cd11D9b20d1a19bECca54EEC2884766` on Sepolia) — confirming the hand-written config was being read correctly before any funds were spent.

---

## Phase 3 — Deploying the GBP warp route

```shell
npx hyperlane warp deploy -w GBP/somnia-sepolia -y
```

This one command deployed contracts on **both** chains and wired them together:

| Step | Chain | tx |
|---|---|---|
| ProxyAdmin | Sepolia | [`0xe728e376...`](https://sepolia.etherscan.io/tx/0xe728e37695facacf0e52872b1e74e8f7d8ab0963b112008d6ed8dde381dc748d) |
| ProxyAdmin | Somnia | [`0x520227ad...`](https://shannon-explorer.somnia.network/tx/0x520227ad7d6fbd0457b2b119b8497ee0fe908f9645653d40b18be4268ba2b5f5) |
| `HypERC20Collateral` logic | Somnia | [`0xc0b0d651...`](https://shannon-explorer.somnia.network/tx/0xc0b0d6516f5e14ea9e5567d12062c99f531c2e0922e0817502ddaf86a0b9114b) |
| `TransparentUpgradeableProxy` (→ real collateral router) | Somnia | [`0x24441a5d...`](https://shannon-explorer.somnia.network/tx/0x24441a5de51a939d979c18e40cae55668d6bb9c57af3d8c0365c45e35504837d) |
| `HypERC20` synthetic logic | Sepolia | [`0xd6baa62b...`](https://sepolia.etherscan.io/tx/0xd6baa62b2bf7fba8646ff13d2efa1f28b35f664ff6975e3b8270f5de4a90e626) |
| `TransparentUpgradeableProxy` (→ real wGBP token) | Sepolia | [`0x52933a3e...`](https://sepolia.etherscan.io/tx/0x52933a3ee3ffc116a7d0f382953911c56b05ec12b73ef0a2e6199a7b670459f3) |
| Cross-chain router enrollment | both | [`0xba0cb8c0...`](https://sepolia.etherscan.io/tx/0xba0cb8c05289ec7548e43370e43e1c7eed020cb5179cbd7189c3b04381e2ddab) (Sepolia), [`0x748120e4...`](https://shannon-explorer.somnia.network/tx/0x748120e4864d8fa32bc7a90edbb0b52a5f2a6d7e0e3ad97f0d4b680b2aebe0cd) (Somnia) |

**Resulting addresses:**

| Chain | Contract | Address |
|---|---|---|
| Somnia | `HypERC20Collateral` (wraps GBP Stablecoin) | [`0x2cDbDE03dF8492Bd84810f83a6FA7e4BFC231dcC`](https://shannon-explorer.somnia.network/address/0x2cDbDE03dF8492Bd84810f83a6FA7e4BFC231dcC) |
| Sepolia | `HypERC20` synthetic — **wGBP** | [`0x083d9B4E4Af9Aec55D00D794fb57595478F694ac`](https://sepolia.etherscan.io/address/0x083d9B4E4Af9Aec55D00D794fb57595478F694ac) |

Total cost: **0.5502 STT** (Somnia) + **0.00554 ETH** (Sepolia).

---

## Phase 4 — Deploying the USD warp route (including a real blocker hit along the way)

Same registry-file pattern, different folder (`USD/somnia-sepolia-deploy.yaml`, pointing at the USD Stablecoin `0xEA4351cCDBAEed93847FC8620Ac742f17fA28399`).

**First two attempts failed** with `Error: insufficient balance` specifically on the Somnia `HypERC20Collateral` deploy step — even though the wallet's remaining balance (~0.87-0.91 STT) was comfortably more than what the *entire* GBP deployment had cost (0.55 STT). This pointed to a client-side pre-flight balance check in Hyperlane's SDK being overly conservative for Somnia's inflated gas costs, rather than a genuine shortfall (no transaction hash was even produced for the failing step — it aborted before broadcasting).

Both failed attempts still fully deployed (and orphaned) a Sepolia-side synthetic token each time, since the Sepolia leg succeeded independently before the Somnia leg failed:
- 1st orphaned Sepolia proxy: [`0x361E2b0A2AAF08F558c7E5f476529b27e50af404`](https://sepolia.etherscan.io/address/0x361E2b0A2AAF08F558c7E5f476529b27e50af404) (tx [`0x2c66d4f9...`](https://sepolia.etherscan.io/tx/0x2c66d4f97e539371ba0f4b9e973d6e9f8dcccf0c8abc1ae553b688bc045ed443))
- 2nd orphaned Sepolia proxy: tx [`0xe338d5a4...`](https://sepolia.etherscan.io/tx/0xe338d5a4b87439f447579e6d9463e2ca2689c63723fa0086a9a16460a82d4bd5)

**Fix:** topped up the Somnia wallet from ~0.87 STT to 1.87 STT, then retried:
```shell
npx hyperlane warp deploy -w USD/somnia-sepolia -y
```
This time it succeeded completely, at the **exact same gas cost as GBP** (0.55024974 STT) — confirming it really was just a threshold/margin issue in the pre-check, not a real cost difference.

| Step | Chain | tx |
|---|---|---|
| ProxyAdmin | Somnia | [`0xf5618a4e...`](https://shannon-explorer.somnia.network/tx/0xf5618a4ec040e2a58386fb0efe192d9b35889aafc76bf8eee5c8e46cd9b08140) |
| ProxyAdmin | Sepolia | [`0x6462ee92...`](https://sepolia.etherscan.io/tx/0x6462ee926f668030f1d16d85c2a81c425e7bab20aaeb67d4bcaf574c4e29f36d) |
| `HypERC20Collateral` logic | Somnia | [`0x512b4b1b...`](https://shannon-explorer.somnia.network/tx/0x512b4b1b77cc3e7dfda46d9c402db7d5bf7e89122a370266b7d31122c53e93b2) |
| `TransparentUpgradeableProxy` (→ real collateral router) | Somnia | [`0xf414b1d7...`](https://shannon-explorer.somnia.network/tx/0xf414b1d7c23c7421eb2adf0a387ca079d71c03aa17feaf3001b2d225e49d919f) |
| `HypERC20` synthetic logic | Sepolia | [`0xfac41461...`](https://sepolia.etherscan.io/tx/0xfac41461be5dd03657736fe8b0c5c84276dc0f7920558e1256eee38dae89b377) |
| `TransparentUpgradeableProxy` (→ real wUSD token) | Sepolia | [`0x7a61050b...`](https://sepolia.etherscan.io/tx/0x7a61050b0ca3fbd4f9fa6a99e2fd5b33f990c4be655a591b8e31655f01e00271) |
| Router enrollment | both | [`0xb79d8d98...`](https://shannon-explorer.somnia.network/tx/0xb79d8d9862748f2094a9b65190af36846663a3aeb5829857cc60b8867f6041a8) (Somnia), [`0x63ac6131...`](https://sepolia.etherscan.io/tx/0x63ac6131f35da8f5707b25db884cef05fac7ab6c4aebe46492ebf0e9dea144c5) (Sepolia) |

**Resulting addresses:**

| Chain | Contract | Address |
|---|---|---|
| Somnia | `HypERC20Collateral` (wraps USD Stablecoin) | [`0xfc6596e2CD6db9C712ff3c5847c1a2BD2c8DF68c`](https://shannon-explorer.somnia.network/address/0xfc6596e2CD6db9C712ff3c5847c1a2BD2c8DF68c) |
| Sepolia | `HypERC20` synthetic — **wUSD** | [`0x5Ef35b31CA4bF904e592842A898848c00c11CABc`](https://sepolia.etherscan.io/address/0x5Ef35b31CA4bF904e592842A898848c00c11CABc) |

---

## Phase 5 — Testing the forward transfer: locking GBP on Somnia, minting wGBP on Sepolia

```shell
npx hyperlane warp send -w GBP/somnia-sepolia \
  --origin somniatestnet --destination sepolia \
  --amount 1000000000000000000 --relay -y
```
(`--amount` is in the token's smallest unit — `1000000000000000000` = 1.0 GBP, since the stablecoin has 18 decimals.)

**What happened:**
1. Two approval-related transactions ran on Somnia (approving the `HypERC20Collateral` router to pull GBP from the wallet), then the actual `transferRemote` dispatch — visible as `Pending` transactions [`0x5bc27889...`](https://shannon-explorer.somnia.network/tx/0x5bc27889d922e5e05011afde1550b69a48c0539697312b114b58a86078da6cc0) and [`0xf3cabb30...`](https://shannon-explorer.somnia.network/tx/0xf3cabb30dfd86ecc76d292856b96cc67e7de410faa1a56cfe97d4a406250e6f5) in the log.
2. A cross-chain message was dispatched with **Message ID** [`0x8edf0f18...`](https://explorer.hyperlane.xyz/message/0x8edf0f184827296fb1a55200d48fc2fc22a6c1941678e03206e19dd9855ad22a) — this is a public, independently-verifiable record on the Hyperlane Explorer.
3. **The `--relay` (self-relay) flag failed**: the CLI printed `Failed to build for submodule 0: Merkle proofs are not yet supported`, then attempted a fallback relay anyway, which reverted on Sepolia — tx [`0x7eb1382a...`](https://sepolia.etherscan.io/tx/0x7eb1382a9691d4b1c711eb8cd6b61ce1faf26d48e000ce8003f35a251e48a999) (`status: 0`, generic `CALL_EXCEPTION`, only 37,533 gas used — reverted almost immediately at the Mailbox's ISM verification step). This is a genuine limitation in this CLI version's self-relay implementation for the default Merkle-root-based ISM these testnets use — not something specific to MultiX's contracts.
4. Despite the self-relay failure, **Hyperlane's own hosted relayer network** (production infrastructure run independently of us) picked up and delivered the message anyway, shortly after. Note this test run actually happened across **two separate `warp send` invocations** (an initial one that got cut off by a shell timeout before finishing, and the full run above) — both dispatches were real and both were independently delivered by the hosted relayer, which is why the final balances below show 2 GBP transferred rather than 1:
   - Mint tx 1: [`0xfdea8138...`](https://sepolia.etherscan.io/tx/0xfdea8138c0f1c27ce8feb674e778766d27ab45364dd5fd7a433294137d16b865)
   - Mint tx 2: [`0xcb619cdc...`](https://sepolia.etherscan.io/tx/0xcb619cdc3e34ce3725f0b7996a3fd7da604d8377c06960df1814a605658e61a6)

**Balances verified directly on-chain afterward:**

| | Before | After |
|---|---|---|
| Deployer's GBP on Somnia | 4000 | 3998 |
| GBP locked in Somnia collateral router | 0 | 2.0 |
| Deployer's wGBP on Sepolia | 0 | 2.0 |
| wGBP total supply | 0 | 2.0 |

Exact 1:1 collateralization — proves the dispatch → Mailbox → ISM verification → mint pipeline works correctly end to end.

---

## Phase 6 — Testing the reverse transfer: burning wGBP on Sepolia, unlocking GBP on Somnia

```shell
npx hyperlane warp send -w GBP/somnia-sepolia \
  --origin sepolia --destination somniatestnet \
  --amount 1000000000000000000 -y
```
This time **without** `--relay`, since self-relay was already known to be broken — just letting the CLI wait for the hosted relayer.

**What happened:**
1. Sepolia-side dispatch (burns 1 wGBP, sends the cross-chain message): tx [`0xb91e6f8c...`](https://sepolia.etherscan.io/tx/0xb91e6f8cfd5a104d9035acac3ab5b35ccb8bd704c7c3af54c9378e2a2473808c)
2. **Message ID**: [`0xb7354804...`](https://explorer.hyperlane.xyz/message/0xb7354804a35ff8357d33795b8b183c65d68839fd61c9366bec93555f76f59ca5)
3. The CLI itself waited for delivery this time (no `--quick` flag) and confirmed: **`Message ... was processed. Delivery time: 31s`** — the hosted relayer picked it up and delivered it to Somnia automatically, well within the default 600s timeout.

**Balances verified directly on-chain afterward:**

| | Before burn | After burn + unlock |
|---|---|---|
| Deployer's GBP on Somnia | 3998 | **3999** (+1, released from collateral) |
| GBP locked in Somnia collateral router | 2.0 | **1.0** (-1, unlocked) |
| Deployer's wGBP on Sepolia | 2.0 | **1.0** (-1, burned) |
| wGBP total supply | 2.0 | **1.0** (matches — confirms an actual burn, not just a transfer) |

Everything reconciles exactly. This proves the GBP warp route works **bidirectionally**: lock-and-mint one way, burn-and-unlock the other, with collateral backing always matching circulating synthetic supply.

---

## Current state summary

| Item | Address |
|---|---|
| Somnia WETH | `0x1b5A97335E5f1236B709C9DEa843fDd4Cc655094` |
| Somnia Oracle | `0x2A1603a216F0ceb626162dE9Ce4f47f305452b33` |
| Somnia Factory | `0x0ABC1966B66DDa33428208CcB31716D93C357f9a` |
| Somnia Router | `0xe927D7487BCE9D07fdAB3d898705e2febAf0F9c5` |
| Somnia GBP Stablecoin | `0x84Bfd04993EE99D4f53ADA9e9F6B7B8A37f797aC` |
| Somnia GBP CDPEngine (pool) | `0xC3b4c0a02636F1b2F5c8Fd8cE089836D343177cd` |
| Somnia USD Stablecoin | `0xEA4351cCDBAEed93847FC8620Ac742f17fA28399` |
| Somnia USD CDPEngine (pool) | `0xAC42f0c3C1407E5C3cCee6874d196DF703c893B6` |
| Somnia GBP `HypERC20Collateral` | `0x2cDbDE03dF8492Bd84810f83a6FA7e4BFC231dcC` |
| Sepolia wGBP `HypERC20` | `0x083d9B4E4Af9Aec55D00D794fb57595478F694ac` |
| Somnia USD `HypERC20Collateral` | `0xfc6596e2CD6db9C712ff3c5847c1a2BD2c8DF68c` |
| Sepolia wUSD `HypERC20` | `0x5Ef35b31CA4bF904e592842A898848c00c11CABc` |

**GBP route:** deployed and tested bidirectionally (proven working).
**USD route:** deployed, wired, and verified via the same deployment plan/mailbox checks as GBP, but **not yet transfer-tested** (no lock/mint or burn/unlock test has been run on it — only GBP has been exercised end-to-end so far).

## Key lessons learned

1. **Somnia's gas schedule differs intentionally from Ethereum's** (documented, not a bug) — anything that estimates gas by local simulation (like `forge script`) will badly underestimate; anything that queries the live RPC directly (like `cast estimate`, or Hyperlane's own SDK) gets accurate numbers.
2. **Hyperlane CLI v36's `warp deploy`/`warp apply`/`warp send` all key off a registry route ID**, not a raw file path — `warp init` is the interactive wizard that normally creates that registry entry; it can be bypassed by hand-writing the same file directly into `~/.hyperlane/deployments/warp_routes/<SYMBOL>/<label>-deploy.yaml`.
3. **Hyperlane's own balance pre-check can be overly conservative on non-standard-gas chains** — a real "insufficient balance" error appeared well before the wallet was actually low, resolved simply by adding more margin.
4. **This CLI version's `--relay` (self-relay) flag doesn't support Merkle-root-based ISM metadata** — it fails on the default ISM these testnets use. This doesn't block anything: Hyperlane's hosted relayer network delivers messages on its own regardless, typically within seconds to a couple of minutes, without needing `--relay` at all.

---

## Phase 7 — Re-deploying both warp routes after a full protocol redeploy

The entire MultiX protocol was redeployed from scratch on Somnia (new WETH, Oracle with the Somnia-Agents AI price-update path, Factory, Router, and both stablecoins/CDPEngines — see `ai_oracle.md`). Since the Collateral-side warp routers wrap a *specific* stablecoin address, the old `HypERC20Collateral` routers now point at abandoned/orphaned stablecoins with no live `CDPEngine` behind them — both warp routes had to be redeployed pointing at the new stablecoin addresses.

This machine had no prior local Hyperlane registry state (`~/.hyperlane/deployments/warp_routes` was empty), so the registry files were hand-written fresh, following the exact same pattern as Phase 2.3 (`somnia-sepolia-deploy.yaml` per currency, giving route IDs `GBP/somnia-sepolia` and `USD/somnia-sepolia`), pointed at the new stablecoin addresses:

```yaml
# GBP/somnia-sepolia-deploy.yaml
somniatestnet:
  type: collateral
  token: "0xD1233bEa81A447aF6DBC5FB6B74EeD92F9397945"   # new GBP Stablecoin
  owner: "0xcf9e1825Fe713bD6c7508b9f12c42Cb333fe839e"
sepolia:
  type: synthetic
  name: "MultiX Wrapped GBP"
  symbol: "wGBP"
  decimals: 18
  owner: "0xcf9e1825Fe713bD6c7508b9f12c42Cb333fe839e"
```

The deployment plan was previewed first (`npx hyperlane warp deploy -w GBP/somnia-sepolia`, killed at the confirmation prompt) to confirm both chains' real Mailbox addresses resolved correctly before spending anything, then run for real:

```shell
npx hyperlane warp deploy -w GBP/somnia-sepolia -y
npx hyperlane warp deploy -w USD/somnia-sepolia -y
```

Both succeeded on the first attempt (no `insufficient balance` false-positive this time — the wallet had ~8.1 STT / ~0.07 Sepolia ETH going in, comfortably above the ~0.55 STT / ~0.0056 ETH each route costs).

**New resulting addresses:**

| Chain | Contract | Address |
|---|---|---|
| Somnia | GBP `HypERC20Collateral` (wraps new GBP Stablecoin) | `0x17D7C47168C194DA59e22353eB6C7be1BB0ad18B` |
| Sepolia | new wGBP `HypERC20` synthetic | `0x2A1603a216F0ceb626162dE9Ce4f47f305452b33` |
| Somnia | USD `HypERC20Collateral` (wraps new USD Stablecoin) | `0x4Cd08266375122fD5E5220e128F16b0aaF71580e` |
| Sepolia | new wUSD `HypERC20` synthetic | `0x71fEe8094606B633a02e17Ed5e27C3A770f00e8b` |

Gas cost: identical to Phase 3/4 (`0.55024974 STT` + `~0.0056 ETH` per route).

Updated in the codebase to match: `hyperlane/configs/warp-route-gbp.yaml`, `hyperlane/configs/warp-route-usd.yaml`, `hyperlane/README.md`, and `frontend/constants/bridgeConfig.ts` (the `routers`/`addresses.sepolia` fields the Bridge page reads).

**Neither new route has been transfer-tested yet** (no `warp send` lock/mint or burn/unlock run against these new addresses) — the old GBP round-trip proof in Phases 5–6 was against the now-abandoned stablecoin/router pair and doesn't carry over. Re-run that test against the new routes before relying on them.

---

## Phase 8 — GBP delivery stall (Abacus Works validator down) and a second GBP redeploy

A real user transfer (550 GBP, Somnia → Sepolia) through the Phase 7 GBP route (`0x17D7C47168C194DA59e22353eB6C7be1BB0ad18B` collateral / `0x2A1603a216F0ceb626162dE9Ce4f47f305452b33` synthetic) dispatched successfully on Somnia (message IDs `0x0b7156a7...` and `0x3b8300a6...`, both `DispatchId` events confirmed) but **never delivered** on Sepolia (`Mailbox.delivered()` stayed `false` for 45+ minutes across repeated checks).

**Root cause, independently confirmed (not just inferred from the CLI):**
- `hyperlane status --relay` on the pending message reported the Sepolia-side aggregation ISM's `messageIdMultisigIsm` validator (`Abacus Works`, `0xb3b27A27BfA94002d344E9Cf5217A0e3502E018b`) as `status: "pending"` at `checkpointIndex: 30` — unchanged across 4 separate checks including one with `--disableProxy`.
- Looked up that validator's announced storage location directly via the on-chain `ValidatorAnnounce` contract (`0x0b9A4A46f50f91f353B8Aa0F3Ca80E35E253bDd8`, from the public hyperlane-registry's `chains/somniatestnet/addresses.yaml`): `s3://hyperlane-testnet4-somniatestnet-validator-0/us-east-1`.
- Fetched `checkpoint_latest_index.json` directly from that bucket (bypassing the CLI/registry entirely): latest published index **29**, with an S3 `Last-Modified` header of **2026-07-22** — 11 days stale at the time of checking. The validator's own publicly-announced signer output confirms it stopped publishing checkpoints entirely, one index short of what this message needed (30).
- Self-relay (`--relay`) also fails independently of the validator's status, with `Failed to build for submodule 0: Merkle proofs are not yet supported` — a CLI-level limitation for merkle-root-based ISM metadata (same bug noted in Phase 5), so self-relay was never a working fallback here regardless.

**Conclusion:** this is dead third-party testnet infrastructure (Abacus Works' Somnia-origin validator), not a bug in the redeployed contracts, not insufficient balance (verified: deployer had ~7 STT / ~0.11 ETH; the dispatch's IGP payment of `16197450000001` wei matched `quoteGasPayment()` exactly), and not something a plain redeploy of the warp route can route around — the stalled ISM/validator is a Sepolia-side default trust setting for the Somnia→Sepolia lane as a whole, not tied to a specific route's contract addresses.

**Recovery options identified but not yet executed:**
1. Wait for Abacus Works to resume publishing checkpoints (no ETA; 11+ days stale already at time of writing).
2. Deploy a `trustedRelayerIsm` on Sepolia (checks `msg.sender == trustedRelayer` instead of requiring multisig signatures), point the Sepolia synthetic router's `interchainSecurityModule()` at it via the owner-only setter, then self-submit `Mailbox.process()` directly — fully bypasses the dead validator. Estimated cost: <0.005 ETH on Sepolia only, no Somnia cost, ~10-15 min of work. Trade-off: centralizes verification to whichever address is designated trusted relayer until reverted.

The 550 GBP from this stuck transfer remains locked in the Phase 7 collateral router (`0x17D7C47168C194DA59e22353eB6C7be1BB0ad18B`) — not lost, just pending until one of the above happens.

### Second GBP redeploy, using a dedicated `BRIDGE_DEPLOYER_KEY`

After waiting without resolution, the user asked for a fresh GBP warp route redeploy, explicitly using a separate `BRIDGE_DEPLOYER_KEY` wallet (`0xa8DD47BFab116C0862D6AD2B1cB05EfD58865fA1`, funded with ~8 STT / ~0.13 ETH) rather than the main deployer key, with default ISM settings (no `trustedRelayerIsm` override) — despite being told this would very likely hit the identical dead-validator wall on any real transfer, since the default ISM is a Sepolia-side, chain-pair-level setting unrelated to which key deploys the route.

Registry entry written to a new label (`GBP/somnia-sepolia-v2`, keeping the Phase 7 `GBP/somnia-sepolia` entry intact so the still-locked 550 GBP there remains traceable):

```yaml
somniatestnet:
  type: collateral
  token: "0xD1233bEa81A447aF6DBC5FB6B74EeD92F9397945"   # same real GBP Stablecoin, unchanged
  owner: "0xa8DD47BFab116C0862D6AD2B1cB05EfD58865fA1"
sepolia:
  type: synthetic
  name: "MultiX Wrapped GBP"
  symbol: "wGBP"
  decimals: 18
  owner: "0xa8DD47BFab116C0862D6AD2B1cB05EfD58865fA1"
```

Deployed via `npx hyperlane warp deploy -w GBP/somnia-sepolia-v2 -y` with `HYP_KEY` set to `BRIDGE_DEPLOYER_KEY`. Succeeded (one benign warning: Somnia's block explorer doesn't support the CLI's Etherscan-style source-verification call, contract still deployed and functional).

**New addresses:**

| Chain | Contract | Address |
|---|---|---|
| Somnia | GBP `HypERC20Collateral` v2 | `0xcFC8bEE8fe59D67Bf6F1e7F3d4883dB63512755B` |
| Sepolia | wGBP `HypERC20` synthetic v2 | `0x2d22d54aa7b1Be1486dABE03b05aF61135629775` |

Cross-chain enrollment verified on-chain (`routers(11155111)` on the new Somnia collateral router returns the new Sepolia synthetic address correctly). `frontend/constants/bridgeConfig.ts`'s GBP entry updated to these v2 addresses. USD route left untouched at Phase 7's addresses per explicit request — GBP is to be tested first.

**This route still relies on the same default (currently-dead) ISM/validator as Phase 7.** No transfer has been tested against it yet. If a real transfer here also stalls, that would fully confirm the redeploy-with-default-ISM approach cannot work while Abacus Works' validator stays down, leaving the `trustedRelayerIsm` override (or further waiting) as the only real paths forward.

---

## Phase 9 — Third GBP redeploy, validator confirmed back online, CLI upgraded

Before redeploying again, the Abacus Works Somnia-origin validator's health was checked directly (not inferred): its announced checkpoint bucket (`s3://hyperlane-testnet4-somniatestnet-validator-0/us-east-1`) now reports `checkpoint_latest_index.json` = **40**, with an S3 `Last-Modified` timestamp from earlier the same day — a live, actively-publishing validator, unlike the Phase 8 stall (stuck at index 29, 11 days stale). This means the default hosted-relayer path should work again without a `trustedRelayerIsm` workaround.

Also, per explicit instruction, current Hyperlane docs (docs.hyperlane.xyz) were re-checked directly rather than relying on this file's earlier notes — confirmed the CLI flow is unchanged: `hyperlane warp init` writes a registry entry, `hyperlane warp deploy -w <SYMBOL>/<id>` deploys both legs and enrolls the routers, `hyperlane warp send --relay -w <SYMBOL>/<id>` (or the CLI's `hyperlane relayer` for a standalone self-relay process) tests a transfer. No `--config` flag exists in any current version — registry route IDs are still the only interface.

The installed CLI (`hyperlane/package.json`) was upgraded from `36.0.0` → **`39.1.0`** (latest on npm at time of writing), since 36.0.0 was the version with the known `--relay`/Merkle-proof self-relay bug from Phase 5.

A fresh registry entry was hand-written at a new label to avoid clobbering the Phase 8 v2 entry, using the main deployer key (`0xcf9e1825Fe713bD6c7508b9f12c42Cb333fe839e`, confirmed funded: ~6.99 STT / ~0.158 Sepolia ETH) and **default ISM (no override)** — the "normal automatic" bridge, not the `trustedRelayerIsm` path:

```yaml
# ~/.hyperlane/deployments/warp_routes/GBP/somnia-sepolia-v3-deploy.yaml
somniatestnet:
  type: collateral
  token: "0xD1233bEa81A447aF6DBC5FB6B74EeD92F9397945"
  owner: "0xcf9e1825Fe713bD6c7508b9f12c42Cb333fe839e"
sepolia:
  type: synthetic
  name: "MultiX Wrapped GBP"
  symbol: "wGBP"
  decimals: 18
  owner: "0xcf9e1825Fe713bD6c7508b9f12c42Cb333fe839e"
```

Plan previewed first (`hyperlane warp deploy -w GBP/somnia-sepolia-v3`, killed before confirming) — both real Mailbox addresses resolved correctly (Somnia `0x7d498740A4572f2B5c6b0A1Ba9d1d9DbE207e89E`, Sepolia `0xfFAEF09B3cd11D9b20d1a19bECca54EEC2884766`), ISM column showed "No ISM config(s) specified" on both legs (confirming default/no override), then deployed for real:

```shell
npx hyperlane warp deploy -w GBP/somnia-sepolia-v3 -y
```

Succeeded on the first attempt. One benign warning (same as Phase 8 v2): Somnia's block explorer doesn't support the CLI's Etherscan-style source-verification call — contract still deploys and functions correctly regardless.

**New addresses:**

| Chain | Contract | Address |
|---|---|---|
| Somnia | GBP `HypERC20Collateral` v3 | `0xDB51C9E44423343044a808c99fAF20766013Ff91` |
| Sepolia | wGBP `HypERC20` synthetic v3 | `0x21fd42f82c14Ec1E2feEfe111C40C3bcc5690e16` |

Gas cost: identical to prior deploys (`0.55024974 STT` + `0.005753420839842714 ETH`).

Cross-chain enrollment independently verified via direct `routers()` reads (not just trusting the CLI's own success message):
- Somnia collateral router's `routers(11155111)` → `0x21fd42f82c14Ec1E2feEfe111C40C3bcc5690e16` (matches the Sepolia synthetic) ✓
- Sepolia synthetic's `routers(50312)` → `0xDB51C9E44423343044a808c99fAF20766013Ff91` (matches the Somnia collateral router) ✓

`frontend/constants/bridgeConfig.ts` GBP entry and `hyperlane/README.md` updated to these v3 addresses. **No transfer has been self-tested against this route** — per explicit request, the user will test it themselves (presumably through the Bridge page UI) before USD gets the same treatment. The Phase 7 (`GBP/somnia-sepolia`, 550 GBP stuck) and Phase 8 v2 (`GBP/somnia-sepolia-v2`) routes/registry entries are left untouched/orphaned; this v3 route is the one now wired into the frontend.
