import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Deploy script for MockVestingToken
 * 
 * Deploys a simple mock token for testing vesting functionality.
 * This token has:
 * - Easy minting for testing (anyone can mint)
 * - ERC7984-compatible interface for vesting
 * - FHE encrypted balance support
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  console.log("\n🪙 Deploying MockVestingToken...");
  console.log("📍 Deployer:", deployer);
  console.log("🌐 Network:", hre.network.name);
  console.log("=".repeat(60));

  const token = await deploy("MockVestingToken", {
    from: deployer,
    args: [], // No constructor arguments
    log: true,
    waitConfirmations: hre.network.name === "sepolia" ? 6 : 1,
  });
  
  console.log("\n✅ MockVestingToken deployed!");
  console.log("   Address:", token.address);
  console.log("   Name: Mock Vesting Token");
  console.log("   Symbol: MVT");
  console.log("   Network:", hre.network.name);
  
  if (token.transactionHash) {
    console.log("   Tx Hash:", token.transactionHash);
  }
  
  console.log("\n📋 Contract Details:");
  console.log("   - ERC7984-compatible interface");
  console.log("   - Supports FHE encrypted balances");
  console.log("   - Easy minting for testing");
  console.log("   - Owner:", deployer);

  if (hre.network.name === "sepolia" || hre.network.name === "arbitrumSepolia") {
    console.log("\n⏳ Waiting for block confirmations...");
    console.log("\n🔍 To verify on Etherscan:");
    console.log(`   npx hardhat verify --network ${hre.network.name} ${token.address}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Deployment Complete!");
  console.log("=".repeat(60));
  
  console.log(`\n📝 Save this address: ${token.address}`);
  console.log("\n🔗 Next steps:");
  console.log("   1. Mint tokens: token.mint(address, amount)");
  console.log("   2. Set operator approval: token.setOperator(factoryAddress, true)");
  console.log("   3. Use with vesting factory for testing");
  console.log("   4. Check balance: token.balanceOf(address)\n");
};

export default func;
func.id = "deploy_mock_vesting_token";
func.tags = ["MockVestingToken", "MockToken", "token"];

