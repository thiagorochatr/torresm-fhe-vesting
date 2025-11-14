/**
 * Deploy SimpleMockToken - Even Easier!
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("\n🪙 Deploying SimpleMockToken...");
  console.log("=".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  console.log("\n📝 Deploying contract...");
  
  const Token = await ethers.getContractFactory("SimpleMockToken");
  const token = await Token.deploy();
  
  await token.waitForDeployment();
  
  const tokenAddress = await token.getAddress();
  
  console.log("\n✅ SimpleMockToken deployed!");
  console.log("   Address:", tokenAddress);
  console.log("   Name:", await token.name());
  console.log("   Symbol:", await token.symbol());

  // Auto-mint tokens
  console.log("\n💰 Auto-minting 10 million tokens...");
  const mintAmount = ethers.parseEther("10000000"); // 10 million
  const mintTx = await token.mint(deployer.address, mintAmount);
  await mintTx.wait();
  console.log("✅ Minted:", ethers.formatEther(mintAmount), "tokens");
  
  // Auto-approve factory
  console.log("\n✅ Auto-approving factory...");
  const factoryAddress = "0x52be5B1113098A3D198b5AAaC0caad0aB1D87703"; // Fixed factory with FHE coprocessor
  const approveTx = await token.setOperator(factoryAddress, true);
  await approveTx.wait();
  console.log("✅ Factory approved!");

  console.log("\n" + "=".repeat(60));
  console.log("🎉 ALL DONE! Ready to test!");
  console.log("=".repeat(60));
  
  console.log("\n📋 Token Address:");
  console.log("   " + tokenAddress);
  
  console.log("\n🔗 View on Etherscan:");
  console.log("   https://sepolia.etherscan.io/address/" + tokenAddress);
  
  console.log("\n⏳ Waiting for confirmations...");
  await token.deploymentTransaction().wait(3);
  
  console.log("\n🔍 Verifying on Etherscan...");
  
  try {
    await hre.run("verify:verify", {
      address: tokenAddress,
      constructorArguments: [],
    });
    console.log("✅ Verified!");
  } catch (error) {
    console.log("⚠️  Verification:", error.message);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ EVERYTHING READY!");
  console.log("=".repeat(60));
  console.log("\nUpdate frontend to use:", tokenAddress);
  console.log("Then start testing! 🚀\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

