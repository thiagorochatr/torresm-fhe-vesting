/**
 * Get the vesting wallet implementation address from the factory
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Read factory deployment
  const deploymentPath = path.join(
    __dirname,
    "../deployments",
    hre.network.name,
    "CustomVestingFactory.json"
  );

  if (!fs.existsSync(deploymentPath)) {
    console.error("Factory not deployed on this network!");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const factoryAddress = deployment.address;

  console.log("Factory address:", factoryAddress);

  // Get implementation
  const factory = await ethers.getContractAt("CustomVestingFactory", factoryAddress);
  const implementationAddress = await factory.vestingImplementation();

  console.log("Implementation address:", implementationAddress);
  
  return implementationAddress;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

