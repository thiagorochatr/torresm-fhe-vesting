/**
 * Get the deployer address from the configured mnemonic
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deployer address:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

