/**
 * Generate Encrypted Mint Parameters (Standalone)
 * 
 * This script generates the encryptedAmount and inputProof
 * that you need to mint tokens via Etherscan UI
 * 
 * Usage:
 *   node scripts/generate-mint-params-simple.js <your-address> <amount>
 *   
 * Example:
 *   node scripts/generate-mint-params-simple.js 0xYourAddress 1000000
 */

const { createInstance } = require("fhevmjs");

// Configuration
const TOKEN_ADDRESS = "0x01D32cDfAa2787c9729956bDaF8D378ebDC9aa12";
const CHAIN_ID = 11155111; // Sepolia
const RPC_URL = "https://sepolia.infura.io/v3/4e0e32d6c4aa407daea1c35d68f8f9ad"; // Public Infura

async function main() {
  // Get parameters from command line
  const yourAddress = process.argv[2];
  const amountArg = process.argv[3];

  if (!yourAddress) {
    console.error("\n❌ Error: Please provide your wallet address");
    console.log("\nUsage: node scripts/generate-mint-params-simple.js <your-address> <amount>");
    console.log("Example: node scripts/generate-mint-params-simple.js 0xYourAddress 1000000");
    process.exit(1);
  }

  const amount = amountArg ? parseInt(amountArg) : 1_000_000;

  console.log("\n🔐 Generating Encrypted Mint Parameters");
  console.log("=".repeat(60));
  console.log("Your address:", yourAddress);
  console.log("Amount to mint:", amount.toLocaleString(), "tokens");
  console.log("Token address:", TOKEN_ADDRESS);
  console.log("Chain ID:", CHAIN_ID);
  
  try {
    console.log("\n⏳ Initializing FHEVM instance...");
    console.log("This may take 10-20 seconds...");
    
    // Create FHEVM instance
    const instance = await createInstance({
      chainId: CHAIN_ID,
      networkUrl: RPC_URL,
      gatewayUrl: "https://gateway.sepolia.zama.ai",
    });
    
    console.log("✅ FHEVM instance created");

    console.log("\n🔐 Encrypting amount...");
    
    // Create encrypted input
    const input = instance.createEncryptedInput(TOKEN_ADDRESS, yourAddress);
    
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
    
    console.log("\n📋 1. to (address):");
    console.log("   " + yourAddress);
    
    console.log("\n📋 2. encryptedAmount (bytes32):");
    console.log("   " + encryptedAmount);
    
    console.log("\n📋 3. inputProof (bytes):");
    console.log("   " + inputProof);

    console.log("\n" + "=".repeat(60));
    console.log("📝 How to mint on Etherscan:");
    console.log("=".repeat(60));
    console.log("\n1. Go to: https://sepolia.etherscan.io/address/" + TOKEN_ADDRESS + "#writeContract");
    console.log("\n2. Click 'Connect to Web3' and connect your wallet");
    console.log("   ⚠️  Must be the owner! Check owner() in 'Read Contract' tab");
    console.log("\n3. Scroll to '4. mint' function");
    console.log("\n4. Paste the values above:");
    console.log("   • to (address):              Your wallet address");
    console.log("   • encryptedAmount (bytes32): The encrypted value");
    console.log("   • inputProof (bytes):        The proof");
    
    console.log("\n5. Click 'Write' → Confirm in MetaMask");
    console.log("\n6. Wait ~30 seconds for confirmation");
    console.log("\n7. You'll have " + amount.toLocaleString() + " tokens! 🎉");
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ Done! Copy the values above and paste in Etherscan.");
    console.log("=".repeat(60) + "\n");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    
    console.log("\n💡 Troubleshooting:");
    console.log("- Make sure you have internet connection");
    console.log("- Check that the address is valid (starts with 0x)");
    console.log("- Try a smaller amount if encryption fails");
    console.log("- Make sure fhevmjs is installed: pnpm add fhevmjs");
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

