/**
 * FHE Counter Demo Component
 * 
 * Demonstrates Fully Homomorphic Encryption with a simple counter
 */

"use client";

import { useMemo } from "react";
import { useFhevm } from "../lib/fhevm";
import { useAccount } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useFHECounterWagmi } from "../lib/hooks";

export const FHECounterDemo = () => {
  const { isConnected, chain } = useAccount();

  const chainId = chain?.id;
  
  // Check if user is on correct network (Ethereum Sepolia)
  const isCorrectNetwork = chain?.id === sepolia.id;

  //////////////////////////////////////////////////////////////////////////////
  // FHEVM instance
  //////////////////////////////////////////////////////////////////////////////

  // Create EIP-1193 provider from wagmi for FHEVM
  const provider = useMemo(() => {
    if (typeof window === "undefined") return undefined;

    // Get the wallet provider from window.ethereum
    return (window as any).ethereum;
  }, []);

  const initialMockChains = { 31337: "http://localhost:8545" };

  const {
    instance: fhevmInstance,
    status: fhevmStatus,
    error: fhevmError,
  } = useFhevm({
    provider,
    chainId,
    initialMockChains,
    enabled: true, // use enabled to dynamically create the instance on-demand
  });

  //////////////////////////////////////////////////////////////////////////////
  // useFHECounter is a custom hook containing all the FHECounter logic
  //////////////////////////////////////////////////////////////////////////////

  const fheCounter = useFHECounterWagmi({
    instance: fhevmInstance,
    initialMockChains,
  });

  //////////////////////////////////////////////////////////////////////////////
  // UI Components
  //////////////////////////////////////////////////////////////////////////////

  const buttonClass =
    "inline-flex items-center justify-center px-6 py-3 font-semibold shadow-lg " +
    "transition-all duration-200 hover:scale-105 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 " +
    "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed rounded-lg";

  // Primary (accent) button
  const primaryButtonClass =
    buttonClass +
    " bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500 cursor-pointer";

  // Secondary button
  const secondaryButtonClass =
    buttonClass +
    " bg-gray-800 text-white hover:bg-gray-700 focus-visible:ring-blue-500 cursor-pointer";

  // Success/confirmed state
  const successButtonClass =
    buttonClass +
    " bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500";

  const titleClass = "font-bold text-gray-900 text-xl mb-4 border-b border-gray-300 pb-2";
  const sectionClass = "bg-white shadow-lg rounded-lg p-6 mb-6 border border-gray-200";

  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center">
          <div className={sectionClass + " text-center"}>
            <div className="mb-4">
              <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-yellow-100 text-yellow-600 text-3xl">
                ⚠️
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Wallet not connected</h2>
            <p className="text-gray-700 mb-6">Connect your wallet to use the FHE Counter demo.</p>
            <p className="text-sm text-gray-500">This demo uses Ethereum Sepolia network.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2 text-gray-900">🔐 FHE Counter Demo</h1>
        <p className="text-gray-600">Interact with Fully Homomorphic Encryption on Ethereum Sepolia</p>
      </div>

      {/* Count Handle Display */}
      <div className={sectionClass}>
        <h3 className={titleClass}>🔢 Encrypted Counter</h3>
        <div className="space-y-3">
          {printProperty("Encrypted Handle", fheCounter.handle || "No handle available")}
          {printProperty("Decrypted Value", fheCounter.isDecrypted ? fheCounter.clear?.toString() : "Not decrypted yet")}
        </div>
      </div>

      {/* Network Warning in Component */}
      {!isCorrectNetwork && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-center">
            <span className="text-red-600 text-2xl mr-3">⚠️</span>
            <div>
              <h4 className="text-red-800 font-semibold">Wrong Network</h4>
              <p className="text-red-700 text-sm">
                Please switch to <strong>Ethereum Sepolia</strong> to interact with FHE features.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          className={fheCounter.isDecrypted ? successButtonClass : primaryButtonClass}
          disabled={!fheCounter.canDecrypt || !isCorrectNetwork}
          onClick={fheCounter.decryptCountHandle}
          title={!isCorrectNetwork ? "Switch to Ethereum Sepolia to decrypt" : undefined}
        >
          {!isCorrectNetwork
            ? "⚠️ Wrong Network"
            : fheCounter.canDecrypt
              ? "🔓 Decrypt Counter"
              : fheCounter.isDecrypted
                ? `✅ Decrypted: ${fheCounter.clear}`
                : fheCounter.isDecrypting
                  ? "⏳ Decrypting..."
                  : "❌ Nothing to decrypt"}
        </button>

        <button
          className={secondaryButtonClass}
          disabled={!fheCounter.canUpdateCounter || !isCorrectNetwork}
          onClick={() => fheCounter.updateCounter(+1)}
          title={!isCorrectNetwork ? "Switch to Ethereum Sepolia to increment" : undefined}
        >
          {!isCorrectNetwork
            ? "⚠️ Wrong Network"
            : fheCounter.canUpdateCounter
              ? "➕ Increment +1"
              : fheCounter.isProcessing
                ? "⏳ Processing..."
                : "❌ Cannot increment"}
        </button>

        <button
          className={secondaryButtonClass}
          disabled={!fheCounter.canUpdateCounter || !isCorrectNetwork}
          onClick={() => fheCounter.updateCounter(-1)}
          title={!isCorrectNetwork ? "Switch to Ethereum Sepolia to decrement" : undefined}
        >
          {!isCorrectNetwork
            ? "⚠️ Wrong Network"
            : fheCounter.canUpdateCounter
              ? "➖ Decrement -1"
              : fheCounter.isProcessing
                ? "⏳ Processing..."
                : "❌ Cannot decrement"}
        </button>
      </div>

      {/* Messages */}
      {fheCounter.message && (
        <div className={sectionClass}>
          <h3 className={titleClass}>💬 Status Messages</h3>
          <div className="border bg-gray-50 border-gray-200 p-4 rounded">
            <p className="text-gray-800 font-mono text-sm">{fheCounter.message}</p>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={sectionClass}>
          <h3 className={titleClass}>🔧 FHEVM Instance</h3>
          <div className="space-y-3">
            {printProperty("Instance Status", fhevmInstance ? "✅ Connected" : "❌ Disconnected")}
            {printProperty("Status", fhevmStatus)}
            {printProperty("Error", fhevmError ? fhevmError.message : "No errors")}
          </div>
        </div>

        <div className={sectionClass}>
          <h3 className={titleClass}>📊 Counter Status</h3>
          <div className="space-y-3">
            {printBooleanProperty("Refreshing", fheCounter.isRefreshing)}
            {printBooleanProperty("Decrypting", fheCounter.isDecrypting)}
            {printBooleanProperty("Processing", fheCounter.isProcessing)}
            {printBooleanProperty("Can Decrypt", fheCounter.canDecrypt)}
            {printBooleanProperty("Can Modify", fheCounter.canUpdateCounter)}
          </div>
        </div>
      </div>
    </div>
  );
};

function printProperty(name: string, value: unknown) {
  let displayValue: string;

  if (typeof value === "boolean") {
    return printBooleanProperty(name, value);
  } else if (typeof value === "string" || typeof value === "number") {
    displayValue = String(value);
  } else if (typeof value === "bigint") {
    displayValue = String(value);
  } else if (value === null) {
    displayValue = "null";
  } else if (value === undefined) {
    displayValue = "undefined";
  } else if (value instanceof Error) {
    displayValue = value.message;
  } else {
    displayValue = JSON.stringify(value);
  }
  
  return (
    <div className="flex justify-between items-center py-3 px-4 bg-gray-50 border border-gray-200 rounded w-full">
      <span className="text-gray-700 font-medium">{name}</span>
      <span className="ml-2 font-mono text-sm font-semibold text-gray-900 bg-white px-3 py-1 border border-gray-300 rounded">
        {displayValue.length > 50 ? displayValue.substring(0, 50) + "..." : displayValue}
      </span>
    </div>
  );
}

function printBooleanProperty(name: string, value: boolean) {
  return (
    <div className="flex justify-between items-center py-3 px-4 bg-gray-50 border border-gray-200 rounded w-full">
      <span className="text-gray-700 font-medium">{name}</span>
      <span
        className={`font-mono text-sm font-semibold px-3 py-1 border rounded ${
          value
            ? "text-green-800 bg-green-100 border-green-300"
            : "text-red-800 bg-red-100 border-red-300"
        }`}
      >
        {value ? "✓ true" : "✗ false"}
      </span>
    </div>
  );
}

