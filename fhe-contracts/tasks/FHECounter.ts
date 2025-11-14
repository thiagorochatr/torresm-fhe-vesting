import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:deployFHECounter")
  .setDescription("Deploy FHECounter contract")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    console.log("Deploying FHECounter with account:", deployer.address);

    const FHECounterFactory = await ethers.getContractFactory("FHECounter");
    const fheCounter = await FHECounterFactory.connect(deployer).deploy();
    await fheCounter.waitForDeployment();

    const address = await fheCounter.getAddress();
    console.log(`FHECounter deployed to: ${address}`);
    
    return address;
  });

task("task:getCount")
  .setDescription("Get the current encrypted count")
  .addParam("contract", "The FHECounter contract address")
  .setAction(async function (taskArguments: TaskArguments, { ethers }) {
    const { contract } = taskArguments;

    const FHECounterFactory = await ethers.getContractFactory("FHECounter");
    const fheCounter = FHECounterFactory.attach(contract) as any;

    const count = await fheCounter.getCount();
    console.log(`Current encrypted count: ${count}`);
    
    return count;
  });

export {};


