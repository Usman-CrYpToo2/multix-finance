#!/bin/bash
set -e  # stop on error

echo "🚀 Starting deployment..."

# -------------------------------
# Run everything in a subshell to isolate environment
# -------------------------------
(
  # -------------------------------
  # 1. Load environment variables temporarily
  # -------------------------------
  if [ -f .env ]; then
      echo "📄 Loading .env..."
      set -a  # auto-export all variables
      source .env
      set +a
  else
      echo "❌ .env file not found!"
      exit 1
  fi

  # -------------------------------
  # 2. Check required vars
  # -------------------------------
  if [ -z "$RPC_URL" ] || [ -z "$PRIVATE_KEY" ]; then
      echo "❌ RPC_URL or PRIVATE_KEY missing in .env"
      exit 1
  fi

  # -------------------------------
  # 3. Install dependencies
  # -------------------------------
  echo "📦 Installing dependencies..."
  forge install

  # -------------------------------
  # 4. Clean old builds (optional)
  # -------------------------------
  echo "🧹 Cleaning old build..."
  rm -rf out cache broadcast

  # -------------------------------
  # 5. Compile contracts
  # -------------------------------
  echo "🔨 Compiling..."
  forge build

  # -------------------------------
  # 6. Deploy contracts
  # -------------------------------
  echo "📡 Deploying contracts..."
  forge script script/multix.s.sol:MultixScript \
      --rpc-url "$RPC_URL" \
      --broadcast \
      --private-key "$PRIVATE_KEY" \
      -vv

  echo "✅ Deployment completed!"
)

# -------------------------------
# 7. End of subshell — environment variables destroyed automatically
# -------------------------------
echo "🔒 All sensitive environment variables have been removed from this shell session."