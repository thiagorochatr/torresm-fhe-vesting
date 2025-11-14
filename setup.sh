#!/bin/bash

set -e  # Exit on any error

echo ""

# Check if required tools are installed
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
}

echo "🔍 Checking required tools..."
check_tool "pnpm"
check_tool "cargo"

# Check for circom
if ! command -v "circom" &> /dev/null; then
    echo "⚠️  circom not found. Installing globally..."
    npm install -g circom@latest
    if ! command -v "circom" &> /dev/null; then
        echo "❌ Failed to install circom. Please install manually:"
        echo "   npm install -g circom"
        exit 1
    fi
fi

echo "✅ All required tools found"
echo ""

# 1. Install root dependencies for scripts
echo "📦 Installing root dependencies..."
pnpm install

# 2. Generate oracle keypair and inject into circuit
echo "🔑 Generating oracle keypair..."
node scripts/generate-oracle-keys.js

# 3. Install and build circuits
echo "📦 Installing circuit dependencies..."
cd circuits
pnpm install

echo "🔧 Building ZK circuits..."
pnpm run build

cd ..

# 4. Inject verifying key into contract
echo "🔑 Injecting verifying key into contract..."
node scripts/inject-vk.js

# 5. Copy circuit artifacts to app
echo "📂 Copying circuit artifacts to app..."
mkdir -p app/lib/circuits

if [ -f "circuits/build/token_ownership_js/token_ownership.wasm" ]; then
    cp circuits/build/token_ownership_js/token_ownership.wasm app/lib/circuits/
    echo "✅ Copied token_ownership.wasm"
else
    echo "❌ Missing token_ownership.wasm"
    exit 1
fi

if [ -f "circuits/build/circuit_final.zkey" ]; then
    cp circuits/build/circuit_final.zkey app/lib/circuits/
    echo "✅ Copied circuit_final.zkey"
else
    echo "❌ Missing circuit_final.zkey"
    exit 1
fi

if [ -f "circuits/build/verification_key.json" ]; then
    cp circuits/build/verification_key.json app/lib/circuits/
    echo "✅ Copied verification_key.json"
else
    echo "❌ Missing verification_key.json"
    exit 1
fi

# 6. Install app dependencies
echo "📦 Installing app dependencies..."
cd app
pnpm install
cd ..

echo ""
echo "🎉 Setup complete!"