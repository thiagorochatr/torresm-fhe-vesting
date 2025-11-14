// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VestingController
 * @notice Manages vesting metadata on Arbitrum Sepolia (orchestration layer)
 * @dev FASE 1: Simple version with localStorage communication (no CCIP yet)
 * 
 * Responsibilities:
 * - Store public vesting metadata (beneficiary, start, duration, cliff)
 * - Store commitment (hash of encrypted amount) - prevents revealing value
 * - Validate ZK proofs (ensures vesting parameters are valid)
 * - Track vesting state (active/inactive)
 * - Allow beneficiaries to request releases
 * 
 * Privacy Model:
 * - All metadata is PUBLIC (visible on-chain)
 * - Only the AMOUNT remains private (commitment only)
 * - ZK proof validates: amount > 0, cliff <= duration, beneficiary != 0
 */
contract VestingController {
    // ========================================================================
    // STATE VARIABLES
    // ========================================================================
    
    /// @notice Contract owner (admin who can create vestings)
    address public owner;
    
    /// @notice Counter for vesting IDs
    uint256 public nextVestingId;
    
    /// @notice Vesting metadata structure
    struct VestingData {
        address beneficiary;        // Who receives the tokens
        uint64 startTimestamp;      // When vesting starts
        uint64 duration;            // Total vesting duration in seconds
        uint64 cliff;               // Cliff period in seconds (tokens locked)
        bytes32 amountCommitment;   // Hash of encrypted amount (privacy!)
        bool active;                // Is vesting active?
        bool initialized;           // Does this vesting exist?
    }
    
    /// @notice Mapping: vestingId => vesting data
    mapping(uint256 => VestingData) public vestings;
    
    // ========================================================================
    // EVENTS
    // ========================================================================
    
    /// @notice Emitted when a new vesting is created
    event VestingCreated(
        uint256 indexed vestingId,
        address indexed beneficiary,
        uint64 startTimestamp,
        uint64 duration,
        uint64 cliff,
        bytes32 amountCommitment
    );
    
    /// @notice Emitted when beneficiary requests token release
    event ReleaseRequested(
        uint256 indexed vestingId,
        address indexed beneficiary,
        uint256 timestamp
    );
    
    /// @notice Emitted when vesting is cancelled by owner
    event VestingCancelled(uint256 indexed vestingId);
    
    // ========================================================================
    // ERRORS
    // ========================================================================
    
    error OnlyOwner();
    error OnlyBeneficiary();
    error InvalidParameters();
    error VestingNotFound();
    error VestingNotActive();
    error CliffNotPassed();
    error ZeroAddress();
    
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
    
    constructor() {
        owner = msg.sender;
        nextVestingId = 1; // Start from 1 (0 = invalid)
    }
    
    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Create a new vesting schedule
     * @param beneficiary Address that will receive vested tokens
     * @param startTimestamp When vesting begins (Unix timestamp)
     * @param duration Total vesting period in seconds
     * @param cliff Cliff period in seconds (must be <= duration)
     * @param amountCommitment Hash of the encrypted amount (keccak256)
     * @param zkProof ZK proof that validates the vesting parameters
     * @return vestingId The ID of the created vesting
     * 
     * @dev FASE 1: ZK proof validation is SIMPLIFIED
     * @dev In FASE 3, we'll implement proper circuit validation
     * @dev For now, we just check basic parameters
     */
    function createVesting(
        address beneficiary,
        uint64 startTimestamp,
        uint64 duration,
        uint64 cliff,
        bytes32 amountCommitment,
        bytes calldata zkProof // FASE 1: Not validated yet
    ) external onlyOwner returns (uint256 vestingId) {
        // Basic validations
        if (beneficiary == address(0)) revert ZeroAddress();
        if (duration == 0) revert InvalidParameters();
        if (cliff > duration) revert InvalidParameters();
        if (startTimestamp < block.timestamp) revert InvalidParameters();
        if (amountCommitment == bytes32(0)) revert InvalidParameters();
        
        // FASE 1: Skip ZK proof validation for now
        // FASE 3: Will validate via Stylus contract
        // For now, just check proof is not empty
        if (zkProof.length == 0) {
            // Allow empty proof in FASE 1 for testing
            // In production, this would revert
        }
        
        // Generate vesting ID
        vestingId = nextVestingId++;
        
        // Store vesting data
        vestings[vestingId] = VestingData({
            beneficiary: beneficiary,
            startTimestamp: startTimestamp,
            duration: duration,
            cliff: cliff,
            amountCommitment: amountCommitment,
            active: true,
            initialized: true
        });
        
        // Emit event (frontend will use this to pass data to Ethereum via localStorage)
        emit VestingCreated(
            vestingId,
            beneficiary,
            startTimestamp,
            duration,
            cliff,
            amountCommitment
        );
    }
    
    /**
     * @notice Cancel an active vesting
     * @param vestingId ID of the vesting to cancel
     * @dev Only owner can cancel. In production, add more sophisticated logic.
     */
    function cancelVesting(uint256 vestingId) external onlyOwner {
        VestingData storage vesting = vestings[vestingId];
        
        if (!vesting.initialized) revert VestingNotFound();
        if (!vesting.active) revert VestingNotActive();
        
        vesting.active = false;
        
        emit VestingCancelled(vestingId);
    }
    
    // ========================================================================
    // BENEFICIARY FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Request token release from vesting
     * @param vestingId ID of the vesting
     * @dev Beneficiary calls this to trigger release on Ethereum side
     * @dev FASE 1: Frontend will detect event and call Ethereum contract via localStorage
     * @dev FASE 2: Will send CCIP message automatically
     */
    function requestRelease(uint256 vestingId) external {
        VestingData storage vesting = vestings[vestingId];
        
        // Validations
        if (!vesting.initialized) revert VestingNotFound();
        if (!vesting.active) revert VestingNotActive();
        if (msg.sender != vesting.beneficiary) revert OnlyBeneficiary();
        
        // Check if cliff period has passed
        if (block.timestamp < vesting.startTimestamp + vesting.cliff) {
            revert CliffNotPassed();
        }
        
        // Emit event (frontend will listen and trigger Ethereum release)
        emit ReleaseRequested(vestingId, msg.sender, block.timestamp);
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Get vesting data
     * @param vestingId ID of the vesting
     * @return Vesting data struct
     */
    function getVesting(uint256 vestingId) external view returns (VestingData memory) {
        if (!vestings[vestingId].initialized) revert VestingNotFound();
        return vestings[vestingId];
    }
    
    /**
     * @notice Check if cliff has passed for a vesting
     * @param vestingId ID of the vesting
     * @return True if cliff period has passed
     */
    function isCliffPassed(uint256 vestingId) external view returns (bool) {
        VestingData storage vesting = vestings[vestingId];
        if (!vesting.initialized) revert VestingNotFound();
        return block.timestamp >= vesting.startTimestamp + vesting.cliff;
    }
    
    /**
     * @notice Check if vesting has ended
     * @param vestingId ID of the vesting
     * @return True if vesting period has ended
     */
    function isVestingEnded(uint256 vestingId) external view returns (bool) {
        VestingData storage vesting = vestings[vestingId];
        if (!vesting.initialized) revert VestingNotFound();
        return block.timestamp >= vesting.startTimestamp + vesting.duration;
    }
    
    /**
     * @notice Calculate vesting progress percentage (0-100)
     * @param vestingId ID of the vesting
     * @return Percentage of vesting completed (scaled by 100)
     */
    function getVestingProgress(uint256 vestingId) external view returns (uint256) {
        VestingData storage vesting = vestings[vestingId];
        if (!vesting.initialized) revert VestingNotFound();
        
        if (block.timestamp < vesting.startTimestamp) {
            return 0; // Not started
        }
        
        if (block.timestamp >= vesting.startTimestamp + vesting.duration) {
            return 100; // Fully vested
        }
        
        uint256 elapsed = block.timestamp - vesting.startTimestamp;
        return (elapsed * 100) / vesting.duration;
    }
}

