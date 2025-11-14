# Torresm FHE Vesting

A privacy-preserving token vesting platform using Fully Homomorphic Encryption (FHE) and Zero-Knowledge Proofs.

## Overview

This project implements a confidential token vesting system that enables private token distribution while maintaining transparency through cryptographic proofs. Built with Zama's FHE technology, it ensures that vesting amounts and balances remain encrypted on-chain, protecting sensitive financial information.

The system leverages a multi-chain architecture where FHE operations happen on Ethereum Sepolia, zero-knowledge proofs are verified efficiently on Arbitrum Stylus, and Chainlink CCIP enables secure cross-chain communication to complete the vesting workflow.

## Key Features

- **🔐 Fully Homomorphic Encryption (FHE)**: Token balances and vesting amounts remain encrypted on-chain using Zama's fhEVM
- **🎭 Privacy-Preserving**: Beneficiaries can claim tokens without revealing their balance publicly
- **⏰ Cliff & Linear Vesting**: Supports customizable vesting schedules with cliff periods
- **📊 Dual Token Modes**: Testing mode with MockVestingToken and production mode with ConfidentialVestingToken
- **🌐 Cross-Chain Architecture**: Uses Chainlink CCIP for cross-chain communication after proof verification
- **🔍 Zero-Knowledge Proofs**: Uses Circom circuits for token ownership verification on Arbitrum Stylus
- **🔗 CCIP Integration**: Automated cross-chain messaging when ZK proofs are successfully verified
- **💻 Modern Web Interface**: Next.js frontend with RainbowKit wallet integration

## Technology Stack

### Smart Contracts
- **Solidity**: FHE-enabled vesting contracts (ERC7984 standard)
- **Zama fhEVM**: Confidential computing on Ethereum
- **Hardhat**: Development and deployment framework
- **OpenZeppelin**: Secure contract libraries

### Frontend
- **Next.js**: React framework with TypeScript
- **Wagmi & Viem**: Ethereum interactions
- **RainbowKit**: Wallet connection
- **Ethers.js**: Blockchain communication

### Zero-Knowledge
- **Circom**: ZK circuit design
- **SnarkJS**: Proof generation and verification
- **Arbitrum Stylus**: On-chain proof verification (Rust/WASM)

### Cross-Chain
- **Chainlink CCIP**: Cross-Chain Interoperability Protocol for secure messaging
- **Multi-Chain Deployment**: Ethereum Sepolia (FHE) + Arbitrum (ZK verification)

## Cross-Chain Architecture

The project implements a cross-chain workflow:

1. **Token Operations on Ethereum Sepolia**: FHE-encrypted vesting operations occur on Ethereum using Zama's fhEVM
2. **ZK Proof Generation**: Users generate zero-knowledge proofs of token ownership using Circom circuits
3. **Proof Verification on Arbitrum**: Proofs are verified on-chain using Arbitrum Stylus (efficient Rust/WASM execution)
4. **CCIP Messaging**: Upon successful proof verification, Chainlink CCIP automatically sends a cross-chain message back to Ethereum
5. **Action Completion**: The CCIP message triggers the completion of the vesting operation on the source chain

This architecture combines:
- **Privacy** from FHE on Ethereum
- **Efficiency** from ZK verification on Arbitrum Stylus
- **Security** from Chainlink CCIP's decentralized cross-chain messaging

## Core Contracts

- **CustomVestingFactory**: Creates deterministic vesting wallets
- **ConfidentialVestingToken**: ERC7984 token with FHE operations
- **MockVestingToken**: Simplified testing token
- **VestingWallet**: Individual vesting contract with cliff support

## Use Cases

- **Private Fundraising**: Token sales with confidential allocation amounts
- **Team Vesting**: Employee token grants without public disclosure
- **Advisor Compensation**: Private vesting schedules for advisors
- **Confidential Airdrops**: Token distribution with encrypted amounts

## Security Features

- **FHE Encryption**: Encrypted balances using Zama's euint64 types
- **Deterministic Addresses**: Predictable wallet address generation via CREATE2
- **Cliff Period Enforcement**: Time-locked token release
- **Linear Vesting Calculation**: Fair token distribution over time
- **ERC7984 Compliance**: Confidential token standard implementation
- **ZK Proof Verification**: Token ownership proven without revealing amounts
- **CCIP Cross-Chain Security**: Chainlink's decentralized oracle network ensures secure cross-chain messaging
- **Stylus Efficiency**: Gas-optimized proof verification using Rust/WASM on Arbitrum
