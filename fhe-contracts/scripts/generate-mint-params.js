/**
 * Generate Encrypted Mint Parameters
 * 
 * This script generates the encryptedAmount and inputProof
 * that you need to mint tokens via Etherscan UI
 * 
 * Usage:
 *   node scripts/generate-mint-params.js <amount>
 *   
 * Example:
 *   node scripts/generate-mint-params.js 1000000
 */

const { createInstance } = require("fhevmjs");
const { ethers } = require("hardhat");

// Configuration
const TOKEN_ADDRESS = "0x01D32cDfAa2787c9729956bDaF8D378ebDC9aa12";
const CHAIN_ID = 11155111; // Sepolia
const RPC_URL = "https://sepolia.infura.io/v3/" + (process.env.INFURA_API_KEY || "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");

async function main() {
  // Get amount from command line or use default
  const amountArg = process.argv[2];
  const amount = amountArg ? parseInt(amountArg) : 1_000_000;

  console.log("\n🔐 Generating Encrypted Mint Parameters");
  console.log("=".repeat(60));
  console.log("Amount to mint:", amount.toLocaleString(), "tokens");
  console.log("Token address:", TOKEN_ADDRESS);
  console.log("Chain ID:", CHAIN_ID);
  
  try {
    console.log("\n⏳ Initializing FHEVM instance...");
    
    // Create FHEVM instance
    const instance = await createInstance({
      chainId: CHAIN_ID,
      networkUrl: RPC_URL,
      gatewayUrl: "https://gateway.sepolia.zama.ai",
    });
    
    console.log("✅ FHEVM instance created");

    // Get signer address (for encryption)
    const [signer] = await ethers.getSigners();
    console.log("\n👤 Your address:", signer.address);

    console.log("\n🔐 Encrypting amount...");
    
    // Create encrypted input
    const input = instance.createEncryptedInput(TOKEN_ADDRESS, signer.address);
    
    // Add the amount as uint64
    input.add64(amount);
    
    // Encrypt and get handles + proof
    const encryptedData = await input.encrypt();
    
    console.log("✅ Encryption complete!");

    // Extract the values
    const encryptedAmount = encryptedData.handles[0]; // First handle is the encrypted amount
    const inputProof = encryptedData.inputProof; // The proof

    console.log("\n" + "=".repeat(60));
    console.log("✅ SUCCESS! Copy these values:");
    console.log("=".repeat(60));
    
    console.log("\n📋 1. encryptedAmount (bytes32):");
    console.log("   " + encryptedAmount);
    
    console.log("\n📋 2. inputProof (bytes):");
    console.log("   " + inputProof);

    console.log("\n" + "=".repeat(60));
    console.log("📝 How to mint on Etherscan:");
    console.log("=".repeat(60));
    console.log("\n1. Go to: https://sepolia.etherscan.io/address/" + TOKEN_ADDRESS + "#writeContract");
    console.log("\n2. Click 'Connect to Web3' and connect your wallet");
    console.log("   (Must be the owner address: check 'owner()' in Read Contract)");
    console.log("\n3. Find the 'mint' function (function #4)");
    console.log("\n4. Fill in:");
    console.log("   to (address):                 " + signer.address);
    console.log("   encryptedAmount (bytes32):    " + encryptedAmount);
    console.log("   inputProof (bytes):           " + inputProof);
    
    console.log("\n5. Click 'Write' and confirm the transaction");
    console.log("\n6. Wait for confirmation (~15 seconds)");
    console.log("\n7. You'll have " + amount.toLocaleString() + " tokens! 🎉");
    
    console.log("\n" + "=".repeat(60));
    console.log("💡 Tips:");
    console.log("=".repeat(60));
    console.log("- Encrypted values are specific to your address");
    console.log("- You can run this script multiple times for different amounts");
    console.log("- To mint to different address, pass it as: --to 0x...");
    console.log("\n");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nFull error:", error);
    
    console.log("\n💡 Troubleshooting:");
    console.log("- Make sure you have internet connection");
    console.log("- Check that Infura API key is set");
    console.log("- Try running: npm install fhevmjs");
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

