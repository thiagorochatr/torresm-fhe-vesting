import { expect } from "chai";
import { ethers } from "hardhat";
import type { FHECounter } from "../types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("FHECounter", function () {
  let fheCounter: FHECounter;
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  beforeEach(async function () {
    [deployer, alice] = await ethers.getSigners();

    const FHECounterFactory = await ethers.getContractFactory("FHECounter");
    fheCounter = await FHECounterFactory.deploy();
    await fheCounter.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const address = await fheCounter.getAddress();
      expect(address).to.be.properAddress;
    });

    it("Should have initial count", async function () {
      const count = await fheCounter.getCount();
      expect(count).to.not.be.undefined;
    });
  });

  describe("Operations", function () {
    it("Should have increment function", async function () {
      expect(fheCounter.increment).to.be.a("function");
    });

    it("Should have decrement function", async function () {
      expect(fheCounter.decrement).to.be.a("function");
    });

    it("Should have getCount function", async function () {
      expect(fheCounter.getCount).to.be.a("function");
    });
  });
});


