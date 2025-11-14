// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title MockVestingToken
 * @notice Properly implemented mock token for testing vesting functionality
 * @dev This token implements proper FHE balance transfers with correct arithmetic
 * 
 * Key features:
 * - Proper balance deduction and addition using FHE operations
 * - ERC7984-compatible interface
 * - Simplified minting for testing
 * - Correct operator permissions
 */
contract MockVestingToken is SepoliaConfig {
    string public name = "Mock Vesting Token";
    string public symbol = "MVT";
    uint8 public constant decimals = 18;    
    
    address public owner;
    
    // Encrypted balances (the source of truth for transfers)
    mapping(address => euint64) private _encryptedBalances;
    
    // Clear balances for easy minting and testing
    mapping(address => uint256) private _clearBalances;
    uint256 private _clearTotalSupply;
    
    // Operator approvals
    mapping(address => mapping(address => bool)) private _operators;
    
    // Standard ERC20 allowances
    mapping(address => mapping(address => uint256)) private _allowances;
    
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event OperatorSet(address indexed owner, address indexed operator, bool approved);
    event Minted(address indexed to, uint256 amount);
    
    error ZeroAddress();
    error NotOperator();
    error InsufficientBalance();
    error InsufficientAllowance();
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @notice Mint tokens with proper encrypted balance initialization
     * @param to Recipient address
     * @param amount Amount in wei
     */
    function mint(address to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        
        // Update clear balances for tracking
        _clearBalances[to] += amount;
        _clearTotalSupply += amount;
        
        // Create/update encrypted balance
        euint64 currentEncrypted = _encryptedBalances[to];
        euint64 amountEncrypted = FHE.asEuint64(uint64(amount));
        
        if (euint64.unwrap(currentEncrypted) == 0) {
            _encryptedBalances[to] = amountEncrypted;
        } else {
            _encryptedBalances[to] = FHE.add(currentEncrypted, amountEncrypted);
        }
        
        // Grant permissions
        FHE.allow(_encryptedBalances[to], to);
        FHE.allowThis(_encryptedBalances[to]);
        
        emit Minted(to, amount);
        emit Transfer(address(0), to, amount);
    }
    
    /**
     * @notice Get clear balance (for easy testing/verification)
     */
    function balanceOf(address account) external view returns (uint256) {
        return _clearBalances[account];
    }
    
    /**
     * @notice Get encrypted balance (required for ERC7984)
     */
    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _encryptedBalances[account];
    }
    
    /**
     * @notice Standard ERC20 transfer (for wallet compatibility)
     * @dev Transfers clear balance AND updates encrypted balance
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (_clearBalances[msg.sender] < amount) revert InsufficientBalance();
        
        // Update clear balances
        _clearBalances[msg.sender] -= amount;
        _clearBalances[to] += amount;
        
        // Also update encrypted balances
        euint64 senderBalance = _encryptedBalances[msg.sender];
        euint64 toBalance = _encryptedBalances[to];
        euint64 amountEncrypted = FHE.asEuint64(uint64(amount));
        
        if (euint64.unwrap(toBalance) == 0) {
            toBalance = FHE.asEuint64(0);
        }
        
        _encryptedBalances[msg.sender] = FHE.sub(senderBalance, amountEncrypted);
        _encryptedBalances[to] = FHE.add(toBalance, amountEncrypted);
        
        // Grant permissions
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);
        FHE.allow(_encryptedBalances[to], to);
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allowThis(_encryptedBalances[to]);
        
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    /**
     * @notice Standard ERC20 approve
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    /**
     * @notice Standard ERC20 allowance
     */
    function allowance(address _owner, address spender) external view returns (uint256) {
        return _allowances[_owner][spender];
    }
    
    /**
     * @notice Standard ERC20 transferFrom
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (_clearBalances[from] < amount) revert InsufficientBalance();
        
        // Check and update allowance
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < amount) revert InsufficientAllowance();
            _allowances[from][msg.sender] = currentAllowance - amount;
        }
        
        // Update clear balances
        _clearBalances[from] -= amount;
        _clearBalances[to] += amount;
        
        // Also update encrypted balances
        euint64 fromBalance = _encryptedBalances[from];
        euint64 toBalance = _encryptedBalances[to];
        euint64 amountEncrypted = FHE.asEuint64(uint64(amount));
        
        if (euint64.unwrap(toBalance) == 0) {
            toBalance = FHE.asEuint64(0);
        }
        
        _encryptedBalances[from] = FHE.sub(fromBalance, amountEncrypted);
        _encryptedBalances[to] = FHE.add(toBalance, amountEncrypted);
        
        // Grant permissions
        FHE.allow(_encryptedBalances[from], from);
        FHE.allow(_encryptedBalances[to], to);
        FHE.allowThis(_encryptedBalances[from]);
        FHE.allowThis(_encryptedBalances[to]);
        
        emit Transfer(from, to, amount);
        return true;
    }
    
    /**
     * @notice Transfer tokens from one address to another (with operator check)
     * @dev PROPERLY deducts from sender and adds to recipient
     */
    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external returns (euint64) {
        if (!_operators[from][msg.sender]) revert NotOperator();
        if (to == address(0)) revert ZeroAddress();
        
        // Get current encrypted balances
        euint64 fromBalance = _encryptedBalances[from];
        euint64 toBalance = _encryptedBalances[to];
        
        // Handle case where recipient has no balance yet
        if (euint64.unwrap(toBalance) == 0) {
            toBalance = FHE.asEuint64(0);
        }
        
        // Perform transfer: deduct from sender, add to recipient
        _encryptedBalances[from] = FHE.sub(fromBalance, amount);
        _encryptedBalances[to] = FHE.add(toBalance, amount);
        
        // Grant permissions
        FHE.allow(_encryptedBalances[from], from);
        FHE.allow(_encryptedBalances[to], to);
        FHE.allowThis(_encryptedBalances[from]);
        FHE.allowThis(_encryptedBalances[to]);
        
        // Also allow the caller (vesting wallet factory) to access
        FHE.allow(amount, msg.sender);
        
        return amount;
    }
    
    /**
     * @notice Transfer tokens (called by vesting wallet during release)
     * @dev PROPERLY deducts from sender and adds to recipient
     * 
     * NOTE: This transfers encrypted amounts, so the Transfer event shows 0
     * as a placeholder since the actual amount is encrypted (FHE privacy).
     * Use confidentialBalanceOf() and FHE SDK to see actual balances.
     */
    function confidentialTransfer(address to, euint64 amount) external returns (euint64) {
        if (to == address(0)) revert ZeroAddress();
        
        // Get current encrypted balances
        euint64 senderBalance = _encryptedBalances[msg.sender];
        euint64 toBalance = _encryptedBalances[to];
        
        // Handle case where recipient has no balance yet
        if (euint64.unwrap(toBalance) == 0) {
            toBalance = FHE.asEuint64(0);
        }
        
        // Perform transfer: deduct from sender, add to recipient
        _encryptedBalances[msg.sender] = FHE.sub(senderBalance, amount);
        _encryptedBalances[to] = FHE.add(toBalance, amount);
        
        // Grant permissions
        FHE.allow(_encryptedBalances[msg.sender], msg.sender);
        FHE.allow(_encryptedBalances[to], to);
        FHE.allowThis(_encryptedBalances[msg.sender]);
        FHE.allowThis(_encryptedBalances[to]);
        
        // ✅ Emit Transfer event so Etherscan shows the transfer happened
        // Amount is 0 because actual amount is encrypted (FHE privacy)
        emit Transfer(msg.sender, to, 0);
        
        return amount;
    }
    
    /**
     * @notice Set operator approval (required for factory to transfer on behalf of user)
     */
    function setOperator(address operator, bool approved) external {
        _operators[msg.sender][operator] = approved;
        emit OperatorSet(msg.sender, operator, approved);
    }
    
    /**
     * @notice Check if an address is an operator for another address
     */
    function isOperator(address account, address operator) external view returns (bool) {
        return _operators[account][operator];
    }
    
    /**
     * @notice Get total supply
     */
    function totalSupply() external view returns (uint256) {
        return _clearTotalSupply;
    }
}