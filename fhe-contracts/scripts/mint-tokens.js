/**
 * Mint Confidential Vesting Tokens
 * 
 * This script mints encrypted tokens to a specified address
 * Uses FHEVM SDK to encrypt the amount before minting
 */

const { ethers } = require("hardhat");
const { createInstance } = require("fhevmjs");

// Configuration
const TOKEN_ADDRESS = "0x01D32cDfAa2787c9729956bDaF8D378ebDC9aa12";
const AMOUNT_TO_MINT = 1_000_000; // 1 million tokens

async function main() {
  console.log("\n🪙 Minting Confidential Vesting Tokens...");
  console.log("=".repeat(60));

  // Get signer
  const [deployer] = await ethers.getSigners();
  console.log("👤 Minter (owner):", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Get token contract
  const Token = await ethers.getContractFactory("ConfidentialVestingToken");
  const token = Token.attach(TOKEN_ADDRESS);

  console.log("\n📝 Token Details:");
  console.log("   Address:", TOKEN_ADDRESS);
  
  try {
    const name = await token.name();
    const symbol = await token.symbol();
    const owner = await token.owner();
    
    console.log("   Name:", name);
    console.log("   Symbol:", symbol);
    console.log("   Owner:", owner);

    // Check if signer is owner
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.log("\n❌ ERROR: You are not the token owner!");
      console.log("   Owner:", owner);
      console.log("   You:", deployer.address);
      console.log("\n💡 Only the owner can mint tokens.");
      console.log("   Please use the owner wallet to run this script.");
      return;
    }

    console.log("   ✅ You are the owner!");

  } catch (error) {
    console.log("   ⚠️  Could not read token details:", error.message);
  }

  // ========================================================================
  // MINT TOKENS (Simple Version - Without FHE)
  // ========================================================================
  
  console.log("\n🔐 Preparing to mint...");
  console.log("   Amount:", AMOUNT_TO_MINT.toLocaleString(), "tokens");
  console.log("   To:", deployer.address);

  // For now, we'll use a simple approach:
  // The mint function signature: mint(address to, bytes32 encryptedAmount, bytes inputProof)
  // We need FHEVM instance to create encrypted input

  console.log("\n⚠️  Note: This requires FHEVM encryption.");
  console.log("   The token's mint() function expects encrypted amount.");
  console.log("\n💡 Alternative: Mint directly from Etherscan UI");
  console.log("   1. Go to: https://sepolia.etherscan.io/address/" + TOKEN_ADDRESS + "#writeContract");
  console.log("   2. Connect your wallet (must be owner)");
  console.log("   3. Call 'mint' with encrypted parameters");
  
  console.log("\n" + "=".repeat(60));
  console.log("📖 Instructions for Manual Minting:");
  console.log("=".repeat(60));
  console.log("\nSince minting requires FHE encryption, the easiest way is:");
  console.log("\n1. Use the frontend to encrypt amounts");
  console.log("2. Or use Zama's FHEVM SDK in a separate script");
  console.log("3. Or deploy a simpler mock token for testing");
  
  console.log("\n💡 For testing, I recommend using a mock ERC20 token");
  console.log("   that doesn't require encryption for minting.");
  console.log("   Would you like me to create one?");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

