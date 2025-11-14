/**
 * FHECounter Contract Configuration
 * 
 * Deployed on Ethereum Sepolia for FHE operations
 */

export const FHECounterABI = [
  {
    inputs: [
      {
        internalType: "externalEuint32",
        name: "inputEuint32",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "inputProof",
        type: "bytes",
      },
    ],
    name: "decrement",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getCount",
    outputs: [
      {
        internalType: "euint32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "externalEuint32",
        name: "inputEuint32",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "inputProof",
        type: "bytes",
      },
    ],
    name: "increment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "protocolId",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
] as const;

export const FHECounterContract = {
  address: "0xa47B83b93EBEa1D705fddb18F59cDdeF22705733" as `0x${string}`,
  abi: FHECounterABI,
  chainId: 11155111, // Ethereum Sepolia
} as const;

