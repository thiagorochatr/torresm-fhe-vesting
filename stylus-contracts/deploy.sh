#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Check if required variables are set
if [ -z "$RPC_URL" ] || [ -z "$PRIVATE_KEY" ] || [ -z "$OWNER_ADDRESS" ]; then
    echo "Error: Required environment variables not set"
    echo "Please ensure RPC_URL, PRIVATE_KEY, and OWNER_ADDRESS are set in .env"
    exit 1
fi

# Default min required balance: 0.1 ETH scaled by 10^6 = 100_000
# Can be overridden by setting MIN_REQUIRED_BALANCE in .env
MIN_BALANCE=${MIN_REQUIRED_BALANCE:-100000}

echo "Deploying contract with owner: $OWNER_ADDRESS"
echo "Minimum required balance: $MIN_BALANCE (scaled by 10^6)"
echo "Using RPC: $RPC_URL"
echo ""

# Deploy the contract
# Constructor args: (owner_address, min_required_balance)
cargo stylus deploy \
    --endpoint="$RPC_URL" \
    --private-key="$PRIVATE_KEY" \
    --constructor-args "$OWNER_ADDRESS" "$MIN_BALANCE"


