import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Deploy script for Vesting System on Ethereum Sepolia
 * 
 * Deploys:
 * 1. ConfidentialVestingToken (ERC7984 token with encrypted balances)
 * 2. VestingWallet (FHE-based vesting calculations)
 * 
 * FASE 1: Manual deployment and configuration
 * FASE 2: Will add CCIP receiver integration
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("\n🚀 Deploying Vesting System to Ethereum Sepolia...");
  console.log("📍 Deployer:", deployer);
  console.log("=".repeat(60));

  // ========================================================================
  // STEP 1: Deploy ConfidentialVestingToken
  // ========================================================================
  
  console.log("\n📝 Step 1: Deploying ConfidentialVestingToken...");
  
  const tokenName = "Confidential Vesting Token";
  const tokenSymbol = "CVT";
  
  const deployedToken = await deploy("ConfidentialVestingToken", {
    from: deployer,
    args: [tokenName, tokenSymbol],
    log: true,
    waitConfirmations: 1,
  });

  console.log("✅ ConfidentialVestingToken deployed!");
  console.log("   Address:", deployedToken.address);
  console.log("   Name:", tokenName);
  console.log("   Symbol:", tokenSymbol);

  // ========================================================================
  // STEP 2: Deploy VestingWallet
  // ========================================================================
  
  console.log("\n📝 Step 2: Deploying VestingWallet...");
  
  const deployedVestingWallet = await deploy("VestingWallet", {
    from: deployer,
    args: [deployedToken.address], // Pass token address as constructor arg
    log: true,
    waitConfirmations: 1,
  });

  console.log("✅ VestingWallet deployed!");
  console.log("   Address:", deployedVestingWallet.address);
  console.log("   Token:", deployedToken.address);

  // ========================================================================
  // DEPLOYMENT SUMMARY
  // ========================================================================
  
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT COMPLETE!");
  console.log("=".repeat(60));
  console.log("\n📋 Deployed Contracts:");
  console.log("   • ConfidentialVestingToken:", deployedToken.address);
  console.log("   • VestingWallet:", deployedVestingWallet.address);
  
  console.log("\n⚙️  Next Steps (FASE 1):");
  console.log("   1. Save these addresses to your config");
  console.log("   2. Deploy VestingController on Arbitrum Sepolia");
  console.log("   3. Update VestingWallet controller address if needed");
  console.log("   4. Mint tokens to VestingWallet for distribution");
  console.log("   5. Test the full flow via frontend");
  
  console.log("\n💡 Important Notes:");
  console.log("   • VestingWallet controller is set to deployer");
  console.log("   • Token owner is deployer (can mint tokens)");
  console.log("   • In FASE 2, add CCIP receiver integration");
  console.log("=".repeat(60) + "\n");
};

export default func;
func.id = "deploy_vesting_system"; // Prevent reexecution
func.tags = ["VestingSystem", "Vesting"];

