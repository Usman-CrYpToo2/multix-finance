# Local Deployment (Anvil)

How to run the full MultiX Finance protocol and frontend on your own machine using a local anvil chain.

The Hyperlane bridge and the Somnia AI-agent price feed do **not** work locally. Everything else (deposit, borrow, repay, withdraw, liquidate, faucet, markets) does.

---

## Prerequisites (one time)

- **Foundry** (`forge`, `cast`, `anvil`). Install with `curl -L https://foundry.paradigm.xyz | bash`, then run `foundryup`.
- **Python 3**, which the deploy script uses to parse JSON.
- **Node.js + npm**, for the frontend.
- **MetaMask** (or any browser wallet).

Install the contract and frontend dependencies:

```shell
cd multix-finance
forge install
cd frontend && npm install && cd ..
```

---

## Step 1: Start anvil

Open a terminal and keep it running:

```shell
anvil
```

This starts a local chain at `http://127.0.0.1:8545` with chain ID `31337`, plus 10 test accounts that each hold 10,000 ETH.

> The deploy script does **not** start anvil for you. If anvil isn't running, the script stops with `No node reachable at http://127.0.0.1:8545`.

---

## Step 2: Deploy the contracts

In a **second terminal**, from the repo root:

```shell
./deploy-local.sh
```

To also fund your own MetaMask wallet with 100 ETH and 10 WETH:

```shell
FUND_ADDRESS=0xYourWalletAddress ./deploy-local.sh
```

The script:

1. Checks that anvil is running and is chain 31337. It refuses any other chain.
2. Compiles the contracts (`forge build`).
3. Deploys MockWETH, the Oracle, the Factory and the Router.
4. Connects the Router to the Factory and authorizes the Factory on the Oracle.
5. Creates four markets: **GBP, USD, EUR, PKR**. They use the same LTV and interest settings as the live Somnia markets.
6. Pushes **live oracle prices**: ETH/USD from Coinbase (CoinGecko as backup), and GBP, EUR and PKR from Frankfurter. If the APIs can't be reached it uses fallback prices.
7. Mints 100 WETH to the deployer (anvil account #0).
8. Writes all addresses to `frontend/constants/addresses.local.ts`, so the frontend picks them up automatically.

It ends with `✅ Local deployment completed!`.

> On a **fresh** anvil the addresses are always the same: WETH `0x5FbDB2315678afecb367f032d93F642f64180aa3`, Router `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`, and so on.

---

## Step 3: Start the frontend in local mode

In a **third terminal**:

```shell
cd frontend
npm run dev:local
```

Open http://localhost:3000.

- `npm run dev:local` connects to **anvil** (chain 31337) using `addresses.local.ts`.
- `npm run dev` (normal) still connects to **Somnia Testnet** using `addresses.ts`.

---

## Step 4: Set up MetaMask

1. **Add the anvil network.** In MetaMask go to Networks, then Add network, then Add a network manually:
   - Network name: `Anvil`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`
2. **Get an account with funds**, in one of two ways:
   - **Option A:** import anvil account #0. In MetaMask choose Import account and paste this private key:
     ```
     0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
     ```
     This is a public test key. Never use it on a real network.
   - **Option B:** use your own wallet and deploy with `FUND_ADDRESS=0xYourWallet ./deploy-local.sh` (see Step 2).
3. Connect the wallet in the app and switch to the **Anvil** network.

---

## Step 5: Use the app

1. **Faucet** page: mint test WETH, if your wallet doesn't already have some.
2. **Borrow** page: pick a market (GBP/USD/EUR/PKR), then approve WETH, deposit collateral and borrow.
3. **Markets** page: check total collateral and debt for each market.
4. Repay and withdraw from the vault modals.

---

## Refreshing or changing prices

Oracle prices go **stale after 24 hours**, and borrowing then fails with `RateStale`. To refresh them without redeploying:

```shell
./deploy-local.sh prices
```

To set a price yourself, for example to make positions liquidatable:

```shell
ETH_PRICE=1500 ./deploy-local.sh prices
GBP_PRICE=1.5 EUR_PRICE=1.2 ./deploy-local.sh prices
```

To skip the price APIs and use the built-in fallback prices:

```shell
STATIC_PRICES=1 ./deploy-local.sh
```

---

## Restarting anvil

anvil does not save its chain, so stopping it deletes everything that was deployed. After restarting:

1. `anvil` (terminal 1)
2. `./deploy-local.sh` (terminal 2)
3. Restart `npm run dev:local`, or just refresh the page.
4. **In MetaMask:** Settings, then Advanced, then **Clear activity tab data**. Otherwise transactions fail with a nonce error, because MetaMask remembers the old chain's transaction count.

---

## Options reference

| Variable | Default | Purpose |
|---|---|---|
| `LOCAL_RPC_URL` | `http://127.0.0.1:8545` | anvil RPC (e.g. use another port) |
| `LOCAL_PRIVATE_KEY` | anvil account #0 | deployer key |
| `FUND_ADDRESS` | — | wallet to send 100 ETH + 10 WETH |
| `STATIC_PRICES` | `0` | `1` skips the live price APIs |
| `ETH_PRICE`, `GBP_PRICE`, `EUR_PRICE`, `PKR_PRICE`, `USD_PRICE` | live price | force a USD price |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `No node reachable at http://127.0.0.1:8545` | Start `anvil` first (Step 1). |
| `expected anvil (31337). Refusing to deploy.` | `LOCAL_RPC_URL` points at a non-local chain. Point it at anvil. |
| `No oracle at ... run ./deploy-local.sh first` | You ran `prices` on a fresh anvil. Run a full deploy first. |
| Borrow fails / `RateStale` | Run `./deploy-local.sh prices`. |
| MetaMask "nonce too high" | Clear activity tab data (see Restarting anvil). |
| Frontend shows Somnia data | You ran `npm run dev`. Use `npm run dev:local`. |
| Bridge page doesn't work | Expected: the bridge only exists on Somnia/Sepolia. |
