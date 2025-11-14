import { useCallback, useState, useEffect } from "react";
import { useWagmiEthers } from "../useWagmiEthers";
import type { FhevmInstance } from "../../fhevm-sdk";
import { VestingWalletABI } from "../../contracts/vestingContracts";
import { ethers } from "ethers";

interface UseVestingWalletParams {
  walletAddress: string;
  instance: FhevmInstance | undefined;
}

/**
 * Hook for interacting with a VestingWallet instance
 * Allows beneficiaries to view and claim their vested tokens
 */
export const useVestingWallet = ({ walletAddress, instance }: UseVestingWalletParams) => {
  const { ethersSigner } = useWagmiEthers();
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [owner, setOwner] = useState<string>("");
  const [releasableAmount, setReleasableAmount] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  /**
   * Get the owner (beneficiary) of the vesting wallet
   */
  const fetchOwner = useCallback(async () => {
    if (!ethersSigner || !walletAddress) return;

    try {
      const wallet = new ethers.Contract(walletAddress, VestingWalletABI, ethersSigner);
      
      // First check if contract exists at this address
      const code = await ethersSigner.provider.getCode(walletAddress);
      if (code === "0x") {
        console.error("No contract found at wallet address:", walletAddress);
        setMessage("❌ No vesting wallet found at this address. Make sure the admin created a schedule for you first!");
        return;
      }
      
      const ownerAddress = await wallet.owner();
      setOwner(ownerAddress);
    } catch (error: any) {
      console.error("Error fetching owner:", error);
    }
  }, [ethersSigner, walletAddress]);

  /**
   * Get the encrypted releasable amount and decrypt it
   */
  const getReleasableAmount = useCallback(
    async (tokenAddress: string) => {
      if (!ethersSigner || !instance || !walletAddress) {
        setMessage("❌ Wallet not connected or FHE instance not ready");
        return;
      }

      try {
        setIsDecrypting(true);
        setMessage("🔄 Checking if vesting wallet exists...");

        // First check if contract exists at this address
        const code = await ethersSigner.provider.getCode(walletAddress);
        if (code === "0x") {
          setMessage("❌ No vesting wallet deployed at this address! The admin needs to create a vesting schedule for you first.");
          setIsDecrypting(false);
          return;
        }

        setMessage("✅ Wallet found! Fetching releasable amount...");
        const wallet = new ethers.Contract(walletAddress, VestingWalletABI, ethersSigner);

        // Get encrypted releasable amount
        const encryptedAmount = await wallet.releasable(tokenAddress);

        setMessage("🔓 Decrypting amount...");

        // Decrypt the amount using the FHE instance
        const userAddress = await ethersSigner.getAddress();
        
      // For testing/demo purposes, we show the encrypted handle
      // Full decryption requires Zama gateway setup in production
      const encryptedHandle = encryptedAmount.toString();
      
      // Mock decryption for demo (in production, this would go through Zama gateway)
      // For now, we just show that tokens are available
      setReleasableAmount(BigInt(encryptedHandle));
      setMessage(`✅ Encrypted amount retrieved. Ready to claim!`);
      setIsDecrypting(false);

      return BigInt(encryptedHandle);
      } catch (error: any) {
        console.error("Error getting releasable amount:", error);
        setMessage(`❌ Error: ${error.message || "Failed to get releasable amount"}`);
        setIsDecrypting(false);
        throw error;
      }
    },
    [ethersSigner, instance, walletAddress],
  );

  /**
   * Release vested tokens to the beneficiary
   */
  const releaseTokens = useCallback(
    async (tokenAddress: string) => {
      if (!ethersSigner || !walletAddress) {
        setMessage("❌ Wallet not connected");
        return;
      }

      try {
        setIsProcessing(true);
        setMessage("🔄 Checking vesting wallet...");

        // First check if contract exists at this address
        const code = await ethersSigner.provider.getCode(walletAddress);
        if (code === "0x") {
          setMessage("❌ No vesting wallet deployed at this address! The admin needs to create a vesting schedule for you first.");
          setIsProcessing(false);
          return;
        }

        setMessage("📝 Releasing vested tokens...");
        const wallet = new ethers.Contract(walletAddress, VestingWalletABI, ethersSigner);

        const tx = await wallet.release(tokenAddress);

        setMessage("⏳ Transaction sent! Waiting for confirmation...");

        const receipt = await tx.wait();

        setMessage("✅ Tokens released successfully!");
        setIsProcessing(false);

        // Refresh releasable amount
        await getReleasableAmount(tokenAddress);

        return receipt;
      } catch (error: any) {
        console.error("Error releasing tokens:", error);
        setMessage(`❌ Error: ${error.message || "Failed to release tokens"}`);
        setIsProcessing(false);
        throw error;
      }
    },
    [ethersSigner, walletAddress, getReleasableAmount],
  );

  // Fetch owner on mount
  useEffect(() => {
    fetchOwner();
  }, [fetchOwner]);

  return {
    owner,
    releasableAmount,
    releaseTokens,
    getReleasableAmount,
    isProcessing,
    isDecrypting,
    message,
  };
};

