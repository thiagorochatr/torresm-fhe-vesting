import { useState, useMemo, useEffect } from "react";
import { useFhevm } from "../lib/fhevm-sdk/react";
import { useAccount } from "wagmi";
import { ethers } from "ethers";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useVestingWallet } from "../lib/hooks/vesting/useVestingWallet";
import { useCustomVestingFactory } from "../lib/hooks/vesting/useCustomVestingFactory";
import { NextPage } from "next";
import Link from "next/link";
import { FhevmDecryptionSignature } from "../lib/fhevm-sdk/FhevmDecryptionSignature";
import { GenericStringInMemoryStorage } from "../lib/fhevm-sdk/storage/GenericStringStorage";

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

  // Wallet balance state
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [walletBalanceDecrypted, setWalletBalanceDecrypted] = useState<bigint | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

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
    } catch (error) {
      console.error("Error finding wallet:", error);
      alert("Failed to find vesting wallet. Please check all parameters match EXACTLY what the admin used during creation.");
    }
  };

  // Check releasable amount
  const checkReleasable = async () => {
    await getReleasableAmount(tokenAddress);
  };

  // Check wallet balance (confidential balance from ERC7984)
  const checkWalletBalance = async () => {
    if (!userAddress || !tokenAddress) {
      alert("Please connect wallet and select token first");
      return;
    }

    if (!fhevmInstance) {
      alert("⏳ FHEVM is initializing... Please wait a moment and try again.");
      return;
    }

    setIsCheckingBalance(true);
    setBalanceError(null);
    setWalletBalance(null);
    setWalletBalanceDecrypted(null);

    try {
      console.log("🔍 Checking confidential balance for:", userAddress);
      console.log("   Token:", tokenAddress);

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      // ERC7984 ABI with confidentialBalanceOf
      const tokenABI = [
        "function confidentialBalanceOf(address account) external view returns (bytes32)",
        "function name() external view returns (string)",
        "function symbol() external view returns (string)",
      ];

      const tokenContract = new ethers.Contract(tokenAddress, tokenABI, signer);

      // Get encrypted balance (euint64 handle)
      const encryptedBalance = await tokenContract.confidentialBalanceOf(userAddress);
      console.log("🔐 Encrypted balance handle:", encryptedBalance);

      const balanceHandle = BigInt(encryptedBalance);
      setWalletBalance(balanceHandle);

      // Try to decrypt the balance
      try {
        console.log("🔓 Attempting to decrypt balance...");

        // Create decryption signature
        const storage = new GenericStringInMemoryStorage();
        const sig = await FhevmDecryptionSignature.loadOrSign(
          fhevmInstance,
          [tokenAddress as `0x${string}`],
          signer,
          storage
        );

        if (sig) {
          console.log("✅ Decryption signature obtained");

          // Decrypt the balance
          const decryptRequest = [{ 
            handle: encryptedBalance, 
            contractAddress: tokenAddress as `0x${string}` 
          }];

          const decryptedResult = await fhevmInstance.userDecrypt(
            decryptRequest,
            sig.privateKey,
            sig.publicKey,
            sig.signature,
            sig.contractAddresses,
            sig.userAddress,
            sig.startTimestamp,
            sig.durationDays
          );

          const decryptedValue = decryptedResult[encryptedBalance];
          console.log("✅ Decrypted balance:", decryptedValue);

          if (decryptedValue !== undefined) {
            const decryptedBigInt = BigInt(decryptedValue.toString());
            setWalletBalanceDecrypted(decryptedBigInt);
            
            // Format with 18 decimals for display
            const decryptedFormatted = ethers.formatUnits(decryptedBigInt, 18);
            
            alert(`✅ Balance Retrieved & Decrypted!\n\n🔐 Encrypted Handle:\n${encryptedBalance}\n\n🔓 Decrypted Amount:\n${decryptedFormatted} tokens\n\n🎉 Successfully decrypted your confidential balance!`);
          } else {
            alert(`✅ Confidential Balance Retrieved!\n\nEncrypted Handle: ${encryptedBalance}\n\n⚠️ Decryption returned undefined. This may happen if:\n- The balance is zero\n- You don't have permission to decrypt\n- The Zama gateway is not fully configured`);
          }
        } else {
          alert(`✅ Confidential Balance Retrieved!\n\nEncrypted Handle: ${encryptedBalance}\n\n⚠️ Could not create decryption signature. The balance remains encrypted.`);
        }
      } catch (decryptError: any) {
        console.warn("⚠️ Decryption failed:", decryptError);
        alert(`✅ Balance Retrieved (Encrypted)\n\nEncrypted Handle: ${encryptedBalance}\n\n⚠️ Decryption failed: ${decryptError.message}\n\nThe balance remains encrypted. This is expected if the Zama Gateway is not fully configured.`);
      }

    } catch (error: any) {
      console.error("❌ Failed to check balance:", error);
      const errorMsg = error.message || error.toString() || "Unknown error";
      setBalanceError(errorMsg);
      alert(`❌ Failed to check balance:\n\n${errorMsg}\n\nMake sure you have the correct token address and network.`);
    } finally {
      setIsCheckingBalance(false);
    }
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

  const buttonClass =
    "inline-flex items-center justify-center px-6 py-3 font-semibold shadow-lg " +
    "transition-all duration-200 hover:scale-105 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
    "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed";

  const primaryButtonClass =
    buttonClass + " bg-[#FFD208] text-[#2D2D2D] hover:bg-[#A38025] focus-visible:ring-[#2D2D2D] cursor-pointer";

  const secondaryButtonClass =
    buttonClass + " bg-black text-[#F4F4F4] hover:bg-[#1F1F1F] focus-visible:ring-[#FFD208] cursor-pointer";

  const inputClass =
    "w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#FFD208] focus:border-transparent text-gray-900 bg-white";

  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-gray-900">
        <div className="flex items-center justify-center">
          <div className="bg-white shadow-xl p-8 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Wallet not connected</h2>
            <p className="text-gray-700 mb-6">Connect your wallet to check your vesting schedule.</p>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">🎁 Beneficiary Portal</h1>
        <p className="text-gray-600">View and claim your vested tokens</p>
      </div>

      {/* Configuration */}
      <div className="bg-white shadow-lg p-6">
        <h3 className="font-bold text-gray-900 text-xl mb-4">⚙️ Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Your Address (Connected)</label>
            <input type="text" className={inputClass + " bg-blue-50 text-gray-900"} value={userAddress || ""} disabled />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Factory Address</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className={inputClass + " bg-gray-50 text-gray-900"}
                value={factoryAddress}
                readOnly
              />
              <a
                href={`https://sepolia.etherscan.io/address/${factoryAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm whitespace-nowrap"
              >
                View →
              </a>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Token Mode <span className="text-red-500">*</span>
            </label>
            <select
              value={tokenMode}
              onChange={(e) => setTokenMode(e.target.value as "testing" | "production" | "")}
              className={inputClass + " cursor-pointer text-gray-900 " + (!tokenMode ? "text-gray-400" : "")}
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
              <p className="text-xs text-gray-500 mt-1">
                {tokenMode === "testing" 
                  ? "✅ Testing mode: Simple mock token for easy testing - tokens already minted & approved!" 
                  : "🔐 Production mode: Full FHE encryption with proof generation required"}
              </p>
            )}
            {!tokenMode && (
              <p className="text-xs text-red-500 mt-1">
                ⚠️ Please select a token mode to continue
              </p>
            )}
          </div>

          {tokenMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token Address {tokenMode === "testing" ? "(SimpleMockToken)" : "(ConfidentialVestingToken)"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className={inputClass + " bg-gray-50 text-gray-900 font-mono text-sm"}
                  value={tokenAddress}
                  readOnly
                />
                <a
                  href={`https://sepolia.etherscan.io/address/${tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm whitespace-nowrap"
                >
                  View →
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Find Your Wallet */}
      <div className="bg-white shadow-lg p-6">
        <h3 className="font-bold text-gray-900 text-xl mb-4">🔍 Find Your Vesting Wallet</h3>
        
        {/* Important Notice */}
        <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
          <p className="text-sm font-semibold text-yellow-900 mb-2">
            ⚠️ IMPORTANT: You need the EXACT parameters from the creation transaction!
          </p>
          <p className="text-xs text-yellow-800 mb-2">
            The vesting wallet address is calculated from these parameters. If ANY parameter is wrong by even 1 second, you'll get the wrong address.
          </p>
          <details className="text-xs text-yellow-800">
            <summary className="cursor-pointer font-medium hover:text-yellow-900">
              📖 How to get the exact parameters from Etherscan
            </summary>
            <ol className="list-decimal list-inside mt-2 ml-2 space-y-1">
              <li>Go to the creation transaction on Etherscan (get link from admin)</li>
              <li>Click the <strong>"Logs"</strong> tab</li>
              <li>Look for the <strong>"IndividualVestingCreated"</strong> event with your address</li>
              <li>Copy these values:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li><strong>beneficiary</strong> - Your wallet address</li>
                  <li><strong>startTimestamp</strong> - Unix timestamp (e.g., 1234567890)</li>
                  <li><strong>durationSeconds</strong> - Usually 300 (5 min)</li>
                  <li><strong>cliffSeconds</strong> - Usually 120 (2 min)</li>
                </ul>
              </li>
              <li>Enter these EXACT values below</li>
            </ol>
          </details>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-red-700 mb-1">
                Start Timestamp <span className="text-red-500">* REQUIRED</span>
              </label>
              <input
                type="number"
                className={inputClass + " text-gray-900 " + (!startTimestamp ? "border-red-500" : "")}
                value={startTimestamp || ""}
                onChange={e => setStartTimestamp(parseInt(e.target.value) || 0)}
                placeholder="e.g., 1234567890 (from Etherscan)"
              />
              {!startTimestamp && (
                <p className="text-xs text-red-500 mt-1">Must get from transaction logs!</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliff (seconds)</label>
              <input
                type="number"
                className={inputClass + " text-gray-900"}
                value={cliffSeconds}
                onChange={e => setCliffSeconds(parseInt(e.target.value) || 0)}
                placeholder="Usually 120"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (seconds)</label>
              <input
                type="number"
                className={inputClass + " text-gray-900"}
                value={durationSeconds}
                onChange={e => setDurationSeconds(parseInt(e.target.value) || 0)}
                placeholder="Usually 300"
              />
            </div>
          </div>

          <button onClick={findMyWallet} className={secondaryButtonClass + " w-full"}>
            🔍 Find My Vesting Wallet
          </button>

          {vestingWalletAddress && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
              <p className="text-sm font-medium text-green-900 mb-1">✅ Vesting Wallet Found:</p>
              <p className="font-mono text-xs text-green-800 break-all">{vestingWalletAddress}</p>
              {owner && (
                <p className="text-sm text-green-700 mt-2">
                  <strong>Owner:</strong> {owner}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Vesting Info & Actions */}
      {vestingWalletAddress && (
        <div className="bg-white shadow-lg p-6">
          <h3 className="font-bold text-gray-900 text-xl mb-4">💰 Your Vesting</h3>

          <div className="space-y-4">
            {/* Vesting Status Indicators */}
            {startTimestamp > 0 && (
              <div className="space-y-3">
                {/* Vesting Start Status */}
                <div className={`p-4 rounded-lg border-2 ${
                  vestingHasStarted 
                    ? 'bg-green-50 border-green-300' 
                    : 'bg-red-50 border-red-300'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-semibold text-sm ${
                        vestingHasStarted ? 'text-green-900' : 'text-red-900'
                      }`}>
                        {vestingHasStarted ? '✅ Vesting Started' : '⏳ Waiting for Vesting Start'}
                      </p>
                      <p className={`text-xs mt-1 ${
                        vestingHasStarted ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {vestingHasStarted 
                          ? `Started: ${new Date(startTimestamp * 1000).toLocaleString()}`
                          : `Starts: ${new Date(startTimestamp * 1000).toLocaleString()}`
                        }
                      </p>
                    </div>
                    {!vestingHasStarted && (
                      <div className="text-right">
                        <p className="text-xl font-bold text-red-900">{formatTimeRemaining(timeUntilStart)}</p>
                        <p className="text-xs text-red-600">remaining</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cliff Status */}
                <div className={`p-4 rounded-lg border-2 ${
                  cliffHasPassed 
                    ? 'bg-green-50 border-green-300' 
                    : vestingHasStarted
                    ? 'bg-yellow-50 border-yellow-300'
                    : 'bg-gray-50 border-gray-300'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-semibold text-sm ${
                        cliffHasPassed 
                          ? 'text-green-900' 
                          : vestingHasStarted 
                          ? 'text-yellow-900' 
                          : 'text-gray-700'
                      }`}>
                        {cliffHasPassed 
                          ? '✅ Cliff Period Passed' 
                          : vestingHasStarted
                          ? '⏳ Cliff Period in Progress'
                          : '🔒 Cliff Period Not Started'
                        }
                      </p>
                      <p className={`text-xs mt-1 ${
                        cliffHasPassed 
                          ? 'text-green-700' 
                          : vestingHasStarted 
                          ? 'text-yellow-700' 
                          : 'text-gray-600'
                      }`}>
                        {cliffHasPassed
                          ? `Cliff ended: ${new Date(cliffEndTimestamp * 1000).toLocaleString()}`
                          : `Cliff ends: ${new Date(cliffEndTimestamp * 1000).toLocaleString()}`
                        }
                      </p>
                    </div>
                    {!cliffHasPassed && vestingHasStarted && (
                      <div className="text-right">
                        <p className="text-xl font-bold text-yellow-900">{formatTimeRemaining(timeUntilCliff)}</p>
                        <p className="text-xs text-yellow-600">remaining</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vesting Progress */}
                {vestingHasStarted && (
                  <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-sm text-blue-900">
                        {vestingHasEnded ? '✅ Vesting Complete' : '📊 Vesting in Progress'}
                      </p>
                      {!vestingHasEnded && (
                        <p className="text-xs text-blue-700">
                          Ends: {new Date(vestingEndTimestamp * 1000).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {!vestingHasEnded && (
                      <div className="mt-2">
                        <div className="w-full bg-blue-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                            style={{
                              width: `${Math.min(100, ((currentTime - startTimestamp) / durationSeconds) * 100)}%`
                            }}
                          />
                        </div>
                        <p className="text-xs text-blue-600 mt-1 text-right">
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

            {/* Wallet Balance Display */}
            {walletBalance !== null && (
              <div className="p-4 bg-green-50 border border-green-200 rounded">
                <p className="text-sm font-medium text-green-900 mb-2">💰 Your Wallet Balance:</p>
                
                {walletBalanceDecrypted !== null ? (
                  <>
                    {/* Decrypted Value - Main Display */}
                    <div className="bg-green-100 p-3 rounded mb-3">
                      <p className="text-xs text-green-700 mb-1">🔓 Decrypted Amount:</p>
                      <p className="text-3xl font-bold text-green-900">
                        {ethers.formatUnits(walletBalanceDecrypted, 18)} <span className="text-lg">tokens</span>
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        (Raw: {walletBalanceDecrypted.toString()} wei)
                      </p>
                    </div>
                    
                    {/* Encrypted Handle - Collapsed */}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-green-700 hover:text-green-900 font-medium">
                        🔐 Show encrypted handle (technical details)
                      </summary>
                      <div className="mt-2 p-2 bg-white rounded">
                        <p className="text-green-900 font-mono break-all text-xs">
                          {walletBalance.toString()}
                        </p>
                        <p className="text-green-600 mt-1">
                          This is the on-chain encrypted representation (euint64 handle)
                        </p>
                      </div>
                    </details>
                  </>
                ) : (
                  <>
                    {/* Encrypted Only */}
                    <p className="text-sm text-green-700 mb-1">🔐 Encrypted Handle:</p>
                    <p className="text-lg font-bold text-green-900 font-mono break-all">
                      {walletBalance.toString()}
                    </p>
                    <p className="text-xs text-green-700 mt-2">
                      ⚠️ This is an <strong>encrypted balance handle</strong> (euint64). The actual token amount is private and encrypted on-chain.
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      📍 Decryption was not successful. This may happen if the Zama Gateway is not fully configured.
                    </p>
                  </>
                )}
              </div>
            )}

            {balanceError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded">
                <p className="text-sm font-semibold text-red-900">❌ Balance Check Failed:</p>
                <p className="text-xs text-red-700 mt-1">{balanceError}</p>
              </div>
            )}

            {/* Releasable Amount Display */}
            {releasableAmount !== null && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-lg font-semibold text-blue-900">
                  Releasable Amount: {releasableAmount.toString()} tokens
                </p>
              </div>
            )}

            {/* Warning if trying to claim too early */}
            {startTimestamp > 0 && !canClaim && (
              <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                <p className="text-sm font-semibold text-yellow-900 mb-1">
                  ⚠️ Cannot Claim Yet
                </p>
                <p className="text-xs text-yellow-800">
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
            <div className="space-y-4">
              {/* Check Wallet Balance Button - Always available */}
              <button
                onClick={checkWalletBalance}
                disabled={!userAddress || !tokenAddress || isCheckingBalance || !tokenMode}
                className={secondaryButtonClass + " w-full"}
              >
                {isCheckingBalance ? "⏳ Checking Balance..." : "💰 Check My Wallet Balance"}
              </button>

              {/* Vesting Actions - Only available after finding wallet */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={checkReleasable}
                  disabled={!vestingWalletAddress || !tokenAddress || isDecrypting || !tokenMode || !cliffHasPassed}
                  className={secondaryButtonClass + " w-full"}
                >
                  {isDecrypting ? "⏳ Decrypting..." : "🔓 Check Releasable Amount"}
                </button>

                <button
                  onClick={handleClaim}
                  disabled={!canClaim || releasableAmount === BigInt(0) || !tokenMode}
                  className={primaryButtonClass + " w-full"}
                >
                  {isProcessing ? "⏳ Processing..." : "🎉 Claim Tokens"}
                </button>
              </div>
            </div>
            {!tokenMode && (
              <p className="text-xs text-red-500 mt-2 text-center">
                ⚠️ Please select a token mode first
              </p>
            )}
            {!canClaim && tokenMode && startTimestamp > 0 && (
              <p className="text-xs text-yellow-600 mt-2 text-center">
                ℹ️ Claim button will be enabled once vesting starts and cliff period passes
              </p>
            )}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {message && (
        <div className="bg-white shadow-lg p-6">
          <h3 className="font-bold text-gray-900 text-xl mb-4">💬 Status</h3>
          <p className="text-gray-800">{message}</p>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
        <h3 className="font-bold text-blue-900 text-lg mb-3">📖 Instructions</h3>
        <ol className="list-decimal list-inside space-y-2 text-blue-800 text-sm">
          <li>Connect your wallet (must be the beneficiary address)</li>
          <li>Select a token mode (Testing or Production)</li>
          <li><strong>💰 (Optional) Click "Check My Wallet Balance"</strong> to see your current token balance</li>
          <li>Enter the EXACT vesting parameters from the creation transaction (get from admin or Etherscan logs)</li>
          <li>Click "Find My Vesting Wallet" to locate your wallet</li>
          <li>Click "Check Releasable Amount" to see how much you can claim from vesting</li>
          <li>Wait for the cliff period to pass (shown in countdown timer)</li>
          <li>Click "Claim Tokens" to release your vested tokens to your wallet!</li>
          <li>After claiming, check your wallet balance again to see the updated amount 🎉</li>
        </ol>
        <div className="mt-4 p-3 bg-blue-100 rounded border border-blue-300">
          <p className="text-xs text-blue-900 font-semibold">
            💡 Tip: The "Check My Wallet Balance" button shows your <strong>personal wallet balance</strong>, 
            while "Check Releasable Amount" shows tokens <strong>locked in the vesting contract</strong> that you can claim.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VestingBeneficiary;
