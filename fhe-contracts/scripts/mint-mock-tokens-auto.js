/**
 * Mint MockVestingTokens - Auto version
 * Automatically mints to deployer
 */

const { ethers } = require("hardhat");

// Configuration
const TOKEN_ADDRESS = "0xed92813d02025c086A0e50396C9C0b1aBF0DAe73";
const AMOUNT = ethers.parseEther("1000000"); // 1 million tokens

async function main() {
  console.log("\n🪙 Minting MockVestingTokens...");
  console.log("=".repeat(60));
  
  const [deployer] = await ethers.getSigners();
  console.log("👤 Your address:", deployer.address);
  console.log("🎯 Token address:", TOKEN_ADDRESS);
  console.log("💰 Amount to mint:", ethers.formatEther(AMOUNT), "tokens");
  
  // Get token contract
  const Token = await ethers.getContractFactory("MockVestingToken");
  const token = Token.attach(TOKEN_ADDRESS);
  
  console.log("\n📝 Token details:");
  try {
    const name = await token.name();
    const symbol = await token.symbol();
    console.log("   Name:", name);
    console.log("   Symbol:", symbol);
  } catch (error) {
    console.log("   ⚠️  Could not read token details");
  }
  
  console.log("\n🔄 Minting tokens...");
  
  try {
    const tx = await token.mint(deployer.address, AMOUNT);
    console.log("   Transaction hash:", tx.hash);
    
    console.log("   ⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    
    console.log("\n✅ Tokens minted successfully!");
    console.log("   Block:", receipt.blockNumber);
    console.log("   Gas used:", receipt.gasUsed.toString());
    
    console.log("\n🎉 You now have " + ethers.formatEther(AMOUNT) + " tokens!");
    
    console.log("\n" + "=".repeat(60));
    console.log("📝 Next Steps:");
    console.log("=".repeat(60));
    console.log("\n1. Approve factory to spend your tokens:");
    console.log("   Go to: https://sepolia.etherscan.io/address/" + TOKEN_ADDRESS + "#writeContract");
    console.log("   Call: setOperator(0xaF8aB08B63359cf8Ae8CFA9E1209CD96626fd55A, true)");
    
    console.log("\n2. Frontend config has been updated automatically");
    
    console.log("\n3. Go to admin panel:");
    console.log("   http://localhost:3000/admin");
    
    console.log("\n4. Create vesting schedules! 🚀");
    console.log("\n");
    
  } catch (error) {
    console.error("\n❌ Error minting tokens:", error.message);
    console.log("\nFull error:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

