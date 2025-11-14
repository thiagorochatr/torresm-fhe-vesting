// Helper to get private key from mnemonic
const { ethers } = require("ethers");
const { vars } = require("hardhat/config");

async function main() {
  const mnemonic = vars.get("MNEMONIC", "test test test test test test test test test test test junk");
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  console.log(wallet.privateKey);
}

main().catch(console.error);

