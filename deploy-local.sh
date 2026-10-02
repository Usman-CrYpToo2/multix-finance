#!/bin/bash
set -eo pipefail

# -------------------------------------------------------------------------
# Local anvil deployment for MultiX Finance.
#
#   ./deploy-local.sh            full deploy: WETH, Oracle, Factory, Router,
#                                GBP/USD/EUR/PKR markets, oracle prices, and
#                                regenerates frontend/constants/addresses.local.ts
#   ./deploy-local.sh prices     only re-push oracle prices to the existing
#                                local deployment (prices go stale after 24h)
#
# Then run the frontend against anvil with:  cd frontend && npm run dev:local
#
# Unlike deploy.sh this never reads .env (so it can't accidentally pick up the
# Somnia key/RPC) and refuses to run against anything but chain 31337. Start
# anvil yourself first (just run `anvil` in another terminal).
#
# Optional env overrides:
#   LOCAL_RPC_URL      default http://127.0.0.1:8545
#   LOCAL_PRIVATE_KEY  default anvil account #0
#   FUND_ADDRESS       wallet (e.g. your MetaMask) to receive 100 ETH + 10 WETH
#   STATIC_PRICES=1    skip live price APIs and use the fallback prices below
#   ETH_PRICE / GBP_PRICE / EUR_PRICE / PKR_PRICE / USD_PRICE
#                      force a USD price (e.g. ETH_PRICE=1500 to test liquidations)
#
# The Somnia AI-agent price sources and the Hyperlane bridge are skipped - neither
# exists on a local chain.
# -------------------------------------------------------------------------

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_ADDRESSES_FILE="$SCRIPT_DIR/frontend/constants/addresses.local.ts"

RPC_URL="${LOCAL_RPC_URL:-http://127.0.0.1:8545}"
# Well-known anvil account #0 key - only ever valid on a local devnet.
PRIVATE_KEY="${LOCAL_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
ANVIL_CHAIN_ID=31337

# Fallback prices (USD) when the live APIs are unreachable or STATIC_PRICES=1.
FALLBACK_ETH=3000
FALLBACK_GBP=1.30
FALLBACK_EUR=1.08
FALLBACK_PKR=0.0036

MODE="${1:-deploy}"
case "$MODE" in
  deploy|prices) ;;
  *) echo "Usage: $0 [deploy|prices]" >&2; exit 1 ;;
esac

# -------------------------------
# Helpers
# -------------------------------

ensure_anvil() {
  if ! cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then
    echo "❌ No node reachable at $RPC_URL - start anvil first (e.g. run \`anvil\` in another terminal)." >&2
    exit 1
  fi
}

require_local_chain() {
  local chain_id
  chain_id="$(cast chain-id --rpc-url "$RPC_URL")"
  if [ "$chain_id" != "$ANVIL_CHAIN_ID" ]; then
    echo "❌ $RPC_URL is chain $chain_id, expected anvil ($ANVIL_CHAIN_ID). Refusing to deploy." >&2
    exit 1
  fi
}

# Args: contract ref (path:Name), [constructor args...]. Prints deployed address.
deploy() {
  local contract_ref="$1"
  shift
  local result
  if [ "$#" -gt 0 ]; then
    # --constructor-args is variadic, so it must stay the LAST flag.
    result="$(forge create "$contract_ref" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" \
        --broadcast --json --constructor-args "$@")"
  else
    result="$(forge create "$contract_ref" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" \
        --broadcast --json)"
  fi
  python3 -c "import json,sys; print(json.load(sys.stdin)['deployedTo'])" <<< "$result"
}

# Args: to, function sig, call args... Prints the `cast send --json` receipt.
send() {
  local result status
  result="$(cast send --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" "$@" --json)"
  status="$(python3 -c "import json,sys; print(json.load(sys.stdin)['status'])" <<< "$result")"
  case "$status" in
    1|"0x1"|true|True) ;;
    *) echo "❌ call $2 on $1 reverted (status=$status)" >&2; exit 1 ;;
  esac
  printf '%s' "$result"
}

