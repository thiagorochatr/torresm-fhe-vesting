import { ethers } from "hardhat";

/**
 * Deploy VestingController to Arbitrum Sepolia
 * 
 * Usage:
 * npx hardhat run scripts/deploy-arbitrum.ts --network arbitrumSepolia
 * 
 * Note: Make sure to add arbitrumSepolia network to hardhat.config.ts first!
 * 
 * FASE 1: Simple deployment
 * FASE 2: Will integrate with ZK verifier (Stylus)
 * FASE 3: Will add proper ZK proof validation
 */
async function main() {
  console.log("\n🚀 Deploying VestingController to Arbitrum Sepolia...");
  console.log("=".repeat(60));

  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);
  
  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(balance), "ETH");
  
  if (balance === 0n) {
    console.error("❌ ERROR: Deployer has no ETH!");
    console.error("   Get testnet ETH from: https://faucet.quicknode.com/arbitrum/sepolia");
    process.exit(1);
  }

  // ========================================================================
  // STEP 1: Deploy VestingController
  // ========================================================================
  
  console.log("\n📝 Deploying VestingController...");
  
  const VestingController = await ethers.getContractFactory("VestingController");
  const vestingController = await VestingController.deploy();
  
  console.log("⏳ Waiting for deployment...");
  await vestingController.waitForDeployment();
  
  const contractAddress = await vestingController.getAddress();
  
  console.log("✅ VestingController deployed!");
  console.log("   Address:", contractAddress);
  console.log("   Owner:", await vestingController.owner());
  console.log("   Network: Arbitrum Sepolia");

  // ========================================================================
  // DEPLOYMENT SUMMARY
  // ========================================================================
  
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 Deployed Contract:");
  console.log("   • VestingController:", contractAddress);
  console.log("   • Chain ID: 421614 (Arbitrum Sepolia)");
  
  console.log("\n⚙️  Next Steps:");
  console.log("   1. Save this address to your frontend config");
  console.log("   2. Verify contract on Arbiscan (optional):");
  console.log(`      npx hardhat verify --network arbitrumSepolia ${contractAddress}`);
  console.log("   3. Make sure VestingWallet on Ethereum is deployed");
  console.log("   4. Update frontend with both contract addresses");
  console.log("   5. Test creating a vesting via frontend");
  
  console.log("\n💡 Configuration Notes:");
  console.log("   • FASE 1: localStorage communication");
  console.log("   • FASE 2: Will add CCIP integration");
  console.log("   • FASE 3: Will add ZK proof validation");
  console.log("=".repeat(60) + "\n");
  
  // Save deployment info to file
  const fs = require("fs");
  const deploymentInfo = {
    network: "arbitrumSepolia",
    chainId: 421614,
    contract: "VestingController",
    address: contractAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    owner: await vestingController.owner(),
  };
  
  const deploymentPath = "./deployments/arbitrumSepolia";
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }
  
  fs.writeFileSync(
    `${deploymentPath}/VestingController.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log("📄 Deployment info saved to:", `${deploymentPath}/VestingController.json`);
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED");
    console.error(error);
    process.exit(1);
  });

