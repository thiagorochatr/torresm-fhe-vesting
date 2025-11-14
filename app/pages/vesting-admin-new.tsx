import { useState, useMemo, useEffect } from "react";
import { useFhevm } from "../lib/fhevm-sdk/react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCustomVestingFactory, type VestingSchedule } from "../lib/hooks/vesting/useCustomVestingFactory";
import { ethers } from "ethers";
import { NextPage } from "next";
import Link from "next/link";

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

  const buttonClass =
    "inline-flex items-center justify-center px-6 py-3 font-semibold shadow-lg " +
    "transition-all duration-200 hover:scale-105 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
    "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed";

  const primaryButtonClass =
    buttonClass + " bg-[#FFD208] text-[#2D2D2D] hover:bg-[#A38025] focus-visible:ring-[#2D2D2D] cursor-pointer";

  const dangerButtonClass =
    buttonClass + " bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 cursor-pointer";

  const secondaryButtonClass =
    buttonClass + " bg-gray-600 text-white hover:bg-gray-700 focus-visible:ring-gray-500 cursor-pointer";

  const inputClass =
    "w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#FFD208] focus:border-transparent text-gray-900 bg-white";

  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto p-6 text-gray-900">
        <div className="flex items-center justify-center">
          <div className="bg-white shadow-xl p-8 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Wallet not connected</h2>
            <p className="text-gray-700 mb-6">Connect your wallet to access the admin panel.</p>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">🔐 Vesting Admin Panel</h1>
        <p className="text-gray-600">Create and fund encrypted vesting schedules</p>
        <Link href="/">
          <button className="mt-4 text-blue-600 hover:underline">← Back to Home</button>
        </Link>
      </div>

      {/* Configuration - Pre-configured */}
      <div className="bg-white shadow-lg p-6 mb-6">
        <h3 className="font-bold text-gray-900 text-xl mb-4">⚙️ Configuration</h3>
        <div className="space-y-4">
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
              
              {/* Token Balance Display */}
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
                {isLoadingBalance ? (
                  <p className="text-sm text-blue-700">⏳ Loading balance...</p>
                ) : tokenBalance ? (
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      💰 Your Balance: {tokenBalance} tokens
                    </p>
                    {parseFloat(tokenBalance) === 0 && (
                      <p className="text-xs text-red-600 mt-1">
                        ⚠️ No tokens! <a 
                          href={`https://sepolia.etherscan.io/address/${tokenAddress}#writeContract`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Mint tokens here
                        </a>
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
              
              {/* Approval Status & Button */}
              <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200 rounded">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-yellow-900">
                      🔐 Factory Approval Status
                    </p>
                    {isCheckingApproval ? (
                      <p className="text-xs text-yellow-700 mt-1">⏳ Checking approval status...</p>
                    ) : isApproved ? (
                      <p className="text-xs text-green-700 mt-1">✅ Approved - Factory can spend your tokens</p>
                    ) : (
                      <p className="text-xs text-yellow-700 mt-1">⚠️ Not approved - Click to approve first</p>
                    )}
                    <p className="text-xs text-yellow-600 mt-2">
                      💡 The factory needs approval to transfer tokens when creating vesting schedules.
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    {!isApproved && !isCheckingApproval && (
                      <button
                        onClick={handleApprove}
                        disabled={isApproving || parseFloat(tokenBalance) === 0}
                        className={primaryButtonClass + " whitespace-nowrap"}
                      >
                        {isApproving ? "⏳ Approving..." : "🔓 Approve Factory"}
                      </button>
                    )}
                    
                    <button
                      onClick={checkApproval}
                      disabled={isCheckingApproval}
                      className={secondaryButtonClass + " whitespace-nowrap"}
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
      <div className="bg-white shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-900 text-xl">📋 Vesting Schedules</h3>
          <button onClick={addSchedule} className={primaryButtonClass}>
            ➕ Add Schedule
          </button>
        </div>

        <div className="space-y-4">
          {schedules.map((schedule, index) => (
            <div key={index} className="border border-gray-300 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-800">Schedule #{index + 1}</h4>
                {schedules.length > 1 && (
                  <button onClick={() => removeSchedule(index)} className="text-red-600 hover:text-red-800">
                    🗑️ Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Beneficiary Address</label>
                  <input
                    type="text"
                    className={inputClass + " text-gray-900"}
                    placeholder="0x..."
                    value={schedule.beneficiary}
                    onChange={e => updateSchedule(index, "beneficiary", e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (tokens)</label>
                  <input
                    type="number"
                    className={inputClass + " text-gray-900"}
                    placeholder="1000"
                    value={schedule.amount.toString()}
                    onChange={e => updateSchedule(index, "amount", e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cliff (seconds)</label>
                  <input
                    type="number"
                    className={inputClass + " text-gray-900"}
                    placeholder="120"
                    value={schedule.cliffSeconds}
                    onChange={e => updateSchedule(index, "cliffSeconds", parseInt(e.target.value) || 0)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (seconds)</label>
                  <input
                    type="number"
                    className={inputClass + " text-gray-900"}
                    placeholder="300"
                    value={schedule.durationSeconds}
                    onChange={e => updateSchedule(index, "durationSeconds", parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <button
            onClick={handleSubmit}
            disabled={isProcessing || !tokenMode || !isApproved}
            className={primaryButtonClass + " w-full"}
          >
            {isProcessing ? "⏳ Processing..." : "🚀 Create & Fund Vesting Schedules"}
          </button>
          {!tokenMode && (
            <p className="text-xs text-red-500 mt-2 text-center">
              ⚠️ Please select a token mode first
            </p>
          )}
          {tokenMode && !isApproved && (
            <p className="text-xs text-red-500 mt-2 text-center">
              ⚠️ Please approve the factory first (see Configuration section above)
            </p>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {message && (
        <div className="bg-white shadow-lg p-6">
          <h3 className="font-bold text-gray-900 text-xl mb-4">💬 Status</h3>
          <p className="text-gray-800 mb-2">{message}</p>
          {txHash && (
            <>
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm font-semibold"
              >
                📄 View Transaction on Etherscan →
              </a>
              
              {message.includes("Successfully created") && (
                <div className="mt-4 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                  <p className="font-bold text-green-900 mb-2">✅ Vesting Wallets Created!</p>
                  <p className="text-sm text-green-800 mb-3">
                    Share these instructions with your beneficiaries:
                  </p>
                  <ol className="list-decimal list-inside text-xs text-green-900 space-y-2 bg-white p-3 rounded border border-green-200">
                    <li className="font-medium">
                      Go to the transaction on Etherscan: 
                      <a 
                        href={`https://sepolia.etherscan.io/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-blue-600 hover:underline break-all"
                      >
                        {txHash}
                      </a>
                    </li>
                    <li>Click the <strong>"Logs"</strong> tab</li>
                    <li>Find the <strong>"IndividualVestingCreated"</strong> event with their address</li>
                    <li>Copy these values:
                      <ul className="list-disc list-inside ml-4 mt-1">
                        <li><strong>beneficiary</strong> - Their wallet address</li>
                        <li><strong>startTimestamp</strong> - Unix timestamp</li>
                        <li><strong>durationSeconds</strong> - Vesting duration (e.g., 300)</li>
                        <li><strong>cliffSeconds</strong> - Cliff period (e.g., 120)</li>
                      </ul>
                    </li>
                    <li>Go to the Beneficiary Portal and enter these EXACT values to find their wallet</li>
                  </ol>
                  <p className="text-xs text-green-700 mt-3 font-medium">
                    💡 Check browser console for wallet addresses logged there too!
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
        <h3 className="font-bold text-blue-900 text-lg mb-3">📖 Instructions</h3>
        <ol className="list-decimal list-inside space-y-2 text-blue-800 text-sm">
          <li>Deploy the CustomVestingFactory contract and enter its address above</li>
          <li>Deploy an ERC7984 compatible token and enter its address</li>
          <li>Approve the factory to spend your tokens</li>
          <li>Add beneficiary addresses and amounts (will be encrypted!)</li>
          <li>Set cliff (2 min) and duration (5 min) for demo purposes</li>
          <li>Click "Create & Fund" to batch create vesting wallets</li>
          <li>Share wallet addresses with beneficiaries so they can claim</li>
        </ol>
      </div>
    </div>
  );
};

export default VestingAdmin;
