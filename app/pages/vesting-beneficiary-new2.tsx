import { useState, useMemo, useEffect } from "react";
import { useFhevm } from "../lib/fhevm-sdk/react";
import { useAccount } from "wagmi";
import { ethers } from "ethers";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useVestingWallet } from "../lib/hooks/vesting/useVestingWallet";
import { useCustomVestingFactory } from "../lib/hooks/vesting/useCustomVestingFactory";
import { NextPage } from "next";
import Link from "next/link";
import styles from "../styles/vesting.module.css";

/**
 * Beneficiary Panel for Viewing and Claiming Vested Tokens
 * Allows beneficiaries to check their vesting schedule and claim available tokens
 */
const VestingBeneficiary: NextPage = () => {
  const { address: userAddress, isConnected, chain } = useAccount();
  const chainId = chain?.id;

  // Token mode selection - NO DEFAULT, user must choose
  const [tokenMode, setTokenMode] = useState<"testing" | "production" | "">("");

  // Pre-configured addresses from deployment
  const factoryAddress = "0x52be5B1113098A3D198b5AAaC0caad0aB1D87703"; // Fixed: FHE coprocessor setup
  
  const TOKEN_ADDRESSES = {
    testing: "0x35796A3970aC4F480169b64d1c38FCcCA347faEB", // MockVestingToken
    production: "0x01D32cDfAa2787c9729956bDaF8D378ebDC9aa12", // ConfidentialVestingToken (Full FHE)
  };
  
  const tokenAddress = tokenMode ? TOKEN_ADDRESSES[tokenMode] : "";
  
  // Vesting wallet address (discovered by user)
  const [vestingWalletAddress, setVestingWalletAddress] = useState("");

  // Schedule parameters (to find the wallet)
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(300);
  const [cliffSeconds, setCliffSeconds] = useState(120);
  
  // Current time tracking for vesting checks
  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  // FHEVM instance
  const provider = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return (window as any).ethereum;
  }, []);

  const initialMockChains = { 31337: "http://localhost:8545" };

  // FHE is ALWAYS needed - the factory contract requires encrypted amounts
  // SimpleMockToken is just easier to mint/approve, but encryption is still required
  const { instance: fhevmInstance, status: fhevmStatus, error: fhevmError } = useFhevm({
    provider,
    chainId,
    initialMockChains,
    enabled: true,
  });

  // Factory hook to find vesting wallet
  const { getVestingWalletAddress } = useCustomVestingFactory({
    factoryAddress,
    instance: fhevmInstance,
  });

  // Vesting wallet hook
  const { owner, releasableAmount, releaseTokens, getReleasableAmount, isProcessing, isDecrypting, message } =
    useVestingWallet({
      walletAddress: vestingWalletAddress,
      instance: fhevmInstance,
    });

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Calculate vesting timing
  const vestingHasStarted = startTimestamp > 0 && currentTime >= startTimestamp;
  const cliffEndTimestamp = startTimestamp + cliffSeconds;
  const cliffHasPassed = startTimestamp > 0 && currentTime >= cliffEndTimestamp;
  const vestingEndTimestamp = startTimestamp + durationSeconds;
  const vestingHasEnded = startTimestamp > 0 && currentTime >= vestingEndTimestamp;

  // Time remaining calculations
  const timeUntilStart = Math.max(0, startTimestamp - currentTime);
  const timeUntilCliff = Math.max(0, cliffEndTimestamp - currentTime);
  const timeUntilEnd = Math.max(0, vestingEndTimestamp - currentTime);

  // Format time remaining as human readable
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds === 0) return "Now available!";
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  // Check if user can claim
  const canClaim = vestingHasStarted && cliffHasPassed && vestingWalletAddress && tokenAddress && !isProcessing;

  // Find vesting wallet for the current user
  const findMyWallet = async () => {
    if (!userAddress) {
      alert("Please connect your wallet first");
      return;
    }

    // Check if on correct network (Ethereum Sepolia)
    if (chainId !== 11155111) {
      alert(`❌ Wrong Network!\n\nYou're connected to: ${chain?.name || 'Unknown'} (Chain ID: ${chainId})\n\nPlease switch to Ethereum Sepolia (Chain ID: 11155111)\n\nThe vesting contracts are deployed on Ethereum Sepolia.`);
      return;
    }

    if (!startTimestamp || startTimestamp === 0) {
      alert("⚠️ IMPORTANT: You must enter the EXACT startTimestamp used during creation!\n\n" +
            "Check the creation transaction logs on Etherscan:\n" +
            "1. Go to the transaction\n" +
            "2. Click 'Logs' tab\n" +
            "3. Find 'IndividualVestingCreated' event\n" +
            "4. Copy the startTimestamp value");
      return;
    }

    try {
      console.log("🔍 Looking for wallet with parameters:");
      console.log("   Beneficiary:", userAddress);
      console.log("   Start Timestamp:", startTimestamp);
      console.log("   Duration:", durationSeconds);
      console.log("   Cliff:", cliffSeconds);

      const address = await getVestingWalletAddress(
        userAddress,
        startTimestamp,
        durationSeconds,
        cliffSeconds,
      );
      
      console.log("📍 Predicted wallet address:", address);
      setVestingWalletAddress(address);
      
      alert(`✅ Vesting wallet found!\n\nAddress: ${address}\n\nYou can now check your releasable amount and claim tokens.`);
    } catch (error: any) {
      console.error("Error finding wallet:", error);
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      alert(`❌ Failed to find vesting wallet.\n\nError: ${errorMessage}\n\nPlease check all parameters match EXACTLY what the admin used during creation.`);
    }
  };

  // Check releasable amount
  const checkReleasable = async () => {
    await getReleasableAmount(tokenAddress);
  };

  // Claim tokens - works even without FHE instance
  const handleClaim = async () => {
    if (!vestingWalletAddress || !tokenAddress) {
      alert("Please find your vesting wallet first");
      return;
    }

    // Check if vesting has started
    if (!vestingHasStarted) {
      alert(`❌ Vesting hasn't started yet!\n\nVesting starts at: ${new Date(startTimestamp * 1000).toLocaleString()}\n\nTime remaining: ${formatTimeRemaining(timeUntilStart)}`);
      return;
    }

    // Check if cliff has passed
    if (!cliffHasPassed) {
      alert(`❌ Cliff period hasn't passed yet!\n\nCliff ends at: ${new Date(cliffEndTimestamp * 1000).toLocaleString()}\n\nTime remaining: ${formatTimeRemaining(timeUntilCliff)}\n\nYou must wait until the cliff period passes before claiming tokens.`);
      return;
    }

    try {
      // Direct claim without needing FHE instance
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      const walletABI = [
        "function release(address token) external"
      ];
      
      const wallet = new ethers.Contract(vestingWalletAddress, walletABI, signer);
      
      console.log("Releasing tokens from wallet:", vestingWalletAddress);
      const tx = await wallet.release(tokenAddress);
      
      console.log("Release transaction sent:", tx.hash);
      alert(`⏳ Transaction sent! Hash: ${tx.hash}\n\nWaiting for confirmation...`);
      
      const receipt = await tx.wait();
      
      console.log("Tokens released! Block:", receipt.blockNumber);
      alert(`✅ Tokens released successfully!\n\nTransaction: ${tx.hash}`);
      
    } catch (error: any) {
      console.error("Failed to release tokens:", error);
      
      if (error.message?.includes("cliff")) {
        alert("❌ Cliff period hasn't passed yet! You need to wait 2 minutes from the start timestamp.");
      } else {
        alert(`❌ Failed to claim: ${error.message || "Unknown error"}`);
      }
    }
  };

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.connectCard}>
          <h2 className={styles.connectTitle}>🎁 Beneficiary Portal</h2>
          <p className={styles.connectText}>Connect your wallet to view and claim your vested tokens.</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <Link href="/" className={styles.backLink}>
          ← Back to Home
        </Link>
        <ConnectButton />
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className={styles.title}>🎁 Beneficiary Portal</h1>
        <p className={styles.subtitle}>View and claim your vested tokens</p>
      </div>

      {/* Configuration */}
      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>⚙️ Configuration</h3>
        
        {/* Network Warning */}
        {chainId && chainId !== 11155111 && (
          <div className={styles.error} style={{ marginBottom: '1rem' }}>
            <p className={styles.fontBold + ' ' + styles.textSm}>
              ⚠️ WRONG NETWORK!
            </p>
            <p className={styles.textXs} style={{ marginTop: '0.5rem' }}>
              You're connected to: <strong>{chain?.name || 'Unknown'}</strong> (Chain ID: {chainId})
            </p>
            <p className={styles.textXs + ' ' + styles.fontBold} style={{ marginTop: '0.5rem' }}>
              Please switch to <strong>Ethereum Sepolia (Chain ID: 11155111)</strong> to use this app.
            </p>
          </div>
        )}
        
        <div className={styles.flexCol}>
          <div>
            <label className={styles.label}>Your Address (Connected)</label>
            <input type="text" className={styles.input} value={userAddress || ""} disabled style={{ opacity: 0.7 }} />
          </div>

          <div>
            <label className={styles.label}>Factory Address</label>
            <div className={styles.flexRow}>
              <input
                type="text"
                className={styles.input}
                value={factoryAddress}
                readOnly
                style={{ flex: 1 }}
              />
              <a
                href={`https://sepolia.etherscan.io/address/${factoryAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.textBlue + ' ' + styles.textSm}
                style={{ whiteSpace: 'nowrap', marginLeft: '0.5rem' }}
              >
                View →
              </a>
            </div>
          </div>

          <div>
            <label className={styles.label}>
              Select Token Mode <span className={styles.textRed}>*</span>
            </label>
            <select
              value={tokenMode}
              onChange={(e) => setTokenMode(e.target.value as "testing" | "production" | "")}
              className={styles.select}
            >
              <option value="" disabled>Choose testing or production token...</option>
              <option value="testing">
                🧪 Testing - MockVestingToken (0x3579...faEB) - Easy minting, pre-approved
              </option>
              <option value="production">
                🔒 Production - ConfidentialVestingToken (0x01D3...12) - Full FHE encryption
              </option>
            </select>
            {tokenMode && (
              <p className={styles.textXs + ' ' + styles.textGray} style={{ marginTop: '0.25rem' }}>
                {tokenMode === "testing" 
                  ? "✅ Testing mode: MockVestingToken for easy testing - tokens already minted & approved!" 
                  : "🔐 Production mode: Full FHE encryption with proof generation required"}
              </p>
            )}
            {!tokenMode && (
              <p className={styles.textXs + ' ' + styles.textRed} style={{ marginTop: '0.25rem' }}>
                ⚠️ Please select a token mode to continue
              </p>
            )}
          </div>

          {tokenMode && (
            <div>
              <label className={styles.label}>
                Token Address {tokenMode === "testing" ? "(MockVestingToken)" : "(ConfidentialVestingToken)"}
              </label>
              <div className={styles.flexRow}>
                <input
                  type="text"
                  className={styles.input}
                  value={tokenAddress}
                  readOnly
                  style={{ flex: 1 }}
                />
                <a
                  href={`https://sepolia.etherscan.io/address/${tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.textBlue + ' ' + styles.textSm}
                  style={{ whiteSpace: 'nowrap', marginLeft: '0.5rem' }}
                >
                  View →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Find Your Wallet */}
      <div className={styles.card}>
        <h3 className={styles.sectionTitle}>🔍 Find Your Vesting Wallet</h3>
        
        {/* Important Notice */}
        <div className={styles.warning} style={{ marginBottom: '1rem' }}>
          <p className={styles.fontBold + ' ' + styles.textSm}>
            ⚠️ IMPORTANT: You need the EXACT parameters from the creation transaction!
          </p>
          <p className={styles.textXs} style={{ marginTop: '0.5rem' }}>
            The vesting wallet address is calculated from these parameters. If ANY parameter is wrong by even 1 second, you'll get the wrong address.
          </p>
        </div>

        <div className={styles.flexCol}>
          <div className={styles.grid + ' ' + styles.grid2}>
            <div>
              <label className={styles.label}>
                Start Timestamp <span className={styles.textRed}>* REQUIRED</span>
              </label>
              <input
                type="number"
                className={styles.input}
                value={startTimestamp || ""}
                onChange={e => setStartTimestamp(parseInt(e.target.value) || 0)}
                placeholder="e.g., 1234567890 (from Etherscan)"
              />
              {!startTimestamp && (
                <p className={styles.textXs + ' ' + styles.textRed} style={{ marginTop: '0.25rem' }}>Must get from transaction logs!</p>
              )}
            </div>
            <div>
              <label className={styles.label}>Cliff (seconds)</label>
              <input
                type="number"
                className={styles.input}
                value={cliffSeconds}
                onChange={e => setCliffSeconds(parseInt(e.target.value) || 0)}
                placeholder="Usually 120"
              />
            </div>
            <div>
              <label className={styles.label}>Duration (seconds)</label>
              <input
                type="number"
                className={styles.input}
                value={durationSeconds}
                onChange={e => setDurationSeconds(parseInt(e.target.value) || 0)}
                placeholder="Usually 300"
              />
            </div>
          </div>

          <button onClick={findMyWallet} className={styles.secondaryButton} style={{ width: '100%' }}>
            🔍 Find My Vesting Wallet
          </button>

          {vestingWalletAddress && (
            <div className={styles.success} style={{ marginTop: '1rem' }}>
              <p className={styles.fontBold}>✅ Vesting Wallet Found:</p>
              <p className={styles.textXs} style={{ wordBreak: 'break-all', marginTop: '0.25rem' }}>{vestingWalletAddress}</p>
              {owner && (
                <p className={styles.textSm} style={{ marginTop: '0.5rem' }}>
                  <strong>Owner:</strong> {owner}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Vesting Info & Actions */}
      {vestingWalletAddress && (
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>💰 Your Vesting</h3>

          <div className={styles.flexCol}>
            {/* Vesting Status Indicators */}
            {startTimestamp > 0 && (
              <div className={styles.flexCol}>
                {/* Vesting Start Status */}
                <div className={vestingHasStarted ? styles.success : styles.error}>
                  <div className={styles.flexRow} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p className={styles.fontBold + ' ' + styles.textSm}>
                        {vestingHasStarted ? '✅ Vesting Started' : '⏳ Waiting for Vesting Start'}
                      </p>
                      <p className={styles.textXs} style={{ marginTop: '0.25rem' }}>
                        {vestingHasStarted 
                          ? `Started: ${new Date(startTimestamp * 1000).toLocaleString()}`
                          : `Starts: ${new Date(startTimestamp * 1000).toLocaleString()}`
                        }
                      </p>
                    </div>
                    {!vestingHasStarted && (
                      <div style={{ textAlign: 'right' }}>
                        <p className={styles.fontBold} style={{ fontSize: '1.25rem' }}>{formatTimeRemaining(timeUntilStart)}</p>
                        <p className={styles.textXs}>remaining</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cliff Status */}
                <div className={cliffHasPassed ? styles.success : (vestingHasStarted ? styles.warning : styles.info)}>
                  <div className={styles.flexRow} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p className={styles.fontBold + ' ' + styles.textSm}>
                        {cliffHasPassed 
                          ? '✅ Cliff Period Passed' 
                          : vestingHasStarted
                          ? '⏳ Cliff Period in Progress'
                          : '🔒 Cliff Period Not Started'
                        }
                      </p>
                      <p className={styles.textXs} style={{ marginTop: '0.25rem' }}>
                        {cliffHasPassed
                          ? `Cliff ended: ${new Date(cliffEndTimestamp * 1000).toLocaleString()}`
                          : `Cliff ends: ${new Date(cliffEndTimestamp * 1000).toLocaleString()}`
                        }
                      </p>
                    </div>
                    {!cliffHasPassed && vestingHasStarted && (
                      <div style={{ textAlign: 'right' }}>
                        <p className={styles.fontBold} style={{ fontSize: '1.25rem' }}>{formatTimeRemaining(timeUntilCliff)}</p>
                        <p className={styles.textXs}>remaining</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vesting Progress */}
                {vestingHasStarted && (
                  <div className={styles.info}>
                    <p className={styles.fontBold + ' ' + styles.textSm}>
                      {vestingHasEnded ? '✅ Vesting Complete' : '📊 Vesting in Progress'}
                    </p>
                    {!vestingHasEnded && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                          <div 
                            style={{
                              height: '8px',
                              borderRadius: '4px',
                              background: 'linear-gradient(135deg, #E3066E, #213147)',
                              width: `${Math.min(100, ((currentTime - startTimestamp) / durationSeconds) * 100)}%`,
                              transition: 'width 1s'
                            }}
                          />
                        </div>
                        <p className={styles.textXs} style={{ marginTop: '0.25rem', textAlign: 'right' }}>
                          {Math.min(100, Math.floor(((currentTime - startTimestamp) / durationSeconds) * 100))}% complete
                          {' • '}
                          {formatTimeRemaining(timeUntilEnd)} remaining
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Releasable Amount Display */}
            {releasableAmount !== null && (
              <div className={styles.info}>
                <p className={styles.fontBold}>
                  Releasable Amount: {releasableAmount.toString()} tokens
                </p>
              </div>
            )}

            {/* Warning if trying to claim too early */}
            {startTimestamp > 0 && !canClaim && (
              <div className={styles.warning}>
                <p className={styles.fontBold + ' ' + styles.textSm}>
                  ⚠️ Cannot Claim Yet
                </p>
                <p className={styles.textXs} style={{ marginTop: '0.25rem' }}>
                  {!vestingHasStarted 
                    ? `Vesting hasn't started. Wait ${formatTimeRemaining(timeUntilStart)}.`
                    : !cliffHasPassed
                    ? `Cliff period must pass first. Wait ${formatTimeRemaining(timeUntilCliff)}.`
                    : 'Please check all requirements above.'
                  }
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className={styles.grid + ' ' + styles.grid2}>
              <button
                onClick={checkReleasable}
                disabled={!vestingWalletAddress || !tokenAddress || isDecrypting || !tokenMode || !cliffHasPassed}
                className={styles.secondaryButton}
              >
                {isDecrypting ? "⏳ Decrypting..." : "🔓 Check Releasable Amount"}
              </button>

              <button
                onClick={handleClaim}
                disabled={!canClaim || releasableAmount === BigInt(0) || !tokenMode}
                className={styles.primaryButton}
              >
                {isProcessing ? "⏳ Processing..." : "🎉 Claim Tokens"}
              </button>
            </div>
            {!tokenMode && (
              <p className={styles.textXs + ' ' + styles.textRed} style={{ textAlign: 'center' }}>
                ⚠️ Please select a token mode first
              </p>
            )}
            {!canClaim && tokenMode && startTimestamp > 0 && (
              <p className={styles.textXs + ' ' + styles.textYellow} style={{ textAlign: 'center' }}>
                ℹ️ Claim button will be enabled once vesting starts and cliff period passes
              </p>
            )}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {message && (
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>💬 Status</h3>
          <p>{message}</p>
        </div>
      )}

      {/* Instructions */}
      <div className={styles.info}>
        <h3 className={styles.fontBold + ' ' + styles.textSm} style={{ marginBottom: '0.75rem' }}>📖 Instructions</h3>
        <ol style={{ listStyleType: 'decimal', listStylePosition: 'inside', fontSize: '0.875rem' }}>
          <li style={{ marginBottom: '0.5rem' }}>Connect your wallet (must be the beneficiary address)</li>
          <li style={{ marginBottom: '0.5rem' }}>Enter the factory address (get from admin)</li>
          <li style={{ marginBottom: '0.5rem' }}>Enter the token address</li>
          <li style={{ marginBottom: '0.5rem' }}>Enter the vesting parameters (cliff & duration from admin)</li>
          <li style={{ marginBottom: '0.5rem' }}>Click "Find My Vesting Wallet" to locate your wallet</li>
          <li style={{ marginBottom: '0.5rem' }}>Click "Check Releasable Amount" to see how much you can claim</li>
          <li style={{ marginBottom: '0.5rem' }}>Wait for the cliff period (2 min) to pass</li>
          <li>Click "Claim Tokens" to release your vested tokens!</li>
        </ol>
      </div>
    </div>
  );
};

export default VestingBeneficiary;

