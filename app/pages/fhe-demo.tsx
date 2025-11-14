/**
 * FHE Demo Page
 * 
 * Demonstrates Fully Homomorphic Encryption with Zama FHEVM
 * 
 * ACCESS CONTROL: Only users who verified ZK proof can access this page
 */

import { FHECounterDemo } from "../components/FHECounterDemo";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAccount, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

export default function FHEDemoPage() {
  const router = useRouter();
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string>("");
  
  // Check if user is on correct network (Ethereum Sepolia)
  const isCorrectNetwork = chain?.id === sepolia.id;

  // Check if user has completed ZK verification
  useEffect(() => {
    const zkVerified = localStorage.getItem("zkVerified");
    const zkVerifiedAt = localStorage.getItem("zkVerifiedAt");
    const zkVerifiedAddress = localStorage.getItem("zkVerifiedAddress");

    if (zkVerified === "true" && zkVerifiedAt && zkVerifiedAddress) {
      setIsVerified(true);
      const date = new Date(parseInt(zkVerifiedAt));
      setVerifiedAt(date.toLocaleString());
    } else {
      setIsVerified(false);
    }
  }, []);

  // Redirect to home if not verified
  useEffect(() => {
    if (isVerified === false) {
      setTimeout(() => {
        router.push("/");
      }, 3000);
    }
  }, [isVerified, router]);

  // Loading state
  if (isVerified === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking verification status...</p>
        </div>
      </div>
    );
  }

  // Access denied
  if (isVerified === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-xl p-8 text-center">
          <div className="mb-4">
            <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 text-4xl">
              🚫
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-700 mb-6">
            You need to complete <strong>ZK Proof Verification</strong> before accessing the FHE demo.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900">
              <strong>Required Steps:</strong>
            </p>
            <ol className="text-sm text-blue-800 text-left mt-2 space-y-1">
              <li>1. Connect your wallet</li>
              <li>2. Generate ZK proof</li>
              <li>3. Application with verified proof</li>
              <li>4. Access granted! ✅</li>
            </ol>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Redirecting to home page in 3 seconds...
          </p>
          <Link href="/">
            <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
              Go to ZK Verification
            </button>
          </Link>
        </div>
      </div>
    );
  }

  // Access granted
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">
                  ← Back to ZK Proof
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">FHE Counter Demo</h1>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200">
                  ✅ ZK Verified
                </div>
                <ConnectButton />
              </div>
            </div>
          </div>
          {verifiedAt && (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
              <p className="text-xs text-gray-500">
                Verified at: {verifiedAt}
              </p>
            </div>
          )}
        </header>

        {/* Network Warning Banner */}
        {!isCorrectNetwork && chain && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Wrong Network Detected
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      You are currently connected to <strong>{chain?.name || "Unknown Network"}</strong> (Chain ID: {chain?.id}).
                    </p>
                    <p className="mt-1">
                      FHE features require <strong>Ethereum Sepolia</strong> (Chain ID: {sepolia.id}).
                    </p>
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => switchChain?.({ chainId: sepolia.id })}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                    >
                      Switch to Ethereum Sepolia
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Network Status Info */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-gray-500">Current Network:</span>
              <span className="font-medium text-gray-900">
                {chain?.name || "Not Connected"} 
                {chain?.id && ` (ID: ${chain.id})`}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {isCorrectNetwork ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  ✅ Correct Network
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  ⚠️ Wrong Network
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="py-8">
          <FHECounterDemo />
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="text-center text-gray-600 text-sm">
              <p className="mb-2">
                <strong>🔐 Fully Homomorphic Encryption</strong> powered by{" "}
                <a
                  href="https://docs.zama.ai/fhevm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Zama FHEVM
                </a>
              </p>
              <p className="text-xs text-gray-500">
                Network: Ethereum Sepolia | This demo performs encrypted computations on-chain
              </p>
            </div>
          </div>
        </footer>
      </div>
  );
}

