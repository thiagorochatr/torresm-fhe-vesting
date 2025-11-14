import { useState, useMemo, useEffect } from "react";
import { useFhevm } from "../lib/fhevm-sdk/react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCustomVestingFactory, type VestingSchedule } from "../lib/hooks/vesting/useCustomVestingFactory";
import { ethers } from "ethers";
import { NextPage } from "next";
import Link from "next/link";
import styles from "../styles/vesting.module.css";

/**
 * Admin Panel for Creating and Funding Vesting Schedules
 * Allows admins to batch create encrypted vesting wallets for multiple beneficiaries
 */
const VestingAdmin: NextPage = () => {
  const { isConnected, chain, address: userAddress } = useAccount();
  const chainId = chain?.id;

  // Token mode selection - NO DEFAULT, user must choose
  const [tokenMode, setTokenMode] = useState<"testing" | "production" | "">("");
  const [tokenBalance, setTokenBalance] = useState<string>("");
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isApproved, setIsApproved] = useState<boolean>(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Pre-configured addresses from deployment
  const factoryAddress = "0x52be5B1113098A3D198b5AAaC0caad0aB1D87703"; // Fixed: FHE coprocessor setup
  
  const TOKEN_ADDRESSES = {
    testing: "0x35796A3970aC4F480169b64d1c38FCcCA347faEB", // MockVestingToken
    production: "0x01D32cDfAa2787c9729956bDaF8D378ebDC9aa12", // ConfidentialVestingToken (Full FHE)
  };
  
  const tokenAddress = tokenMode ? TOKEN_ADDRESSES[tokenMode] : "";

  // Vesting schedules
  const [schedules, setSchedules] = useState<VestingSchedule[]>([
    {
      beneficiary: "",
      amount: BigInt(0),
      startTimestamp: Math.floor(Date.now() / 1000), // Now
      durationSeconds: 300, // 5 minutes
      cliffSeconds: 120, // 2 minutes
    },
  ]);

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

  // Custom vesting factory hook
  const { batchCreateAndFund, isProcessing, message, txHash } = useCustomVestingFactory({
    factoryAddress,
    instance: fhevmInstance,
  });

  // Add a new schedule to the list
  const addSchedule = () => {
    setSchedules([
      ...schedules,
      {
        beneficiary: "",
        amount: BigInt(0),
        startTimestamp: Math.floor(Date.now() / 1000),
        durationSeconds: 300,
        cliffSeconds: 120,
      },
    ]);
  };

  // Remove a schedule from the list
  const removeSchedule = (index: number) => {
    setSchedules(schedules.filter((_, i) => i !== index));
  };

  // Update a schedule
  const updateSchedule = (index: number, field: keyof VestingSchedule, value: string | number) => {
    const newSchedules = [...schedules];
    if (field === "amount") {
      newSchedules[index][field] = BigInt(value || 0);
    } else if (field === "beneficiary") {
      newSchedules[index][field] = value as string;
    } else {
      newSchedules[index][field] = typeof value === "string" ? parseInt(value) || 0 : value;
    }
    setSchedules(newSchedules);
  };

  // Check token balance when token mode changes
  useEffect(() => {
    const checkBalance = async () => {
      if (!tokenAddress || !userAddress) {
        setTokenBalance("");
      return;
    }

      setIsLoadingBalance(true);
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const tokenABI = ["function balanceOf(address) view returns (uint256)"];
        const token = new ethers.Contract(tokenAddress, tokenABI, provider);
        const balance = await token.balanceOf(userAddress);
        setTokenBalance(ethers.formatEther(balance));
      } catch (error) {
        console.error("Error fetching balance:", error);
        setTokenBalance("Error");
      } finally {
        setIsLoadingBalance(false);
      }
    };

    checkBalance();
  }, [tokenAddress, userAddress]);

  // Check approval status when token changes
  const checkApproval = async () => {
    if (!tokenAddress || !userAddress) {
      setIsApproved(false);
      return;
    }

    setIsCheckingApproval(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const tokenABI = ["function isOperator(address account, address operator) view returns (bool)"];
      const token = new ethers.Contract(tokenAddress, tokenABI, provider);
      const approved = await token.isOperator(userAddress, factoryAddress);
      setIsApproved(approved);
    } catch (error) {
      console.error("Error checking approval:", error);
      setIsApproved(false);
    } finally {
      setIsCheckingApproval(false);
    }
  };

  // Auto-check approval when token changes
  useEffect(() => {
    checkApproval();
  }, [tokenAddress, userAddress]);

  // Handle approval - triggers wallet signature
  const handleApprove = async () => {
    if (!tokenAddress || !userAddress) return;

    setIsApproving(true);
    try {
      // Get signer to trigger wallet signature
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      const tokenABI = [
        "function setOperator(address operator, bool approved)",
        "event OperatorSet(address indexed owner, address indexed operator, bool approved)"
      ];
      const token = new ethers.Contract(tokenAddress, tokenABI, signer);
      
      console.log("Requesting approval signature from wallet...");
      
      // This triggers the wallet signature popup
      const tx = await token.setOperator(factoryAddress, true);
      
      console.log("Approval transaction sent:", tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      console.log("Approval confirmed in block:", receipt.blockNumber);
      
      setIsApproved(true);
      alert(`✅ Factory approved successfully!\n\nTransaction: ${tx.hash}`);
    } catch (error: any) {
      console.error("Error approving:", error);
      
      // Handle user rejection
      if (error.code === 4001 || error.code === "ACTION_REJECTED") {
        alert("❌ Approval cancelled by user");
      } else {
        alert(`❌ Approval failed: ${error.message || "Unknown error"}`);
      }
    } finally {
      setIsApproving(false);
    }
  };

  // Submit the batch
  const handleSubmit = async () => {
    const validSchedules = schedules.filter(s => s.beneficiary && s.amount > 0);
    if (validSchedules.length === 0) {
      alert("Please add at least one valid schedule with beneficiary address and amount");
      return;
    }

    try {
      await batchCreateAndFund(tokenAddress, validSchedules);
    } catch (error) {
      console.error("Failed to create vesting schedules:", error);
    }
  };

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.connectCard}>
          <h2 className={styles.connectTitle}>🔐 Admin Panel</h2>
          <p className={styles.connectText}>Connect your wallet to access the vesting admin panel.</p>
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
        <h1 className={styles.title}>🔐 Vesting Admin Panel</h1>
        <p className={styles.subtitle}>Create and fund encrypted vesting schedules</p>
      </div>

      {/* Configuration - Pre-configured */}
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
                🧪 Testing - SimpleMockToken (0x3579...faEB) - Easy minting, pre-approved
              </option>
              <option value="production">
                🔒 Production - ConfidentialVestingToken (0x01D3...12) - Full FHE encryption
              </option>
            </select>
            {tokenMode && (
              <p className={styles.textXs + ' ' + styles.textGray} style={{ marginTop: '0.25rem' }}>
                {tokenMode === "testing" 
                  ? "✅ Testing mode: Simple mock token for easy testing - tokens already minted & approved!" 
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
                Token Address {tokenMode === "testing" ? "(SimpleMockToken)" : "(ConfidentialVestingToken)"}
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
              
              {/* Token Balance Display */}
              <div className={styles.info} style={{ marginTop: '0.5rem' }}>
                {isLoadingBalance ? (
                  <p className={styles.textSm}>⏳ Loading balance...</p>
                ) : tokenBalance ? (
                  <div>
                    <p className={styles.textSm + ' ' + styles.fontSemibold}>
                      💰 Your Balance: {tokenBalance} tokens
                    </p>
                    {parseFloat(tokenBalance) === 0 && (
                      <p className={styles.textXs + ' ' + styles.textRed} style={{ marginTop: '0.25rem' }}>
                        ⚠️ No tokens! <a 
                          href={`https://sepolia.etherscan.io/address/${tokenAddress}#writeContract`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'underline' }}
                        >
                          Mint tokens here
                        </a>
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Approval Status & Button */}
              <div className={styles.warning} style={{ marginTop: '0.75rem' }}>
                <div className={styles.flexCol}>
                  <div>
                    <p className={styles.textSm + ' ' + styles.fontSemibold}>
                      🔐 Factory Approval Status
                    </p>
                    {isCheckingApproval ? (
                      <p className={styles.textXs} style={{ marginTop: '0.25rem' }}>⏳ Checking approval status...</p>
                    ) : isApproved ? (
                      <p className={styles.textXs + ' ' + styles.textGreen} style={{ marginTop: '0.25rem' }}>✅ Approved - Factory can spend your tokens</p>
                    ) : (
                      <p className={styles.textXs} style={{ marginTop: '0.25rem' }}>⚠️ Not approved - Click to approve first</p>
                    )}
                    <p className={styles.textXs} style={{ marginTop: '0.5rem' }}>
                      💡 The factory needs approval to transfer tokens when creating vesting schedules.
                    </p>
                  </div>
                  
                  <div className={styles.flexRow} style={{ marginTop: '0.75rem' }}>
                    {!isApproved && !isCheckingApproval && (
                      <button
                        onClick={handleApprove}
                        disabled={isApproving || parseFloat(tokenBalance) === 0}
                        className={styles.primaryButton}
                        style={{ marginRight: '0.5rem' }}
                      >
                        {isApproving ? "⏳ Approving..." : "🔓 Approve Factory"}
                      </button>
                    )}

                    <button
                      onClick={checkApproval}
                      disabled={isCheckingApproval}
                      className={styles.secondaryButton}
                    >
                      {isCheckingApproval ? "⏳ Checking..." : "🔄 Refresh"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Vesting Schedules */}
      <div className={styles.card}>
        <div className={styles.flexRow} style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>📋 Vesting Schedules</h3>
          <button onClick={addSchedule} className={styles.primaryButton}>
            ➕ Add Schedule
          </button>
        </div>

        <div className={styles.flexCol}>
          {schedules.map((schedule, index) => (
            <div key={index} className={styles.schedule}>
              <div className={styles.scheduleHeader}>
                <h4 className={styles.scheduleTitle}>Schedule #{index + 1}</h4>
                {schedules.length > 1 && (
                  <button onClick={() => removeSchedule(index)} className={styles.removeButton}>
                    🗑️ Remove
                  </button>
                )}
              </div>

              <div className={styles.grid + ' ' + styles.grid2}>
                <div>
                  <label className={styles.label}>Beneficiary Address</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="0x..."
                    value={schedule.beneficiary}
                    onChange={e => updateSchedule(index, "beneficiary", e.target.value)}
                  />
                </div>

                <div>
                  <label className={styles.label}>Amount (tokens)</label>
                  <input
                    type="number"
                    className={styles.input}
                    placeholder="1000"
                    value={schedule.amount.toString()}
                    onChange={e => updateSchedule(index, "amount", e.target.value)}
                  />
                </div>

                <div>
                  <label className={styles.label}>Cliff (seconds)</label>
                  <input
                    type="number"
                    className={styles.input}
                    placeholder="120"
                    value={schedule.cliffSeconds}
                    onChange={e => updateSchedule(index, "cliffSeconds", parseInt(e.target.value) || 0)}
                  />
                </div>

                <div>
                  <label className={styles.label}>Duration (seconds)</label>
                  <input
                    type="number"
                    className={styles.input}
                    placeholder="300"
                    value={schedule.durationSeconds}
                    onChange={e => updateSchedule(index, "durationSeconds", parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.mt4}>
          <button
            onClick={handleSubmit}
            disabled={isProcessing || !tokenMode || !isApproved}
            className={styles.primaryButton}
            style={{ width: '100%' }}
          >
            {isProcessing ? "⏳ Processing..." : "🚀 Create & Fund Vesting Schedules"}
          </button>
          {!tokenMode && (
            <p className={styles.textXs + ' ' + styles.textRed} style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              ⚠️ Please select a token mode first
            </p>
          )}
          {tokenMode && !isApproved && (
            <p className={styles.textXs + ' ' + styles.textRed} style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              ⚠️ Please approve the factory first (see Configuration section above)
            </p>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {message && !(message.includes("FHE instance not ready") && tokenMode === "testing") && (
        <div className={styles.card}>
          <h3 className={styles.sectionTitle}>💬 Status</h3>
          <p className={styles.mb2}>{message}</p>
          {txHash && (
            <>
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.textBlue + ' ' + styles.textSm + ' ' + styles.fontSemibold}
              >
                📄 View Transaction on Etherscan →
              </a>
              
              {message.includes("Successfully created") && (
                <div className={styles.success} style={{ marginTop: '1rem' }}>
                  <p className={styles.fontBold + ' ' + styles.mb2}>✅ Vesting Wallets Created!</p>
                  <p className={styles.textSm} style={{ marginBottom: '0.75rem' }}>
                    Share these instructions with your beneficiaries:
                  </p>
                  <ol style={{ listStyleType: 'decimal', listStylePosition: 'inside', padding: '0.75rem', background: 'white', borderRadius: '0.375rem', fontSize: '0.75rem' }}>
                    <li style={{ fontWeight: 500, marginBottom: '0.5rem' }}>
                      Go to the transaction on Etherscan: 
                      <a 
                        href={`https://sepolia.etherscan.io/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.textBlue}
                        style={{ marginLeft: '0.25rem', textDecoration: 'underline', wordBreak: 'break-all' }}
                      >
                        {txHash}
                      </a>
                    </li>
                    <li style={{ marginBottom: '0.5rem' }}>Click the <strong>"Logs"</strong> tab</li>
                    <li style={{ marginBottom: '0.5rem' }}>Find the <strong>"IndividualVestingCreated"</strong> event with their address</li>
                    <li style={{ marginBottom: '0.5rem' }}>Copy these values:
                      <ul style={{ listStyleType: 'disc', listStylePosition: 'inside', marginLeft: '1rem', marginTop: '0.25rem' }}>
                        <li><strong>beneficiary</strong> - Their wallet address</li>
                        <li><strong>startTimestamp</strong> - Unix timestamp</li>
                        <li><strong>durationSeconds</strong> - Vesting duration (e.g., 300)</li>
                        <li><strong>cliffSeconds</strong> - Cliff period (e.g., 120)</li>
                      </ul>
                    </li>
                    <li>Go to the Beneficiary Portal and enter these EXACT values to find their wallet</li>
                  </ol>
                  <p className={styles.textXs + ' ' + styles.fontMedium} style={{ marginTop: '0.75rem' }}>
                    💡 Check browser console for wallet addresses logged there too!
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className={styles.info}>
        <h3 className={styles.fontBold + ' ' + styles.textSm} style={{ marginBottom: '0.75rem' }}>📖 Instructions</h3>
        <ol style={{ listStyleType: 'decimal', listStylePosition: 'inside', fontSize: '0.875rem' }}>
          <li style={{ marginBottom: '0.5rem' }}>Deploy the CustomVestingFactory contract and enter its address above</li>
          <li style={{ marginBottom: '0.5rem' }}>Deploy an ERC7984 compatible token and enter its address</li>
          <li style={{ marginBottom: '0.5rem' }}>Approve the factory to spend your tokens</li>
          <li style={{ marginBottom: '0.5rem' }}>Add beneficiary addresses and amounts (will be encrypted!)</li>
          <li style={{ marginBottom: '0.5rem' }}>Set cliff (2 min) and duration (5 min) for demo purposes</li>
          <li style={{ marginBottom: '0.5rem' }}>Click "Create & Fund" to batch create vesting wallets</li>
          <li>Share wallet addresses with beneficiaries so they can claim</li>
        </ol>
      </div>
    </div>
  );
};

export default VestingAdmin;
