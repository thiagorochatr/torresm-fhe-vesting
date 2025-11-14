import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSwitchChain } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import styles from "../styles/Home.module.css";
import { NextPage } from "next";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { config } from "../lib/config";

const Home: NextPage = () => {
  const { address, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  
  // Check if user is on correct network (Arbitrum Sepolia)
  const isCorrectNetwork = chain?.id === arbitrumSepolia.id;
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [proofResult, setProofResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [minRequiredBalance, setMinRequiredBalance] = useState<string>("...");
  const [mintSuccess, setMintSuccess] = useState(false);

  // Setup ethers provider
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const ethersProvider = new ethers.BrowserProvider(
        (window as any).ethereum
      );
      setProvider(ethersProvider);

      if (address) {
        ethersProvider.getSigner().then(setSigner);
      }
    }
  }, [address]);

  // Fetch min required balance from contract
  useEffect(() => {
    const fetchMinRequiredBalance = async () => {
      try {
        const rpcProvider = new ethers.JsonRpcProvider(config.network.rpcUrl);
        const contractABI = ["function getMinRequiredBalance() view returns (uint256)"];
        const contract = new ethers.Contract(
          config.contracts.zkMint,
          contractABI,
          rpcProvider
        );

        const minBalanceScaled = await contract.getMinRequiredBalance();
        const minBalanceEth = Number(minBalanceScaled) / 1e6;
        setMinRequiredBalance(minBalanceEth.toString());
      } catch (error) {
        console.error("Failed to fetch min required balance:", error);
        setMinRequiredBalance("0.1"); // Fallback value
      }
    };

    fetchMinRequiredBalance();
  }, []);

  const generateProof = async () => {
    if (!address) {
      setError("Please connect wallet");
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎯 CLIENT: Starting Proof Generation");
    console.log("=".repeat(60));
    console.log("📍 User Address:", address);

    setIsGeneratingProof(true);
    setError("");
    setProofResult(null);

    try {
      const salt = Math.floor(Math.random() * 1000000);
      console.log("🎲 Generated Salt:", salt);
      console.log("📡 Sending request to /api/generate-proof...");
      
      const response = await fetch("/api/generate-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          salt: salt,
        }),
      });

      console.log("📥 Response received, status:", response.status);
      const data = await response.json();

      if (!response.ok) {
        console.log("❌ Request failed:", data.error);
        
        // Handle rate limiting with user-friendly message
        if (response.status === 429) {
          const retryAfter = data.retryAfter || 60;
          const minutes = Math.ceil(retryAfter / 60);
          throw new Error(
            data.message || 
            `Too many requests. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.`
          );
        }
        
        throw new Error(data.error || "Failed to generate proof");
      }

      console.log("✅ Proof generated successfully!");
      console.log("📊 Proof Data:");
      console.log("  • Proof Length:", data.proof?.length, "characters");
      console.log("  • Public Signals:", data.publicSignals?.length, "signals");
      console.log("  • User Balance:", data.metadata?.userBalance, "ETH");
      console.log("  • Required Balance:", data.metadata?.requiredBalance, "ETH");
      console.log("=".repeat(60) + "\n");

      setProofResult(data);
    } catch (err: any) {
      console.log("❌ Error generating proof:", err.message);
      setError(err.message);
    } finally {
      setIsGeneratingProof(false);
    }
  };

  const mintNFT = async () => {
    if (!proofResult || !address || !signer) {
      setError("Please connect wallet and generate proof first");
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎯 CLIENT: Starting NFT Minting");
    console.log("=".repeat(60));

    try {
      setError("");

      // Correct contract ABI for Stylus ZK Mint contract
      // Note: Stylus contracts use camelCase for external calls
      const contractABI = [
        "function mintWithZkProof(address to, uint8[] memory proof_data, uint256[] memory public_inputs) external returns (uint256)",
        "function verifyProof(uint8[] memory proof_data, uint256[] memory public_inputs) external view returns (bool)",
        "function balanceOf(address owner) external view returns (uint256)",
        "function ownerOf(uint256 token_id) external view returns (address)",
        "function getNextTokenId() external view returns (uint256)",
        "function getMaxProofAge() external view returns (uint256)",
      ];

      console.log("📝 Step 1: Creating Contract Instance...");
      console.log("  • Contract Address:", config.contracts.zkMint);
      console.log("  • User Address:", address);
      
      // Create contract instance
      const contract = new ethers.Contract(
        config.contracts.zkMint,
        contractABI,
        signer
      );
      console.log("✅ Contract instance created");

      console.log("\n🔄 Step 2: Converting Proof Data...");
      // Convert hex proof to uint8 array
      const proofHex = proofResult.proof.startsWith("0x")
        ? proofResult.proof.slice(2)
        : proofResult.proof;
      const proofBytes = Array.from(ethers.getBytes("0x" + proofHex));
      console.log("  • Proof Length:", proofBytes.length, "bytes");
      console.log("  • First 10 bytes:", proofBytes.slice(0, 10).join(", "));

      // Public signals as BigNumbers
      const publicInputs = proofResult.publicSignals.map((signal: string) =>
        BigInt(signal)
      );
      console.log("  • Public Inputs:", publicInputs.length, "values");
      console.log("✅ Proof data converted");

      console.log("\n🔍 Step 3: Checking Contract State...");
      console.log("  • Contract Address:", config.contracts.zkMint);
      
      // Get chain ID
      const chainIdHex = (window as any).ethereum?.chainId;
      const chainId = chainIdHex ? parseInt(chainIdHex, 16) : "Unknown";
      console.log("  • Network Chain ID:", chainId);
      console.log("  • Expected Chain ID: 421614 (Arbitrum Sepolia)");
      
      if (chainId !== 421614 && chainId !== "Unknown") {
        console.error("⚠️  WARNING: You may be on the wrong network!");
        console.error(`   Current: ${chainId}, Expected: 421614`);
      }
      
      // Check if contract exists
      try {
        const code = await provider?.getCode(config.contracts.zkMint);
        if (code === "0x" || !code) {
          throw new Error("No contract code found at this address");
        }
        console.log("  • Contract Code:", code.substring(0, 20) + "... (" + code.length + " bytes)");
        console.log("✅ Contract exists at address");
      } catch (_codeError: any) {
        console.error("❌ Contract does not exist at this address");
        throw new Error(
          `No contract found at ${config.contracts.zkMint}. Please verify the address and network.`
        );
      }
      
      try {
        // Check next token ID to verify contract is accessible
        console.log("  • Calling getNextTokenId()...");
        const nextTokenId = await contract.getNextTokenId();
        console.log("  • Next Token ID:", nextTokenId.toString());
        
        // Get max proof age
        const maxProofAge = await contract.getMaxProofAge();
        console.log("  • Max Proof Age:", maxProofAge.toString(), "seconds");
        console.log("    (Proofs older than this will be rejected)");
        
        console.log("✅ Contract is accessible and responsive");
      } catch (contractError: any) {
        console.error("❌ Contract call failed:", contractError);
        console.error("  Error message:", contractError.message);
        console.error("  Error code:", contractError.code);
        console.error("  This usually means:");
        console.error("    1. Function doesn't exist in the contract");
        console.error("    2. Wrong ABI or function signature");
        console.error("    3. Contract has different interface than expected");
        throw new Error(
          `Contract call failed: ${contractError.message}`
        );
      }

      // First try to verify the proof to debug the issue
      console.log("\n✨ Step 4: Verifying Proof On-Chain...");
      try {
        const isValid = await contract.verifyProof(proofBytes, publicInputs);
        console.log("  • Proof Verification Result:", isValid ? "VALID ✅" : "INVALID ❌");
        
        if (!isValid) {
          throw new Error("Proof verification returned false");
        }
        console.log("✅ Proof verified successfully!");
      } catch (verifyError: any) {
        console.error("❌ Proof verification failed:", verifyError);
        console.error("  Error message:", verifyError.message);
        console.error("  Error code:", verifyError.code);
        console.error("  Error data:", verifyError.data);
        throw new Error(`Proof verification failed: ${verifyError.message}`);
      }

      // Call contract function
      console.log("\n🚀 Step 5: Calling mintWithZkProof...");
      console.log("  • Recipient:", address);
      console.log("  • Sending transaction...");
      
      const tx = await contract.mintWithZkProof(
        address,
        proofBytes,
        publicInputs
      );
      
      console.log("✅ Transaction sent!");
      console.log("  • Transaction Hash:", tx.hash);
      console.log("  • Waiting for confirmation...");

      setError("Transaction sent! Waiting for confirmation...");
      const receipt = await tx.wait();
      
      console.log("✅ Transaction confirmed!");
      console.log("  • Block Number:", receipt.blockNumber);
      console.log("  • Gas Used:", receipt.gasUsed.toString());
      console.log("🎉 NFT MINTED SUCCESSFULLY!");
      console.log("=".repeat(60) + "\n");

      setMintSuccess(true);
      setProofResult(null);
      setError("");

      // Redirect to admin dashboard after 3 seconds
      setTimeout(() => {
        window.location.href = "/vesting-admin";
      }, 3000);
    } catch (err: any) {
      console.error("\n❌ MINTING FAILED");
      console.error("  Error:", err.message);
      console.error("  Full error:", err);
      console.error("=".repeat(60) + "\n");
      setError(err.message || "Failed to mint NFT");
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          {/* Hero Section */}
          <div className={styles.heroSection}>
            <div className={styles.lockIcon}>🔐</div>
            <h1 className={styles.title}>
              <span className={styles.vestingGradient}>ZK Proof Demo</span>
            </h1>
            <p className={styles.subtitle}>Privacy-Preserving Balance Verification</p>
            
            <p className={styles.description}>
              Verify your eligibility privately using Zero-Knowledge Proofs. 
              Prove you have at least <span className={styles.highlight}>{minRequiredBalance} ETH</span> without revealing your exact balance.
            </p>

            <div className={styles.featuresGrid}>
              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>🛡️</div>
                <div className={styles.featureTitle}>Privacy First</div>
                <div className={styles.featureDesc}>Zero-knowledge verification</div>
              </div>
              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>⚡</div>
                <div className={styles.featureTitle}>Groth16 Proofs</div>
                <div className={styles.featureDesc}>Efficient zk-SNARKs</div>
              </div>
              <div className={styles.featureCard}>
                <div className={styles.featureIcon}>🔒</div>
                <div className={styles.featureTitle}>On-Chain Verification</div>
                <div className={styles.featureDesc}>Trustless and transparent</div>
              </div>
            </div>

            <div className={styles.connect}>
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
          </div>
        </div>

        {address && (
          <div className={styles.verificationSection}>
            <div className={styles.verificationCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <span className={styles.verifyIcon}>✓</span> Balance Verification
                </h2>
                <p className={styles.cardSubtitle}>Prove your balance privately using Zero-Knowledge Proofs</p>
              </div>

              <div className={styles.statusBar}>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>Wallet</span>
                  <span className={styles.statusValue}>{address.slice(0, 6)}...{address.slice(-4)}</span>
                </div>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>Network</span>
                  <span className={styles.statusValue}>{chain?.name || "Unknown"}</span>
                </div>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>Status</span>
                  <span className={`${styles.statusValue} ${isCorrectNetwork ? styles.statusSuccess : styles.statusWarning}`}>
                    {isCorrectNetwork ? "✓ Ready" : "⚠ Wrong Network"}
                  </span>
                </div>
              </div>

              <div className={styles.requirementsBox}>
                <h3 className={styles.requirementsTitle}>Requirements</h3>
                <ul className={styles.requirementsList}>
                  <li className={styles.requirementItem}>
                    <span className={styles.requirementBullet}>•</span>
                    Minimum balance of <strong>{minRequiredBalance} ETH</strong> on Arbitrum Sepolia
                  </li>
                  <li className={styles.requirementItem}>
                    <span className={styles.requirementBullet}>•</span>
                    Zero-knowledge proof will verify balance without revealing exact amount
                  </li>
                  <li className={styles.requirementItem}>
                    <span className={styles.requirementBullet}>•</span>
                    {isCorrectNetwork ? (
                      <span className={styles.networkCorrect}>✓ Connected to Arbitrum Sepolia</span>
                    ) : (
                      <span className={styles.networkWrong}>✗ Please switch to Arbitrum Sepolia</span>
                    )}
                  </li>
                </ul>
              </div>

              {/* Network Warning */}
              {!isCorrectNetwork && (
                <div className={styles.networkWarning}>
                  <div className={styles.warningIcon}>⚠️</div>
                  <div className={styles.warningContent}>
                    <h3 className={styles.warningTitle}>Wrong Network Detected</h3>
                    <p className={styles.warningText}>
                      You are currently on <strong>{chain?.name || "Unknown Network"}</strong>.
                      Please switch to <strong>Arbitrum Sepolia</strong> to continue.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchChain?.({ chainId: arbitrumSepolia.id })}
                      className={styles.switchNetworkButton}
                    >
                      Switch to Arbitrum Sepolia
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={generateProof}
                disabled={isGeneratingProof || !address || !isCorrectNetwork}
                className={styles.primaryButton}
              >
                {!isCorrectNetwork
                  ? "⚠️ Switch Network First"
                  : isGeneratingProof
                    ? "🔄 Generating Zero-Knowledge Proof..."
                    : "🔐 Generate ZK Proof & Verify"}
              </button>

              {error && (
                <div className={styles.errorBox}>
                  <span className={styles.errorIcon}>✗</span>
                  <span>{error}</span>
                </div>
              )}

              {proofResult && (
                <div className={styles.successBox}>
                  <div className={styles.successHeader}>
                    <span className={styles.successIcon}>✓</span>
                    <h3 className={styles.successTitle}>Proof Generated Successfully!</h3>
                  </div>
                  
                  <div className={styles.proofDetails}>
                    <div className={styles.proofDetailItem}>
                      <span className={styles.proofLabel}>Asset:</span>
                      <span className={styles.proofValue}>{proofResult.metadata.token}</span>
                    </div>
                    <div className={styles.proofDetailItem}>
                      <span className={styles.proofLabel}>Your Balance:</span>
                      <span className={styles.proofValue}>{proofResult.metadata.userBalance} ETH</span>
                    </div>
                    <div className={styles.proofDetailItem}>
                      <span className={styles.proofLabel}>Required:</span>
                      <span className={styles.proofValue}>{proofResult.metadata.requiredBalance} ETH</span>
                    </div>
                    <div className={styles.proofDetailItem}>
                      <span className={styles.proofLabel}>Network:</span>
                      <span className={styles.proofValue}>{proofResult.metadata.network}</span>
                    </div>
                  </div>

                  <button 
                    type="button" 
                    onClick={mintNFT} 
                    className={styles.primaryButton}
                    disabled={!isCorrectNetwork}
                  >
                    {!isCorrectNetwork ? "⚠️ Switch Network First" : "✓ Verify & Continue"}
                  </button>
                </div>
              )}

              {mintSuccess && (
                <div className={styles.finalSuccessBox}>
                  <div className={styles.finalSuccessIcon}>🎉</div>
                  <h3 className={styles.finalSuccessTitle}>Verification Complete!</h3>
                  <p className={styles.finalSuccessText}>
                    Your balance has been verified on-chain using Zero-Knowledge Proofs.
                    The NFT has been minted to your wallet as proof of verification.
                  </p>
                  
                  <div className={styles.redirectMessage}>
                    <div className={styles.spinner}></div>
                    <p>Redirecting you to Admin Dashboard shortly...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Home;