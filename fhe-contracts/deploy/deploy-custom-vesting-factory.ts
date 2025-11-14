import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Deploy script for CustomVestingFactory
 * 
 * Deploys the factory contract which creates confidential vesting wallets
 * with encrypted token amounts and cliff periods.
 * 
 * Demo Config: 2-minute cliff = 2-minute duration (Option 2)
 * Perfect for demos: Wait 2 min → 100% unlocks!
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("\n🚀 Deploying CustomVestingFactory...");
  console.log("📍 Deployer:", deployer);
  console.log("=".repeat(60));

  // Deploy CustomVestingFactory
  const factory = await deploy("CustomVestingFactory", {
    from: deployer,
    args: [], // No constructor arguments
    log: true,
    waitConfirmations: hre.network.name === "sepolia" ? 6 : 1,
  });
  
  console.log("\n✅ CustomVestingFactory deployed!");
  console.log("   Address:", factory.address);
  console.log("   Network:", hre.network.name);
  
  console.log("\n📋 Contract Details:");
  console.log("   - Creates confidential vesting wallets");
  console.log("   - Supports batch funding with encrypted amounts");
  console.log("   - Demo: 2-min cliff = 2-min duration");
  
  console.log("\n🎬 Demo Timeline:");
  console.log("   0:00 - Deploy & fund wallets");
  console.log("   0:00-1:59 - LOCKED (cliff period) 🔒");
  console.log("   2:00 - 100% UNLOCKS! 💥");
  console.log("   2:00+ - Claim all tokens! 💰");

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n⏳ Waiting for block confirmations before verification...");
    console.log("🔍 To verify manually:");
    console.log(`   npx hardhat verify --network ${hre.network.name} ${factory.address}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Deployment Complete!");
  console.log("=".repeat(60));
  
  console.log(`\n📝 Save this address: ${factory.address}`);
  console.log("\n🔗 Next steps:");
  console.log("   1. Deploy ERC7984 confidential token");
  console.log("   2. Create vesting schedules");
  console.log("   3. Fund wallets with encrypted amounts");
  console.log("   4. Wait 2 minutes");
  console.log("   5. Beneficiaries claim tokens!\n");
};

export default func;
func.tags = ["CustomVestingFactory", "vesting"];
