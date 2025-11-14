/**
 * Vesting Contracts Configuration
 * ABIs and addresses for CustomVestingFactory and related contracts
 */

export const CustomVestingFactoryABI = [
  {
    inputs: [],
    name: "FailedDeployment",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "balance", type: "uint256" },
      { internalType: "uint256", name: "needed", type: "uint256" },
    ],
    name: "InsufficientBalance",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "uint256", name: "totalRecipients", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "BatchVestingCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "beneficiary", type: "address" },
      { indexed: true, internalType: "address", name: "vestingWallet", type: "address" },
      { indexed: false, internalType: "uint48", name: "startTimestamp", type: "uint48" },
      { indexed: false, internalType: "uint48", name: "durationSeconds", type: "uint48" },
      { indexed: false, internalType: "uint48", name: "cliffSeconds", type: "uint48" },
    ],
    name: "IndividualVestingCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "vestingWalletConfidential", type: "address" },
      { indexed: false, internalType: "bytes", name: "initArgs", type: "bytes" },
    ],
    name: "VestingWalletConfidentialCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "vestingWalletConfidential", type: "address" },
      { indexed: true, internalType: "address", name: "token", type: "address" },
      { indexed: false, internalType: "euint64", name: "transferredAmount", type: "bytes32" },
      { indexed: false, internalType: "bytes", name: "initArgs", type: "bytes" },
    ],
    name: "VestingWalletConfidentialFunded",
    type: "event",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      {
        components: [
          { internalType: "address", name: "beneficiary", type: "address" },
          { internalType: "externalEuint64", name: "encryptedAmount", type: "bytes32" },
          { internalType: "uint48", name: "startTimestamp", type: "uint48" },
          { internalType: "uint48", name: "durationSeconds", type: "uint48" },
          { internalType: "uint48", name: "cliffSeconds", type: "uint48" },
        ],
        internalType: "struct CustomVestingFactory.VestingSchedule[]",
        name: "schedules",
        type: "tuple[]",
      },
      { internalType: "bytes", name: "inputProof", type: "bytes" },
    ],
    name: "batchCreateAndFundVesting",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes", name: "initArgs", type: "bytes" }],
    name: "createVestingWalletConfidential",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "beneficiary", type: "address" },
      { internalType: "uint48", name: "startTimestamp", type: "uint48" },
      { internalType: "uint48", name: "durationSeconds", type: "uint48" },
      { internalType: "uint48", name: "cliffSeconds", type: "uint48" },
    ],
    name: "getVestingWalletAddress",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes", name: "initArgs", type: "bytes" }],
    name: "predictVestingWalletConfidential",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "vestingImplementation",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const VestingWalletABI = [
  {
    inputs: [{ internalType: "address", name: "token", type: "address" }],
    name: "release",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "token", type: "address" }],
    name: "releasable",
    outputs: [{ internalType: "euint128", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint64", name: "timestamp", type: "uint64" },
    ],
    name: "vestedAmount",
    outputs: [{ internalType: "euint128", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "start",
    outputs: [{ internalType: "euint64", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "duration",
    outputs: [{ internalType: "euint64", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "end",
    outputs: [{ internalType: "euint64", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const VestingContracts = {
  factory: {
    address: "0x52be5B1113098A3D198b5AAaC0caad0aB1D87703", // Fixed: FHE coprocessor setup
    abi: CustomVestingFactoryABI,
    chainId: 11155111, // Sepolia
  },
  vestingWallet: {
    abi: VestingWalletABI,
    chainId: 11155111, // Sepolia
  },
} as const;

// Additional deployed contracts for reference
export const DeployedContracts = {
  confidentialVestingToken: "0x01D32cDfAa2787c9729956bDaF8D378ebDC9aa12",
  simpleMockToken: "0x68A9c737bf73D5442a69946816E405dFA4C06e33", // ✅ VERIFIED - Use this for testing!
  vestingWallet: "0x5e33Fe04dD924d367aCDa6cF511A43202CA1915a",
  fheCounter: "0xFfd9Ae4D0093134A56D0382eDe8380b905ef25Bc",
} as const;

