/**
 * Deploy MockVestingToken - Easy Testing Token
 * 
 * This deploys a token that works with the vesting system
 * but allows easy minting without FHE encryption complexity
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("\n🪙 Deploying MockVestingToken...");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  console.log("\n📝 Deploying contract...");
  
  const MockToken = await ethers.getContractFactory("MockVestingToken");
  const token = await MockToken.deploy();
  
  await token.waitForDeployment();
  
  const tokenAddress = await token.getAddress();
  
  console.log("\n✅ MockVestingToken deployed!");
  console.log("   Address:", tokenAddress);
  console.log("   Name:", await token.name());
  console.log("   Symbol:", await token.symbol());
  console.log("   Owner:", await token.owner());

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Deployment Complete!");
  console.log("=".repeat(60));
  
  console.log("\n📋 Contract Address:");
  console.log("   " + tokenAddress);
  
  console.log("\n🔗 View on Etherscan:");
  console.log("   https://sepolia.etherscan.io/address/" + tokenAddress);
  
  console.log("\n⏳ Waiting for confirmations before verification...");
  console.log("   (Etherscan needs a few blocks to index the contract)");
  
  // Wait for 3 confirmations
  await token.deploymentTransaction().wait(3);
  
  console.log("\n🔍 Verifying on Etherscan...");
  
  try {
    await hre.run("verify:verify", {
      address: tokenAddress,
      constructorArguments: [],
    });
    console.log("✅ Contract verified!");
  } catch (error) {
    console.log("⚠️  Verification failed:", error.message);
    console.log("   You can verify manually later:");
    console.log("   npx hardhat verify --network sepolia " + tokenAddress);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("📝 Next Steps:");
  console.log("=".repeat(60));
  console.log("\n1. Mint tokens to yourself:");
  console.log("   node scripts/mint-mock-tokens.js " + tokenAddress + " 1000000");
  
  console.log("\n2. Update frontend config:");
  console.log("   packages/nextjs/contracts/vestingContracts.ts");
  console.log("   Change tokenAddress to: " + tokenAddress);
  
  console.log("\n3. Approve factory to spend tokens:");
  console.log("   Call: setOperator(0xaF8aB08B63359cf8Ae8CFA9E1209CD96626fd55A, true)");
  console.log("   On Etherscan: https://sepolia.etherscan.io/address/" + tokenAddress + "#writeContract");
  
  console.log("\n4. Test the vesting workflow! 🎉");
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

