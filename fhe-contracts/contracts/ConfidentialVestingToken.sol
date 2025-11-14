// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title ConfidentialVestingToken
 * @notice ERC7984 confidential token for vesting use case
 * @dev Simplified version based on Zama's examples
 * 
 * Features:
 * - Encrypted balances (euint64)
 * - Confidential transfers
 * - Minting by owner (for initial allocation)
 * - Operator approvals (for VestingWallet to transfer)
 * 
 * Security:
 * - Inherits Zama's SepoliaConfig (FHE setup)
 * - All amounts are encrypted on-chain
 * - Only transfers reveal amounts (when decrypted)
 */
contract ConfidentialVestingToken is SepoliaConfig {
    // ========================================================================
    // STATE VARIABLES
    // ========================================================================
    
    /// @notice Token metadata
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    
    /// @notice Contract owner (can mint tokens)
    address public owner;
    
    /// @notice Total supply (encrypted)
    euint64 private _totalSupply;
    
    /// @notice Encrypted balances: user => euint64
    mapping(address => euint64) private _balances;
    
    /// @notice Operator approvals: owner => operator => bool
    /// @dev Allows operators (like VestingWallet) to transfer on behalf of user
    mapping(address => mapping(address => bool)) private _operators;
    
    // ========================================================================
    // EVENTS
    // ========================================================================
    
    /// @notice Emitted when tokens are transferred
    /// @dev Amount is encrypted, observers can't see how much
    event Transfer(address indexed from, address indexed to, euint64 amount);
    
    /// @notice Emitted when operator approval is set
    event OperatorSet(address indexed owner, address indexed operator, bool approved);
    
    /// @notice Emitted when tokens are minted
    event Minted(address indexed to, euint64 amount);
    
    // ========================================================================
    // ERRORS
    // ========================================================================
    
    error OnlyOwner();
    error ZeroAddress();
    error NotOperator();
    
    // ========================================================================
    // MODIFIERS
    // ========================================================================
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }
    
    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================
    
    /**
     * @notice Initialize the token
     * @param _name Token name
     * @param _symbol Token symbol
     */
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        
        // Initialize total supply as encrypted zero
        _totalSupply = FHE.asEuint64(0);
        FHE.allowThis(_totalSupply);
    }
    
    // ========================================================================
    // ERC7984 CORE FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Get encrypted balance of an account
     * @param account Address to query
     * @return Encrypted balance (euint64)
     * @dev Caller must have permission to view this encrypted value
     */
    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }
    
    /**
     * @notice Transfer tokens confidentially
     * @param to Recipient address
     * @param encryptedAmount Encrypted amount to transfer (external format)
     * @param inputProof Proof for encrypted input
     * @return actualAmount The actual encrypted amount transferred
     * @dev Amount remains encrypted throughout the transaction
     */
    function confidentialTransfer(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint64 actualAmount) {
        if (to == address(0)) revert ZeroAddress();
        
        // Convert external encrypted input to internal format
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        
        // Perform transfer
        return _transfer(msg.sender, to, amount);
    }
    
    /**
     * @notice Transfer tokens confidentially (for already-encrypted amounts)
     * @param to Recipient address
     * @param amount Encrypted amount (already in euint64 format)
     * @return actualAmount The actual encrypted amount transferred
     * @dev Used by VestingWallet to transfer pre-encrypted amounts
     */
    function confidentialTransfer(address to, euint64 amount) external returns (euint64 actualAmount) {
        if (to == address(0)) revert ZeroAddress();
        return _transfer(msg.sender, to, amount);
    }
    
    /**
     * @notice Transfer from another account (operator functionality)
     * @param from Source address
     * @param to Destination address
     * @param amount Encrypted amount to transfer
     * @return actualAmount The actual encrypted amount transferred
     * @dev Caller must be approved operator for 'from' address
     */
    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external returns (euint64 actualAmount) {
        if (to == address(0)) revert ZeroAddress();
        if (!_operators[from][msg.sender]) revert NotOperator();
        
        return _transfer(from, to, amount);
    }
    
    // ========================================================================
    // OPERATOR MANAGEMENT
    // ========================================================================
    
    /**
     * @notice Set operator approval
     * @param operator Address to approve/revoke
     * @param approved True to approve, false to revoke
     * @dev Allows VestingWallet to transfer on user's behalf
     */
    function setOperator(address operator, bool approved) external {
        _operators[msg.sender][operator] = approved;
        emit OperatorSet(msg.sender, operator, approved);
    }
    
    /**
     * @notice Check if an address is an operator for another
     * @param account Token owner
     * @param operator Potential operator
     * @return True if operator is approved
     */
    function isOperator(address account, address operator) external view returns (bool) {
        return _operators[account][operator];
    }
    
    // ========================================================================
    // MINTING (OWNER ONLY)
    // ========================================================================
    
    /**
     * @notice Mint tokens to an address
     * @param to Recipient address
     * @param encryptedAmount Encrypted amount to mint
     * @param inputProof Proof for encrypted input
     * @dev Only owner can mint. Used for initial token allocation.
     */
    function mint(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        
        // Convert external encrypted input
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        
        // Add to recipient's balance
        _balances[to] = FHE.add(_balances[to], amount);
        
        // Add to total supply
        _totalSupply = FHE.add(_totalSupply, amount);
        
        // Set permissions
        FHE.allowThis(_balances[to]);
        FHE.allow(_balances[to], to);
        FHE.allowThis(_totalSupply);
        
        emit Minted(to, amount);
        emit Transfer(address(0), to, amount);
    }
    
    // ========================================================================
    // INTERNAL FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Internal transfer logic
     * @param from Source address
     * @param to Destination address
     * @param amount Encrypted amount to transfer
     * @return actualAmount The actual encrypted amount transferred (after balance check)
     */
    function _transfer(
        address from,
        address to,
        euint64 amount
    ) internal returns (euint64 actualAmount) {
        // Check if sender has enough balance (in FHE)
        // If balance < amount, transfer actual balance (prevents revert)
        euint64 senderBalance = _balances[from];
        
        // Compute actual transfer amount: min(amount, senderBalance)
        // This prevents underflow while keeping everything encrypted
        actualAmount = FHE.min(amount, senderBalance);
        
        // Update balances
        _balances[from] = FHE.sub(senderBalance, actualAmount);
        _balances[to] = FHE.add(_balances[to], actualAmount);
        
        // Set permissions for the contract and involved parties
        FHE.allowThis(_balances[from]);
        FHE.allow(_balances[from], from);
        FHE.allowThis(_balances[to]);
        FHE.allow(_balances[to], to);
        
        // Allow caller to see the transferred amount (for confirmation)
        FHE.allow(actualAmount, msg.sender);
        
        emit Transfer(from, to, actualAmount);
        
        return actualAmount;
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Get encrypted total supply
     * @return Encrypted total supply
     */
    function totalSupply() external view returns (euint64) {
        return _totalSupply;
    }
}

