import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import path from "path";
import fs from "fs";
import { poseidon1, poseidon5 } from "poseidon-lite";
import { config } from "../../lib/config";
import { rateLimiters } from "../../lib/rate-limit";

// API route for generating ZK proofs for token ownership
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // SECURITY: Rate limiting to prevent abuse
  // ZK proof generation is computationally expensive
  const rateLimitResult = await rateLimiters.standard.check(req, res);
  if (!rateLimitResult.success) {
    console.warn("⚠️  Rate limit exceeded");
    return res.status(429).json({
      error: "Too many requests. Please try again later.",
      retryAfter: rateLimitResult.retryAfter,
      message: `You can make up to 10 proof generation requests per 15 minutes. Please wait ${rateLimitResult.retryAfter} seconds before trying again.`,
    });
  }

  try {
    const { userAddress, salt } = req.body;
    
    console.log("\n" + "=".repeat(80));
    console.log("🚀 STARTING ZK PROOF GENERATION");
    console.log("=".repeat(80));
    console.log("📝 Request Data:");
    console.log("  • User Address:", userAddress);
    console.log("  • Salt:", salt);

    // Validate inputs
    if (!ethers.isAddress(userAddress)) {
      console.log("❌ Invalid address format");
      return res.status(400).json({ error: "Invalid address format" });
    }
    console.log("✅ Address validation passed");

    // RPC provider for Arbitrum Sepolia (moved up to fetch contract data)
    const provider = new ethers.JsonRpcProvider(
      process.env.RPC_URL || config.network.rpcUrl
    );

    console.log("\n🌐 Connecting to RPC...");
    console.log("  • RPC URL:", process.env.RPC_URL || config.network.rpcUrl);

    // Fetch min_required_balance from contract (instead of hardcoding)
    console.log("\n📋 Fetching Contract Configuration...");
    const zkMintContractAddress = config.contracts.zkMint;
    console.log("  • Contract Address:", zkMintContractAddress);
    
    // Contract ABI for reading min_required_balance
    const contractABI = [
      "function getMinRequiredBalance() view returns (uint256)",
    ];
    
    const zkMintContract = new ethers.Contract(
      zkMintContractAddress,
      contractABI,
      provider
    );

    let minRequiredBalanceScaled: bigint;
    try {
      minRequiredBalanceScaled = await zkMintContract.getMinRequiredBalance();
      console.log("  • Min Required Balance (scaled):", minRequiredBalanceScaled.toString());
    } catch (error) {
      console.log("❌ Failed to fetch min_required_balance from contract:", error);
      return res.status(500).json({
        error: "Failed to fetch contract configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // Convert from scaled value (10^6) to ETH
    const minRequiredBalance = Number(minRequiredBalanceScaled) / 1e6;
    const tokenContract = ethers.ZeroAddress; // Use zero address for ETH
    
    console.log("\n📊 Configuration:");
    console.log("  • Min Required Balance:", minRequiredBalance, "ETH", `(${minRequiredBalanceScaled} scaled)`);
    console.log("  • Token Contract:", tokenContract, "(ETH)");

    // Validate oracle secret key
    console.log("\n🔐 Validating Oracle Configuration...");
    const oracleSecretStr = process.env.ORACLE_SECRET_KEY;
    if (!oracleSecretStr) {
      console.log("❌ Oracle secret key not configured");
      return res
        .status(500)
        .json({ error: "Oracle secret key not configured" });
    }
    const oracleSecret = BigInt(oracleSecretStr);
    console.log("✅ Oracle secret loaded:", oracleSecretStr.substring(0, 10) + "...");

    // Circuit file paths (copied by setup script)
    console.log("\n📁 Checking Circuit Files...");
    const wasmPath = path.join(
      process.cwd(),
      "lib/circuits/token_ownership.wasm"
    );
    const zkeyPath = path.join(
      process.cwd(),
      "lib/circuits/circuit_final.zkey"
    );
    
    console.log("  • WASM Path:", wasmPath);
    console.log("  • ZKEY Path:", zkeyPath);

    // Check if circuit files exist
    if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
      console.log("❌ Circuit files missing:");
      console.log("  • WASM:", !fs.existsSync(wasmPath) ? "MISSING" : "OK");
      console.log("  • ZKEY:", !fs.existsSync(zkeyPath) ? "MISSING" : "OK");
      return res.status(500).json({
        error: "Circuit files not found. Please run circuit setup first.",
        missing: {
          wasm: !fs.existsSync(wasmPath),
          zkey: !fs.existsSync(zkeyPath),
        },
      });
    }
    console.log("✅ All circuit files found");

    // ERC20 ABI for balance checking
    const ERC20_ABI = [
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)",
      "function name() view returns (string)",
    ];

    // 1. Check actual ETH balance on-chain
    console.log("\n💰 Step 1: Checking On-Chain Balance...");
    const actualBalance = await provider.getBalance(userAddress);

    // Convert balance to readable format (ETH has 18 decimals)
    const balanceFormatted = Number(ethers.formatEther(actualBalance));
    const symbol = "ETH";

    console.log(`✅ Balance Retrieved:`);
    console.log(`  • User: ${userAddress}`);
    console.log(`  • Balance: ${balanceFormatted} ${symbol}`);
    console.log(`  • Raw Balance: ${actualBalance.toString()} wei`);

    // 2. Check if user has enough ETH
    console.log("\n🔍 Step 2: Validating Balance Requirement...");
    console.log(`  • Required: ${minRequiredBalance} ${symbol}`);
    console.log(`  • Actual: ${balanceFormatted} ${symbol}`);
    console.log(`  • Meets Requirement: ${balanceFormatted >= minRequiredBalance ? "YES ✅" : "NO ❌"}`);
    
    if (balanceFormatted < minRequiredBalance) {
      console.log("❌ Insufficient balance - proof generation aborted");
      return res.status(400).json({
        error: "Insufficient ETH balance",
        required: minRequiredBalance,
        actual: balanceFormatted,
        token: symbol,
      });
    }
    console.log("✅ Balance requirement satisfied");

    // 3. Generate oracle commitment for balance data
    console.log("\n🔐 Step 3: Generating Oracle Commitment...");
    const timestamp = Math.floor(Date.now() / 1000);
    const actualBalanceScaled = Math.floor(balanceFormatted * 10 ** 6); // Scale to avoid decimals
    const tokenContractHash =
      BigInt(ethers.keccak256(ethers.toUtf8Bytes(tokenContract))) % 2n ** 254n;
    const userAddressHash =
      BigInt(ethers.keccak256(ethers.toUtf8Bytes(userAddress))) % 2n ** 254n;

    console.log("  • Timestamp:", timestamp, `(${new Date(timestamp * 1000).toISOString()})`);
    console.log("  • Balance Scaled:", actualBalanceScaled, "(10^6 scaling)");
    console.log("  • Token Hash:", tokenContractHash.toString().substring(0, 20) + "...");
    console.log("  • User Hash:", userAddressHash.toString().substring(0, 20) + "...");
    console.log("  ⏰ Proof Validity: This proof will be valid for 300 seconds (5 minutes)");

    // Generate oracle commitment: poseidon(oracle_secret, actual_balance, token_contract_hash, user_address_hash, timestamp)
    const poseidonInputs = [
      oracleSecret,
      BigInt(actualBalanceScaled),
      tokenContractHash,
      userAddressHash,
      BigInt(timestamp),
    ];

    console.log("  • Computing Poseidon hash with 5 inputs...");
    const oracleCommitment = poseidon5(poseidonInputs);
    console.log("✅ Oracle Commitment:", oracleCommitment.toString().substring(0, 30) + "...");

    // 4. Prepare circuit inputs (must match circuit template exactly)
    console.log("\n🔧 Step 4: Preparing Circuit Inputs...");
    const saltValue = salt || Math.floor(Math.random() * 1000000);
    const inputs = {
      // Private inputs (SECURITY FIX: oracle_secret is now a private input!)
      oracle_secret: oracleSecret.toString(),
      actual_balance: actualBalanceScaled,
      salt: saltValue,

      // Public inputs
      min_required_balance: Math.floor(minRequiredBalance * 10 ** 6),
      token_contract_hash: tokenContractHash.toString(),
      user_address_hash: userAddressHash.toString(),
      timestamp: timestamp,
      oracle_commitment: oracleCommitment.toString(),
    };
    
    console.log("📋 Circuit Inputs:");
    console.log("  Private Inputs:");
    console.log("    • oracle_secret: [REDACTED FOR SECURITY]");
    console.log("    • actual_balance:", actualBalanceScaled);
    console.log("    • salt:", saltValue);
    console.log("  Public Inputs:");
    console.log("    • min_required_balance:", inputs.min_required_balance);
    console.log("    • token_contract_hash:", inputs.token_contract_hash.substring(0, 20) + "...");
    console.log("    • user_address_hash:", inputs.user_address_hash.substring(0, 20) + "...");
    console.log("    • timestamp:", timestamp);
    console.log("    • oracle_commitment:", inputs.oracle_commitment.substring(0, 30) + "...");

    // 5. Generate ZK proof
    console.log("\n⚡ Step 5: Generating ZK Proof (Groth16)...");
    console.log("  This may take a few seconds...");

    let proof: any, publicSignals: any;
    try {
      const startTime = Date.now();
      const result = await snarkjs.groth16.fullProve(
        inputs,
        wasmPath,
        zkeyPath
      );
      const duration = Date.now() - startTime;
      proof = result.proof;
      publicSignals = result.publicSignals;
      
      console.log(`✅ Proof generated successfully in ${duration}ms`);
      console.log("📊 Proof Components:");
      console.log("  • pi_a:", `[${proof.pi_a[0].toString().substring(0, 15)}..., ${proof.pi_a[1].toString().substring(0, 15)}...]`);
      console.log("  • pi_b:", "[[...], [...]]");
      console.log("  • pi_c:", `[${proof.pi_c[0].toString().substring(0, 15)}..., ${proof.pi_c[1].toString().substring(0, 15)}...]`);
      console.log("  • Public Signals Count:", publicSignals.length);
    } catch (proofError) {
      console.error("❌ Proof generation failed:", proofError);
      throw proofError;
    }

    // 6. Format proof for Stylus contract (256 bytes total)
    console.log("\n📦 Step 6: Formatting Proof for EVM...");
    console.log("  • Converting Groth16 proof to EIP-197 format");
    console.log("  • Target size: 256 bytes (64 + 128 + 64)");
    
    // Important: snarkjs uses a different G2 point format than EVM precompiles
    // snarkjs: [[x0, x1], [y0, y1]] but EVM expects [x0, x1, y0, y1]

    const proofBytes = Buffer.concat([
      // G1 point A (64 bytes: 32 + 32)
      Buffer.from(
        ethers.zeroPadValue(ethers.toBeHex(proof.pi_a[0]), 32).slice(2),
        "hex"
      ),
      Buffer.from(
        ethers.zeroPadValue(ethers.toBeHex(proof.pi_a[1]), 32).slice(2),
        "hex"
      ),

      // G2 point B (128 bytes) - EIP-197 expects [x1, x0, y1, y0] format (imaginary, real)
      // snarkjs: [[x_real, x_imag], [y_real, y_imag]] -> EIP-197: [x_imag, x_real, y_imag, y_real]
      Buffer.from(
        ethers.zeroPadValue(ethers.toBeHex(proof.pi_b[0][1]), 32).slice(2),
        "hex"
      ), // x_imag
      Buffer.from(
        ethers.zeroPadValue(ethers.toBeHex(proof.pi_b[0][0]), 32).slice(2),
        "hex"
      ), // x_real
      Buffer.from(
        ethers.zeroPadValue(ethers.toBeHex(proof.pi_b[1][1]), 32).slice(2),
        "hex"
      ), // y_imag
      Buffer.from(
        ethers.zeroPadValue(ethers.toBeHex(proof.pi_b[1][0]), 32).slice(2),
        "hex"
      ), // y_real

      // G1 point C (64 bytes: 32 + 32)
      Buffer.from(
        ethers.zeroPadValue(ethers.toBeHex(proof.pi_c[0]), 32).slice(2),
        "hex"
      ),
      Buffer.from(
        ethers.zeroPadValue(ethers.toBeHex(proof.pi_c[1]), 32).slice(2),
        "hex"
      ),
    ]);
    
    console.log("✅ Proof formatted:");
    console.log("  • Total Size:", proofBytes.length, "bytes");
    console.log("  • Proof Hex:", "0x" + proofBytes.toString("hex").substring(0, 40) + "...");

    console.log("\n🎉 SUCCESS - Sending Response");
    console.log("=".repeat(80) + "\n");

    res.json({
      success: true,
      proof: "0x" + proofBytes.toString("hex"),
      publicSignals: publicSignals.map((signal: string) => signal.toString()),
      metadata: {
        userBalance: balanceFormatted,
        requiredBalance: minRequiredBalance,
        tokenContract,
        tokenSymbol: symbol,
        userAddress,
        oracleCommitment: oracleCommitment.toString(),
        timestamp,
        network: "arbitrum-sepolia",
      },
    });
  } catch (error) {
    console.error("Proof generation error:", error);
    res.status(500).json({
      error: "Failed to generate proof",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
