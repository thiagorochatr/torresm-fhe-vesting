// Configuration for ZK App
// Update this file after deploying your contracts

export const config = {
  // Contract addresses (update after deployment)
  contracts: {
    zkMint: process.env.NEXT_PUBLIC_ZK_CONTRACT_ADDRESS || "",
    
    // Vesting System (FASE 1)
    vesting: {
      // Arbitrum Sepolia (Orchestration Layer)
      controller: process.env.NEXT_PUBLIC_VESTING_CONTROLLER || "",
      
      // Ethereum Sepolia (Computation Layer)
      wallet: process.env.NEXT_PUBLIC_VESTING_WALLET || "",
      token: process.env.NEXT_PUBLIC_VESTING_TOKEN || "",
    },
  },

  // Network configuration
  networks: {
    arbitrum: {
      chainId: 421614,
      name: "Arbitrum Sepolia",
      rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    },
    ethereum: {
      chainId: 11155111,
      name: "Ethereum Sepolia",
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    },
  },
  
  // Legacy network config (for backward compatibility)
  network: {
    chainId: 421614, // Arbitrum Sepolia
    name: "Arbitrum Sepolia",
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
  },

  // Supported tokens for ZK proofs (optional restriction)
  supportedTokens: process.env.SUPPORTED_TOKENS?.split(',') || [
    // Add default token addresses here or leave empty for any token
    // "0x...", // Example: USDC on Arbitrum Sepolia
  ],
} as const;

// Validation
if (config.contracts.zkMint === "0x...") {
  console.warn("⚠️  ZK contract address not set. Deploy contracts and update lib/config.ts");
}

if (!config.contracts.vesting.controller || !config.contracts.vesting.wallet || !config.contracts.vesting.token) {
  console.warn("⚠️  Vesting contract addresses not set. Deploy vesting contracts and update .env");
}