# Args: label, country, currency, borrow-params tuple. Prints "stableCoin cdpEngine".
create_market() {
  local label="$1" country="$2" currency="$3" bparams="$4"
  local receipt topic0
  receipt="$(send "$factory" \
      "createMarket((string,string),(uint256,uint256,uint16,uint16,uint16,uint16))" \
      "($country,$currency)" "$bparams")" || return 1
  topic0="$(cast keccak "MarketCreated(address,address,address,uint256)")"
  python3 -c '
import json, sys
topic0 = sys.argv[1].lower()
for log in json.loads(sys.argv[2]).get("logs", []):
    topics = log.get("topics", [])
    if topics and topics[0].lower() == topic0:
        print("0x" + topics[1][-40:], "0x" + topics[3][-40:])
        break
else:
    sys.exit("Could not find MarketCreated log for " + sys.argv[3])
' "$topic0" "$receipt" "$label"
}

# Args: url, dotted JSON path, fallback. Prints the value, or the fallback (may be empty) on any error.
fetch_price() {
  local url="$1" path="$2" fallback="$3"
  if [ "${STATIC_PRICES:-0}" = "1" ]; then
    echo "$fallback"
    return
  fi
  local body
  body="$(curl -fsS --max-time 8 "$url" 2>/dev/null || true)"
  python3 -c '
import json, sys
try:
    value = json.loads(sys.argv[3])
    for key in sys.argv[1].split("."):
        value = value[key]
    if float(value) <= 0:
        raise ValueError
    print(value)
except Exception:
    if sys.argv[2]:
        print("  (price API unavailable, using fallback " + sys.argv[2] + ")", file=sys.stderr)
    print(sys.argv[2])
' "$path" "$fallback" "$body"
}

# USD decimal -> 8-decimal oracle integer.
to_oracle_units() {
  python3 -c "from decimal import Decimal; print(int(Decimal('$1') * 10**8))"
}

push_prices() {
  echo "💱 Pushing oracle prices..."
  local eth gbp eur pkr usd
  eth="${ETH_PRICE:-$(fetch_price "https://api.coinbase.com/v2/prices/ETH-USD/spot" "data.amount" "")}"
  if [ -z "$eth" ]; then
    eth="$(fetch_price "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd" "ethereum.usd" "$FALLBACK_ETH")"
  fi
  gbp="${GBP_PRICE:-$(fetch_price "https://api.frankfurter.dev/v2/rate/GBP/USD" "rate" "$FALLBACK_GBP")}"
  eur="${EUR_PRICE:-$(fetch_price "https://api.frankfurter.dev/v2/rate/EUR/USD" "rate" "$FALLBACK_EUR")}"
  pkr="${PKR_PRICE:-$(fetch_price "https://api.frankfurter.dev/v2/rate/PKR/USD" "rate" "$FALLBACK_PKR")}"
  usd="${USD_PRICE:-1}"

  send "$oracle" "updateEthPrice(uint256)" "$(to_oracle_units "$eth")" > /dev/null
  send "$oracle" "updateFxRate(address,uint256)" "$gbp_pool" "$(to_oracle_units "$gbp")" > /dev/null
  send "$oracle" "updateFxRate(address,uint256)" "$usd_pool" "$(to_oracle_units "$usd")" > /dev/null
  send "$oracle" "updateFxRate(address,uint256)" "$eur_pool" "$(to_oracle_units "$eur")" > /dev/null
  send "$oracle" "updateFxRate(address,uint256)" "$pkr_pool" "$(to_oracle_units "$pkr")" > /dev/null

  echo "  -> ETH/USD $eth | GBP/USD $gbp | USD/USD $usd | EUR/USD $eur | PKR/USD $pkr"
}

write_local_addresses() {
  cat > "$LOCAL_ADDRESSES_FILE" <<EOF
// Auto-generated by deploy-local.sh for the local anvil chain (31337). Do not edit manually.
// Used by the frontend instead of addresses.ts when started with \`npm run dev:local\`.
export const CONTRACT_ADDRESSES = {
  WETH: "$weth",
  ORACLE: "$oracle",
  FACTORY: "$factory",
  ROUTER: "$router",
  GBP_STABLE: "$gbp_stable",
  GBP_POOL: "$gbp_pool",
  USD_Stable: "$usd_stable",
  USD_Pool: "$usd_pool",
  EUR_STABLE: "$eur_stable",
  EUR_POOL: "$eur_pool",
  PKR_STABLE: "$pkr_stable",
  PKR_POOL: "$pkr_pool"
} as const;
EOF
}

