#!/usr/bin/env node

const snarkjs = require("snarkjs");
const path = require("path");
const fs = require("fs");
const { poseidon5, poseidon1 } = require("poseidon-lite");

async function testProofGeneration() {
  console.log("🧪 TESTING PROOF GENERATION WITH PRIVATE ORACLE SECRET");
  console.log("=".repeat(70));

  // 1. Load oracle secret from .env
  console.log("\n1️⃣ Loading oracle secret from .env.local...");
  const envPath = path.join(__dirname, "app/.env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local not found!");
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(/^ORACLE_SECRET_KEY=(.*)$/m);
  if (!match) {
    console.error("❌ ORACLE_SECRET_KEY not found in .env.local!");
    process.exit(1);
  }

  const oracleSecret = BigInt(match[1]);
  console.log("✅ Oracle secret loaded:", match[1].substring(0, 15) + "...");

  // 2. Check circuit files
  console.log("\n2️⃣ Checking circuit files...");
  const wasmPath = path.join(__dirname, "app/lib/circuits/token_ownership.wasm");
  const zkeyPath = path.join(__dirname, "app/lib/circuits/circuit_final.zkey");

  if (!fs.existsSync(wasmPath)) {
    console.error("❌ WASM file not found:", wasmPath);
    process.exit(1);
  }
  if (!fs.existsSync(zkeyPath)) {
    console.error("❌ ZKEY file not found:", zkeyPath);
    process.exit(1);
  }
  console.log("✅ Circuit files found");

  // 3. Prepare test inputs
  console.log("\n3️⃣ Preparing test inputs...");
  
  // Simulated values
  const actualBalance = 150000; // 0.15 ETH scaled to 6 decimals
  const minRequiredBalance = 100000; // 0.1 ETH scaled to 6 decimals
  const userAddress = "0x1234567890123456789012345678901234567890";
  const tokenContract = "0x0000000000000000000000000000000000000000";
  const timestamp = Math.floor(Date.now() / 1000);
  const salt = 123456;

  // Compute hashes
  const tokenContractHash = poseidon1([BigInt(tokenContract)]);
  const userAddressHash = poseidon1([BigInt(userAddress)]);

  // Generate oracle commitment
  const oracleCommitment = poseidon5([
    oracleSecret,
    BigInt(actualBalance),
    tokenContractHash,
    userAddressHash,
    BigInt(timestamp),
  ]);

  const inputs = {
    oracle_secret: oracleSecret.toString(),
    actual_balance: actualBalance,
    salt: salt,

    // Public inputs
    min_required_balance: minRequiredBalance,
    token_contract_hash: tokenContractHash.toString(),
    user_address_hash: userAddressHash.toString(),
    timestamp: timestamp,
    oracle_commitment: oracleCommitment.toString(),
  };

  console.log("✅ Test inputs prepared:");
  console.log("   • oracle_secret: [REDACTED]");
  console.log("   • actual_balance:", actualBalance);
  console.log("   • min_required_balance:", minRequiredBalance);
  console.log("   • timestamp:", timestamp);

  // 4. Generate proof
  console.log("\n4️⃣ Generating ZK proof...");
  console.log("   ⏳ This may take 5-15 seconds...");

  try {
    const startTime = Date.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      wasmPath,
      zkeyPath
    );
    const duration = Date.now() - startTime;

    console.log(`✅ Proof generated successfully in ${duration}ms`);
    console.log("   • Public signals count:", publicSignals.length);
    console.log("   • Proof components:");
    console.log("     - pi_a: [", proof.pi_a[0].toString().substring(0, 10) + "...,", proof.pi_a[1].toString().substring(0, 10) + "... ]");
    console.log("     - pi_b: [ [...], [...] ]");
    console.log("     - pi_c: [", proof.pi_c[0].toString().substring(0, 10) + "...,", proof.pi_c[1].toString().substring(0, 10) + "... ]");

    // 5. Verify circuit structure
    console.log("\n5️⃣ Verifying circuit security...");
    const circuitPath = path.join(__dirname, "circuits/token_ownership.circom");
    const circuitContent = fs.readFileSync(circuitPath, "utf8");

    // Check that oracle_secret is NOT a template parameter
    const hasTemplateParameter = /TokenOwnership\(\d+\)/.test(circuitContent);
    const hasEmptyTemplate = /TokenOwnership\(\)/.test(circuitContent);
    const hasPrivateInput = /signal input oracle_secret/.test(circuitContent);

    if (hasTemplateParameter) {
      console.error("❌ SECURITY ISSUE: oracle_secret is still hardcoded in circuit!");
      process.exit(1);
    }

    if (!hasEmptyTemplate) {
      console.error("❌ Circuit should have empty template parameters");
      process.exit(1);
    }

    if (!hasPrivateInput) {
      console.error("❌ oracle_secret should be a private input signal");
      process.exit(1);
    }

    console.log("✅ Circuit structure is secure:");
    console.log("   • oracle_secret is a PRIVATE INPUT ✅");
    console.log("   • oracle_secret is NOT hardcoded ✅");
    console.log("   • Template has no parameters ✅");

    console.log("\n" + "=".repeat(70));
    console.log("✅ ALL TESTS PASSED!");
    console.log("🔐 Oracle secret is now properly protected");
    console.log("=".repeat(70));

  } catch (error) {
    console.error("\n❌ Proof generation failed:");
    console.error(error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run test
testProofGeneration().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});

