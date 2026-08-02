# AI Oracle (Somnia Agents) — How It Works

This document explains `src/oracle/HybridFiatPriceFeed.sol` end-to-end: the original
bot-push oracle it already had, and the new AI-agent-driven price update path built
on top of it using [Somnia Agents](https://docs.somnia.network/agents).

The core rule the whole design is built around:

> **`latestRoundData()` and `getEthPriceForPool()` never changed.** Same signature,
> same reverts, same math, same return tuple. The AI path only feeds new *inputs*
> into the same storage those two functions already read from.

---

## 1. What this contract is

`HybridFiatPriceFeed` is the single shared price oracle for every CDP market in the
protocol. Each market's `CDPEngine` calls `latestRoundData()` on it to convert
between WETH and its fiat stablecoin (GBP, USD, ...), mimicking the shape of a
Chainlink price feed so the rest of the codebase never had to change.

It needs two numbers to answer that question for a given pool:

1. **`ethUsdPrice`** — one global ETH/USD price shared by every pool.
2. **`poolFxRates[pool]`** — that pool's fiat-to-USD FX rate (e.g. USD/GBP).

```
price of 1 ETH in the pool's fiat currency  =  ethUsdPrice * 10^8 / poolFxRates[pool]
```

Everything else in the contract exists to answer one question: **how do these two
numbers get updated?** There are now two independent ways to update them, and they
write to the exact same storage slots.

---

## 2. The two update paths

### Path A — Bot push (original, unchanged)

A trusted off-chain bot (or the owner) calls:

- `updateFxRate(pool, newRate)` — pushes a new FX rate for one whitelisted pool.
- `updateEthPrice(currentPrice)` — pushes a new global ETH/USD price.

Both are synchronous, single-transaction writes gated by `onlyBot` + `isAlive`
(+ `onlyWhitelistedPool` for the FX one). This is the simplest path: some off-chain
process (a script, a keeper) fetches a price itself and submits it directly.

### Path B — AI agent pull (new)

Instead of *you* running a bot that fetches a price and pushes it, you ask the
**Somnia network itself** to fetch the price on your behalf, reach consensus among
multiple independent validators on what that price is, and deliver the validated
result back to this contract automatically. This is the "AI oracle" the user asked
for: an on-chain request that triggers an off-chain HTTP fetch, validated by a
decentralized subcommittee, delivered back via callback — no need to trust a single
bot operator.

This path is two calls, split across time:

1. **Request** (this contract → Somnia Agents platform): `requestFxRateUpdate(pool)`
   or `requestEthPriceUpdate()`.
2. **Callback** (Somnia Agents platform → this contract), sometime later, once
   consensus is reached: `handleResponse(...)`.

Both paths write into the *same* four storage variables
(`poolFxRates`, `lastFxUpdateTimestamps`, `ethUsdPrice`, `lastEthUpdateTimestamp`),
so `latestRoundData()` has no idea which path produced the number it's reading —
that's the whole point.

---

## 3. Somnia Agents — the underlying primitive

Somnia Agents is a general "ask the network to run arbitrary off-chain logic and
get a consensus-backed answer on-chain" system. The pieces relevant here, all
mirrored in `src/interfaces/Oracle/ISomniaAgents.sol`:

- **`IAgentRequester`** — the platform contract you submit requests to
  (`somniaAgents` in this contract, hardcoded to Somnia Testnet's deployment at
  construction: `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`, overridable via
  `setSomniaAgentsPlatform`).
- **Agents** — pre-built off-chain programs identified by a numeric `agentId`.
  This contract uses Somnia's built-in **"JSON API Request" agent**
  (`IJsonApiAgent`): given a URL and a dot-notation JSON selector (e.g.
  `"rates.GBP"`), it fetches that URL off-chain and extracts one field.
- **Subcommittee + consensus** — when you call `createRequest`, the platform
  assigns a random subcommittee of validator nodes to independently run the agent
  (fetch the URL, extract the field) and submit their results. If enough of them
  agree (`ConsensusType.Majority`/`Threshold`), the request is marked
  `ResponseStatus.Success` and your callback is invoked with the agreed-upon result.
  If they disagree or nobody answers in time, you get `Failed`/`TimedOut` instead.
- **Deposit** — creating a request costs `platform.getRequestDeposit()` plus a
  reward per subcommittee member (`perAgentBudget * subcommitteeSize`), paid as
  `msg.value`. This funds the validators that do the off-chain work.

This contract never talks to an HTTP API directly — Solidity can't do that. It asks
the Somnia network to do it and waits for the callback.

---

## 4. Walking through a request end-to-end

### Example: refreshing the GBP pool's FX rate

**Step 0 — one-time setup (owner only, done once per pool/feed):**

```solidity
oracle.setJsonApiAgentId(<real JSON API Request agent id>);
oracle.setPoolApiSource(
    gbpPoolAddress,
    "https://api.exchangerate.host/latest?base=USD",
    "rates.GBP"
);
```

`setJsonApiAgentId` points at the correct built-in agent on whichever Somnia Agents
deployment `somniaAgents` currently points to. `setPoolApiSource` tells the contract
*where* to fetch this specific pool's rate from and *which field* in the JSON
response to read. Every whitelisted pool needs its own `poolApiUrl`/`poolApiSelector`
pair set before its AI path works; `ethApiUrl`/`ethApiSelector` (via
`setEthApiSource`) is the equivalent one-time config for the shared ETH/USD price.

**Step 1 — request:**

```solidity
oracle.requestFxRateUpdate{value: deposit}(gbpPoolAddress);
```

Inside `requestFxRateUpdate`:

1. Checks `poolApiUrl[pool]` is configured (`ApiSourceNotConfigured` otherwise).
2. ABI-encodes a call to `IJsonApiAgent.fetchUint(url, selector, decimals)` — this
   is the *payload* the off-chain agent will execute. `decimals` here is `8`, this
   contract's fixed price precision, so the fetched number comes back already
   scaled to match everything else in the contract.
3. Calls `_createAgentRequest`, which:
   - Computes the required deposit (`platform.getRequestDeposit() + perAgentBudget * subcommitteeSize`).
   - Reverts with `InsufficientAgentDeposit` if you didn't send enough ETH.
   - Calls `somniaAgents.createRequest{value: deposit}(jsonApiAgentId, address(this), this.handleResponse.selector, payload)`
     — this tells the platform: "run this JSON API agent with this payload, and
     when you're done, call `handleResponse` on me."
   - Refunds any excess `msg.value` back to the caller.
4. Records `pendingAiRequests[requestId] = {kind: Fx, pool: gbpPoolAddress}` so the
   callback later knows what this particular request was *for* (the platform's
   callback doesn't carry that context itself beyond the raw result bytes).
5. Emits `AiFxRateRequested(requestId, pool)`.

At this point the transaction is done and mined. Nothing has updated yet — this
was just the *ask*.

**Step 2 — off-chain (not this contract, not this repo):** Somnia's network picks a
subcommittee, each validator independently fetches
`https://api.exchangerate.host/latest?base=USD`, extracts `rates.GBP`, and submits
their result to the platform. Once enough validators agree, the platform finalizes
the request and calls back.

**Step 3 — callback:**

```solidity
function handleResponse(uint256 requestId, Response[] memory responses, ResponseStatus status, Request memory) external override
```

This is invoked *by the Somnia Agents platform contract*, not by any user. Inside:

1. `msg.sender != address(somniaAgents)` → revert `UnauthorizedAgentCallback`.
   This is the critical trust boundary: only the platform contract itself can ever
   call this function, so nobody can forge a fake price update by calling
   `handleResponse` directly.
2. Looks up `pendingAiRequests[requestId]`; if it's `AiRequestKind.None` (never
   requested, or already handled), revert `UnknownAgentRequest`. Then deletes the
   entry immediately (each request can only be consumed once).
3. If the oracle was killed in the meantime, or consensus wasn't reached
   (`status != Success`), or there are no responses at all — this does **not**
   revert. It just emits `AiPriceUpdateFailed(requestId, kind, pool, status)` and
   returns. A failed/timed-out AI request is a no-op on price state, not an error
   that reverts the platform's callback transaction.
4. Decodes the agreed result: `abi.decode(responses[0].result, (uint256))` (all
   subcommittee members that reached consensus reported the same value, so
   `responses[0]` is representative). A decoded `0` is also treated as a failure
   (emits `AiPriceUpdateFailed`) rather than being written — a zero price would
   later revert every `latestRoundData()` call for that pool, so it's rejected here
   instead.
5. Otherwise, writes the value into the *same storage the bot-push path uses*:
   - `Fx` request → `poolFxRates[pool] = value`, `lastFxUpdateTimestamps[pool] = block.timestamp`, emits the existing `FxRateUpdated` event.
   - `Eth` request → `ethUsdPrice = value`, `lastEthUpdateTimestamp = block.timestamp`, emits the existing `EthPriceUpdated` event.

From here, the next `latestRoundData()` call for that pool sees the fresh rate,
computed with identical math to before, staleness-checked against the same
86400-second window as always.

**The `receive() external payable {}`** exists for the case where the Somnia
Agents platform refunds *this contract* unused deposit (e.g. a request that
finalizes before spending its full budget) — the contract needs a payable
fallback to accept that transfer rather than reverting it. (The excess-`msg.value`
refund to the original caller, handled inside `_createAgentRequest`, is separate —
that one goes straight back to `msg.sender`.)

---

## 5. Why `latestRoundData()` is guaranteed unaffected

```solidity
function latestRoundData() external view isAlive onlyWhitelistedPool(msg.sender)
    returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
{
    uint256 currentFxRate = poolFxRates[msg.sender];
    uint256 lastFxUpdate = lastFxUpdateTimestamps[msg.sender];
    uint256 currentEthPrice = ethUsdPrice;
    ...
}
```

This function only ever reads `poolFxRates`, `lastFxUpdateTimestamps`,
`ethUsdPrice`, `lastEthUpdateTimestamp` — plain storage reads. It has no idea
whether the last write to those slots came from `updateFxRate`/`updateEthPrice`
(Path A) or `handleResponse` (Path B). Both paths funnel into identical writes:

| Field                         | Bot push writes it in    | AI callback writes it in |
|-------------------------------|---------------------------|----------------------------|
| `poolFxRates[pool]`           | `updateFxRate`            | `handleResponse` (Fx)       |
| `lastFxUpdateTimestamps[pool]`| `updateFxRate`            | `handleResponse` (Fx)       |
| `ethUsdPrice`                 | `updateEthPrice`          | `handleResponse` (Eth)      |
| `lastEthUpdateTimestamp`      | `updateEthPrice`          | `handleResponse` (Eth)      |

Same types (`uint256`), same units (fixed-point, 8 decimals), same staleness rule.
`getEthPriceForPool()` is the same story. No signature, revert, or return-format
change was made anywhere — verified by `forge build` (clean) and the full test
suite (`forge test`, 9/9 passing, including
`test_latestRoundData_usesConfiguredEthAndFxPrices()` returning the exact same
value, `155543674698`, as before this feature existed).

---

## 6. Trust and safety model

- **Who can request an AI price update?** `onlyBot` — same authorized-bot list
  used for the push path (`authorizedBots[msg.sender] || msg.sender == owner()`).
  Random users can't spend the contract's/oracle-operator's funds spamming requests.
- **Who can deliver a result?** Only `address(somniaAgents)` — enforced in
  `handleResponse`. The Somnia platform itself is trusted to only invoke this after
  genuine subcommittee consensus; this contract cannot be tricked by a third party
  calling `handleResponse` directly, nor by a validator unilaterally.
- **What if the agent/API fails, disagrees, or times out?** No price is written —
  `AiPriceUpdateFailed` is emitted, existing rates stay in place, and they'll
  eventually go stale (`RateStale` after 86400s) if never successfully refreshed
  through either path.
- **What if the oracle is killed mid-flight?** `handleResponse` checks `!live` and
  treats it as a failure — a request made before `killOracle()` can't sneak a price
  in after the kill switch is thrown.
- **Replay/double-spend of a request:** `pendingAiRequests[requestId]` is deleted
  as soon as it's read in `handleResponse`, so the same `requestId` can't be
  processed twice.
- **Per-pool isolation:** `requestFxRateUpdate` is gated by
  `onlyWhitelistedPool(_pool)`, same as the push path — you can't request a rate
  for a pool that was never whitelisted (or was de-whitelisted, which also zeroes
  its rate/timestamp in `setPoolWhitelist`).

---

## 7. Setup — now pre-wired in the constructor and deploy script

Everything the AI path needs is configured automatically on deploy:

1. **`jsonApiAgentId`** — hardcoded in the constructor to `13174292974160097713`,
   the real agent id for Somnia Testnet's built-in "JSON API Request" base agent
   (confirmed from the live agent listing, not a placeholder). Still
   owner-overridable via `setJsonApiAgentId(id)` if Somnia ever changes it or you
   move to a different network's deployment.
2. **`setEthApiSource(...)`** — called in `script/multix.s.sol` right after market
   creation, pointing at CoinGecko:
   ```
   url:      https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd
   selector: ethereum.usd
   ```
3. **`setPoolApiSource(gbpPool, ...)`** — same script step, pointing at Frankfurter
   (free, keyless, ECB-backed FX rates):
   ```
   url:      https://api.frankfurter.app/latest?from=USD&to=GBP
   selector: rates.GBP
   ```
4. **USD pool** is intentionally left off the AI path — it's a fixed 1.0 USD/USD
   baseline, so it just stays on the bot-push value set once via
   `oracle.updateFxRate(USDPool, 1e8)`. No API call needed for a rate that never
   moves.
5. (Optional) `setSomniaAgentsPlatform(address)` — only if you need to point at a
   different Agents platform deployment than the hardcoded Somnia Testnet address
   baked into the constructor (`0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`).
6. (Optional) `setAgentRequestParams(subcommitteeSize, perAgentRewardWei)` — tune
   how large a subcommittee validates each request and how much each member is
   paid; defaults are `3` and `0.03 ether`.

Any new fiat market added later (a new `createMarket()` call) will need its own
`setPoolApiSource` call added — the script only wires GBP/USD because those are
the two markets it deploys. The bot-push path (`updateFxRate`/`updateEthPrice`)
keeps working independently regardless, as a fallback or primary mechanism if the
AI path is ever paused.

**Why ETH stays on the JSON-API-agent path instead of an on-chain feed:** Somnia
does have live on-chain price oracles (Protofire's Chainlink-compatible ETH/USD
feed, DIA), which are arguably more robust than scraping one HTTP API. We
deliberately kept ETH on the same AI-agent path as the FX rates for now, for
architectural consistency (one update mechanism, one code path) — swapping ETH to
read from Protofire directly is a small, isolated follow-up if reliability ever
becomes a concern, and wouldn't touch `latestRoundData()` either.

---

## 8. Quick reference — new surface area

| Function | Caller | Purpose |
|---|---|---|
| `requestFxRateUpdate(pool)` | authorized bot/owner | Kick off an AI-fetched FX rate refresh for one pool |
| `requestEthPriceUpdate()` | authorized bot/owner | Kick off an AI-fetched ETH/USD price refresh |
| `handleResponse(...)` | Somnia Agents platform only | Consensus callback; writes the fetched price into existing storage |
| `setSomniaAgentsPlatform(address)` | owner | Repoint at a different Agents platform deployment |
| `setJsonApiAgentId(id)` | owner | Set the JSON API Request base agent id |
| `setAgentRequestParams(size, rewardWei)` | owner | Tune subcommittee size / reward |
| `setPoolApiSource(pool, url, selector)` | owner | Configure a pool's FX-rate API source |
| `setEthApiSource(url, selector)` | owner | Configure the ETH/USD API source |
| `receive()` | anyone (platform refunds) | Accept unused-deposit refunds |

Everything else in the contract — `updateFxRate`, `updateEthPrice`,
`latestRoundData`, `getEthPriceForPool`, whitelist/bot admin, `killOracle` — is
untouched from before this feature existed.