# Reads a key's address out of addresses.local.ts (used by `prices` mode).
read_local_address() {
  python3 -c '
import re, sys
match = re.search(r"\b" + sys.argv[2] + r":\s*\"(0x[0-9a-fA-F]{40})\"", open(sys.argv[1]).read())
if not match:
    sys.exit("Missing " + sys.argv[2] + " in " + sys.argv[1])
print(match.group(1))
' "$LOCAL_ADDRESSES_FILE" "$1"
}

# -------------------------------
# Main
# -------------------------------

cd "$SCRIPT_DIR"

ensure_anvil
require_local_chain

DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
echo "👛 Deployer: $DEPLOYER ($RPC_URL)"

if [ "$MODE" = "prices" ]; then
  oracle="$(read_local_address ORACLE)"
  gbp_pool="$(read_local_address GBP_POOL)"
  usd_pool="$(read_local_address USD_Pool)"
  eur_pool="$(read_local_address EUR_POOL)"
  pkr_pool="$(read_local_address PKR_POOL)"
  if [ "$(cast code "$oracle" --rpc-url "$RPC_URL")" = "0x" ]; then
    echo "❌ No oracle at $oracle on this chain - run ./deploy-local.sh first." >&2
    exit 1
  fi
  push_prices
  echo "✅ Prices refreshed."
  exit 0
fi

echo "🔨 Compiling..."
forge build

echo "📡 Deploying contracts..."
weth="$(deploy "script/multix.s.sol:MockWETH")"
echo "  -> WETH:    $weth"
oracle="$(deploy "src/oracle/HybridFiatPriceFeed.sol:HybridFiatPriceFeed" "$DEPLOYER" "$DEPLOYER")"
echo "  -> Oracle:  $oracle"
factory="$(deploy "src/MultiFiatFactory.sol:MultiFiatFactory" "$weth" "$oracle")"
echo "  -> Factory: $factory"
router="$(deploy "src/MultiFiatRouter.sol:MultiFiatRouter" "$factory")"
echo "  -> Router:  $router"

echo "🔌 Wiring contracts together..."
send "$factory" "setRouter(address)" "$router" > /dev/null
send "$oracle" "setBotAuthorization(address,bool)" "$factory" true > /dev/null

# Borrow params: (minBorrow, minCollat, safeLtvBp, liquidationLtvBp, penaltyBp, borrowRatePerYearBp),
# matching the live Somnia markets.
echo "🏦 Creating markets..."
# (Assigned first, then split, so a failed createMarket aborts the script under set -e.)
gbp_market="$(create_market GBP GB GBP "(10000,10000,7000,7500,500,1000)")"
usd_market="$(create_market USD USD USD "(10000,10000,7000,8000,500,600)")"
eur_market="$(create_market EUR EU EUR "(10000,10000,7000,7500,500,1000)")"
pkr_market="$(create_market PKR PK PKR "(10000,10000,7000,7500,500,1200)")"
read -r gbp_stable gbp_pool <<< "$gbp_market"
read -r usd_stable usd_pool <<< "$usd_market"
read -r eur_stable eur_pool <<< "$eur_market"
read -r pkr_stable pkr_pool <<< "$pkr_market"
for var in gbp_stable gbp_pool usd_stable usd_pool eur_stable eur_pool pkr_stable pkr_pool; do
  checksummed="$(cast --to-checksum-address "${!var}")"
  printf -v "$var" '%s' "$checksummed"
done
echo "  -> GBP: stable $gbp_stable / pool $gbp_pool"
echo "  -> USD: stable $usd_stable / pool $usd_pool"
echo "  -> EUR: stable $eur_stable / pool $eur_pool"
echo "  -> PKR: stable $pkr_stable / pool $pkr_pool"

push_prices

echo "💧 Minting 100 WETH to deployer..."
send "$weth" "mint(address,uint256)" "$DEPLOYER" 100ether > /dev/null

if [ -n "$FUND_ADDRESS" ]; then
  echo "💧 Funding $FUND_ADDRESS with 100 ETH + 10 WETH..."
  send "$FUND_ADDRESS" --value 100ether > /dev/null
  send "$weth" "mint(address,uint256)" "$FUND_ADDRESS" 10ether > /dev/null
fi

write_local_addresses
echo "📝 Updated frontend addresses at $LOCAL_ADDRESSES_FILE"

echo "✅ Local deployment completed!"
echo "   Frontend: cd frontend && npm run dev:local"
echo "   Wallet:   add network http://127.0.0.1:8545 (chain 31337) and import an anvil account,"
echo "             or re-run with FUND_ADDRESS=0xYourWallet to fund your own."
