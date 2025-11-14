/**
 * Standalone deployment script for Arbitrum (bypasses Hardhat plugin issues)
 * Usage: node scripts/deploy-arbitrum-standalone.js
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🚀 Deploying VestingController to Arbitrum Sepolia...");
  console.log("=".repeat(60));

  // Configuration
  const RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error("❌ ERROR: PRIVATE_KEY environment variable not set");
    console.error("   Set it with: export PRIVATE_KEY=0x...");
    process.exit(1);
  }

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("📍 Deployer address:", wallet.address);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log("💰 Deployer balance:", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    console.error("❌ ERROR: Deployer has no ETH!");
    console.error("   Get testnet ETH from: https://faucet.quicknode.com/arbitrum/sepolia");
    process.exit(1);
  }

  // Read compiled contract
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/VestingController.sol/VestingController.json"
  );

  if (!fs.existsSync(artifactPath)) {
    console.error("❌ ERROR: Contract artifact not found!");
    console.error("   Run: npx hardhat compile");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  console.log("\n📝 Deploying VestingController...");

  // Deploy contract
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  const contract = await factory.deploy();
  console.log("⏳ Waiting for deployment...");
  console.log("   TX Hash:", contract.deploymentTransaction().hash);

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("✅ VestingController deployed!");
  console.log("   Address:", contractAddress);
  console.log("   Owner:", await contract.owner());
  console.log("   Network: Arbitrum Sepolia");

  // Save deployment info
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 Deployed Contract:");
  console.log("   • VestingController:", contractAddress);
  console.log("   • Chain ID: 421614 (Arbitrum Sepolia)");

  console.log("\n⚙️  Next Steps:");
  console.log("   1. Save this address to your frontend config:");
  console.log(`      NEXT_PUBLIC_VESTING_CONTROLLER=${contractAddress}`);
  console.log("   2. Verify contract on Arbiscan (optional):");
  console.log(
    `      npx hardhat verify --network arbitrumSepolia ${contractAddress}`
  );
  console.log("   3. Update frontend .env.local with all addresses");
  console.log("   4. Test creating a vesting via frontend");

  console.log("\n💡 Configuration Notes:");
  console.log("   • FASE 1: localStorage communication");
  console.log("   • FASE 2: Will add CCIP integration");
  console.log("   • FASE 3: Will add ZK proof validation");
  console.log("=".repeat(60) + "\n");

  // Save deployment info to file
  const deploymentInfo = {
    network: "arbitrumSepolia",
    chainId: 421614,
    contract: "VestingController",
    address: contractAddress,
    deployer: wallet.address,
    timestamp: new Date().toISOString(),
    owner: await contract.owner(),
  };

  const deploymentPath = "./deployments/arbitrumSepolia";
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }

  fs.writeFileSync(
    `${deploymentPath}/VestingController.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log(
    "📄 Deployment info saved to:",
    `${deploymentPath}/VestingController.json`
  );
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED");
    console.error(error);
    process.exit(1);
  });

