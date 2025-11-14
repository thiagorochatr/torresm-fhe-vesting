/**
 * Mint MockVestingTokens - Simple & Easy!
 * 
 * Usage:
 *   node scripts/mint-mock-tokens.js <token-address> <amount>
 *   
 * Example:
 *   node scripts/mint-mock-tokens.js 0xYourTokenAddress 1000000
 */

const { ethers } = require("hardhat");

async function main() {
  // Get parameters
  const tokenAddress = process.argv[2];
  const amountArg = process.argv[3];
  
  if (!tokenAddress) {
    console.error("\n❌ Error: Please provide token address");
    console.log("\nUsage: node scripts/mint-mock-tokens.js <token-address> <amount>");
    console.log("Example: node scripts/mint-mock-tokens.js 0x123... 1000000");
    process.exit(1);
  }
  
  const amount = amountArg ? ethers.parseEther(amountArg) : ethers.parseEther("1000000");
  
  console.log("\n🪙 Minting MockVestingTokens...");
  console.log("=".repeat(60));
  
  const [deployer] = await ethers.getSigners();
  console.log("👤 Your address:", deployer.address);
  console.log("🎯 Token address:", tokenAddress);
  console.log("💰 Amount to mint:", ethers.formatEther(amount), "tokens");
  
  // Get token contract
  const Token = await ethers.getContractFactory("MockVestingToken");
  const token = Token.attach(tokenAddress);
  
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
    const tx = await token.mint(deployer.address, amount);
    console.log("   Transaction hash:", tx.hash);
    
    console.log("   ⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    
    console.log("\n✅ Tokens minted successfully!");
    console.log("   Block:", receipt.blockNumber);
    console.log("   Gas used:", receipt.gasUsed.toString());
    
    console.log("\n🎉 You now have " + ethers.formatEther(amount) + " tokens!");
    
    console.log("\n" + "=".repeat(60));
    console.log("📝 Next Steps:");
    console.log("=".repeat(60));
    console.log("\n1. Approve factory to spend your tokens:");
    console.log("   Go to: https://sepolia.etherscan.io/address/" + tokenAddress + "#writeContract");
    console.log("   Call: setOperator(0xaF8aB08B63359cf8Ae8CFA9E1209CD96626fd55A, true)");
    
    console.log("\n2. Go to admin panel:");
    console.log("   http://localhost:3000/admin");
    
    console.log("\n3. Create vesting schedules! 🚀");
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

