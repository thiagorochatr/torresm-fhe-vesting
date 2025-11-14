// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Interface for confidential token transfers
interface IConfidentialVestingToken {
    function confidentialTransfer(address to, euint64 amount) external returns (euint64);
    function confidentialBalanceOf(address account) external view returns (euint64);
    function setOperator(address operator, bool approved) external;
}

/**
 * @title VestingWallet
 * @notice Confidential vesting wallet with FHE calculations on Ethereum Sepolia
 * @dev Based on OpenZeppelin's VestingWalletConfidential pattern
 * 
 * Key Features:
 * - Stores ENCRYPTED total amount (totalAmount as euint128)
 * - Calculates vested/releasable amounts in FHE (never decrypt!)
 * - Only decrypts at transfer time (minimal exposure)
 * - Linear vesting schedule with cliff support
 * - Supports multiple vestings (mapping by vestingId)
 * 
 * Privacy Model:
 * - totalAmount: ALWAYS encrypted
 * - releasedAmount: ALWAYS encrypted
 * - Calculations happen on encrypted data (FHE magic!)
 * - Only the released amount is decrypted at transfer
 * 
 * FASE 1: localStorage communication from Arbitrum
 * FASE 2: Will receive CCIP messages instead
 */
contract VestingWallet is SepoliaConfig, ReentrancyGuard {
    
    // ========================================================================
    // STATE VARIABLES
    // ========================================================================
    
    /// @notice The confidential token being vested
    address public immutable token;
    
    /// @notice Contract owner (controller from Arbitrum, or admin)
    address public controller;
    
    /// @notice Vesting data structure
    struct Vesting {
        address beneficiary;        // Who receives tokens
        uint64 startTimestamp;      // When vesting starts
        uint64 duration;            // Total vesting duration (seconds)
        uint64 cliff;               // Cliff period (seconds)
        euint128 totalAmount;       // ENCRYPTED total amount
        euint128 releasedAmount;    // ENCRYPTED amount already released
        bool initialized;           // Does this vesting exist?
        bool active;                // Is vesting active?
    }
    
    /// @notice Mapping: vestingId => vesting data
    mapping(uint256 => Vesting) public vestings;
    
    // ========================================================================
    // EVENTS
    // ========================================================================
    
    /// @notice Emitted when vesting is initialized
    event VestingInitialized(
        uint256 indexed vestingId,
        address indexed beneficiary,
        uint64 startTimestamp,
        uint64 duration,
        uint64 cliff
    );
    
    /// @notice Emitted when encrypted amount is set
    event VestingAmountSet(uint256 indexed vestingId);
    
    /// @notice Emitted when tokens are released
    event TokensReleased(
        uint256 indexed vestingId,
        address indexed beneficiary,
        euint64 amount
    );
    
    /// @notice Emitted when controller is updated
    event ControllerUpdated(address indexed oldController, address indexed newController);
    
    // ========================================================================
    // ERRORS
    // ========================================================================
    
    error OnlyController();
    error OnlyBeneficiary();
    error VestingNotFound();
    error VestingNotInitialized();
    error VestingNotActive();
    error CliffNotPassed();
    error NoTokensToRelease();
    error InvalidParameters();
    error Unauthorized();
    
    // ========================================================================
    // MODIFIERS
    // ========================================================================
    
    modifier onlyController() {
        if (msg.sender != controller) revert OnlyController();
        _;
    }
    
    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================
    
    /**
     * @notice Initialize the vesting wallet
     * @param _token Address of the confidential token contract
     * @dev Controller is set to deployer initially, can be updated later
     */
    constructor(address _token) {
        token = _token;
        controller = msg.sender;
    }
    
    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Update controller address
     * @param newController New controller address
     * @dev Only current controller can update
     */
    function setController(address newController) external onlyController {
        if (newController == address(0)) revert InvalidParameters();
        address oldController = controller;
        controller = newController;
        emit ControllerUpdated(oldController, newController);
    }
    
    // ========================================================================
    // VESTING INITIALIZATION (FASE 1: Called by Admin)
    // ========================================================================
    
    /**
     * @notice Initialize a new vesting schedule
     * @param vestingId Unique vesting identifier (from Arbitrum VestingController)
     * @param beneficiary Address that will receive vested tokens
     * @param startTimestamp When vesting begins
     * @param duration Total vesting period in seconds
     * @param cliff Cliff period in seconds
     * 
     * @dev FASE 1: Called manually after VestingController emits event
     * @dev FASE 2: Will be called automatically via CCIP receiver
     * @dev Note: Amount is set separately via setVestingAmount()
     */
    function initializeVesting(
        uint256 vestingId,
        address beneficiary,
        uint64 startTimestamp,
        uint64 duration,
        uint64 cliff
    ) external onlyController {
        // Validations
        if (beneficiary == address(0)) revert InvalidParameters();
        if (duration == 0) revert InvalidParameters();
        if (cliff > duration) revert InvalidParameters();
        if (vestings[vestingId].initialized) revert InvalidParameters();
        
        // Create vesting (without amount yet)
        vestings[vestingId] = Vesting({
            beneficiary: beneficiary,
            startTimestamp: startTimestamp,
            duration: duration,
            cliff: cliff,
            totalAmount: FHE.asEuint128(0),     // Placeholder, set later
            releasedAmount: FHE.asEuint128(0),  // Nothing released yet
            initialized: true,
            active: true
        });
        
        // Set permissions for encrypted zeros
        FHE.allowThis(vestings[vestingId].totalAmount);
        FHE.allowThis(vestings[vestingId].releasedAmount);
        
        emit VestingInitialized(vestingId, beneficiary, startTimestamp, duration, cliff);
    }
    
    /**
     * @notice Set the encrypted total amount for a vesting
     * @param vestingId ID of the vesting
     * @param encryptedAmount Encrypted total amount (external format)
     * @param inputProof Proof for the encrypted input
     * 
     * @dev Called separately from initializeVesting because:
     * - Encrypted data is too large for CCIP (FASE 2)
     * - Admin encrypts amount client-side and sends directly to Ethereum
     * - This keeps CCIP costs lower
     */
    function setVestingAmount(
        uint256 vestingId,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external onlyController {
        Vesting storage vesting = vestings[vestingId];
        
        if (!vesting.initialized) revert VestingNotFound();
        
        // Convert external encrypted input to euint64
        euint64 amount64 = FHE.fromExternal(encryptedAmount, inputProof);
        
        // Cast to euint128 for storage (allows larger numbers)
        euint128 amount128 = FHE.asEuint128(amount64);
        
        // Store encrypted amount
        vesting.totalAmount = amount128;
        
        // Set permissions
        FHE.allowThis(vesting.totalAmount);
        FHE.allow(vesting.totalAmount, vesting.beneficiary);
        
        emit VestingAmountSet(vestingId);
    }
    
    // ========================================================================
    // VESTING RELEASE (Called by Beneficiary)
    // ========================================================================
    
    /**
     * @notice Release vested tokens to beneficiary
     * @param vestingId ID of the vesting to release from
     * 
     * @dev This is where the FHE magic happens:
     * 1. Calculate vestedAmount in FHE (encrypted)
     * 2. Subtract releasedAmount in FHE (encrypted)
     * 3. Get releasable amount (encrypted)
     * 4. Decrypt ONLY the releasable amount
     * 5. Transfer tokens
     * 6. Update releasedAmount (re-encrypt)
     * 
     * Privacy: totalAmount NEVER decrypted!
     */
    function release(uint256 vestingId) external nonReentrant {
        Vesting storage vesting = vestings[vestingId];
        
        // Validations
        if (!vesting.initialized) revert VestingNotFound();
        if (!vesting.active) revert VestingNotActive();
        if (msg.sender != vesting.beneficiary) revert OnlyBeneficiary();
        
        // Check cliff
        if (block.timestamp < vesting.startTimestamp + vesting.cliff) {
            revert CliffNotPassed();
        }
        
        // Calculate releasable amount (in FHE!)
        euint64 releasableAmount = _calculateReleasable(vestingId);
        
        // Transfer tokens (confidential transfer)
        IConfidentialVestingToken(token).confidentialTransfer(
            vesting.beneficiary,
            releasableAmount
        );
        
        // Update released amount (stays encrypted!)
        // Convert euint64 to euint128 for storage
        euint128 releasableAmount128 = FHE.asEuint128(releasableAmount);
        vesting.releasedAmount = FHE.add(vesting.releasedAmount, releasableAmount128);
        
        // Set permissions
        FHE.allowThis(vesting.releasedAmount);
        FHE.allow(vesting.releasedAmount, vesting.beneficiary);
        
        emit TokensReleased(vestingId, vesting.beneficiary, releasableAmount);
    }
    
    // ========================================================================
    // FHE CALCULATIONS (The Heart of Privacy!)
    // ========================================================================
    
    /**
     * @notice Calculate how much can be released right now
     * @param vestingId ID of the vesting
     * @return Encrypted releasable amount (euint64)
     * 
     * @dev This function does ALL calculations on encrypted data:
     * - vestedAmount = totalAmount × percentVested
     * - releasableAmount = vestedAmount - alreadyReleased
     * - All in FHE! No decryption until transfer!
     */
    function _calculateReleasable(uint256 vestingId) internal returns (euint64) {
        Vesting storage vesting = vestings[vestingId];
        
        // Calculate how much has vested so far (encrypted)
        euint128 vestedAmount = _calculateVestedAmount(
            vesting.totalAmount,
            vesting.startTimestamp,
            vesting.duration,
            uint64(block.timestamp)
        );
        
        // Calculate releasable: vestedAmount - releasedAmount
        // Use FHE select to handle underflow (if already released > vested)
        ebool canRelease = FHE.ge(vestedAmount, vesting.releasedAmount);
        euint128 releasable128 = FHE.select(
            canRelease,
            FHE.sub(vestedAmount, vesting.releasedAmount),
            FHE.asEuint128(0)
        );
        
        // Convert to euint64 for transfer
        // (We use euint64 for transfers to match token contract)
        return FHE.asEuint64(releasable128);
    }
    
    /**
     * @notice Calculate vested amount using linear vesting schedule
     * @param totalAllocation Total encrypted amount
     * @param startTime Start timestamp
     * @param vestingDuration Vesting duration
     * @param timestamp Current timestamp
     * @return Encrypted vested amount at given timestamp
     * 
     * @dev Linear vesting formula (in FHE):
     * - Before start: 0
     * - After end: totalAllocation
     * - During vesting: totalAllocation × (elapsed / vestingDuration)
     * 
     * This is the CORE privacy feature: calculating percentages on encrypted data!
     */
    function _calculateVestedAmount(
        euint128 totalAllocation,
        uint64 startTime,
        uint64 vestingDuration,
        uint64 timestamp
    ) internal returns (euint128) {
        // Before vesting starts
        if (timestamp < startTime) {
            return FHE.asEuint128(0);
        }
        
        // After vesting ends (fully vested)
        if (timestamp >= startTime + vestingDuration) {
            return totalAllocation;
        }
        
        // During vesting: calculate percentage (encrypted!)
        // vestedAmount = totalAllocation × elapsed / vestingDuration
        
        uint64 elapsed = timestamp - startTime;
        
        // FHE multiplication and division
        // Note: We multiply first to maintain precision
        euint128 vestedAmount = FHE.div(
            FHE.mul(totalAllocation, elapsed),
            vestingDuration
        );
        
        return vestedAmount;
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Get vesting start timestamp
     * @param vestingId ID of the vesting
     * @return Start timestamp
     */
    function start(uint256 vestingId) external view returns (uint64) {
        if (!vestings[vestingId].initialized) revert VestingNotFound();
        return vestings[vestingId].startTimestamp;
    }
    
    /**
     * @notice Get vesting duration
     * @param vestingId ID of the vesting
     * @return Duration in seconds
     */
    function duration(uint256 vestingId) external view returns (uint64) {
        if (!vestings[vestingId].initialized) revert VestingNotFound();
        return vestings[vestingId].duration;
    }
    
    /**
     * @notice Get vesting end timestamp
     * @param vestingId ID of the vesting
     * @return End timestamp
     */
    function end(uint256 vestingId) external view returns (uint64) {
        Vesting storage vesting = vestings[vestingId];
        if (!vesting.initialized) revert VestingNotFound();
        return vesting.startTimestamp + vesting.duration;
    }
    
    /**
     * @notice Get encrypted total amount (for authorized viewers)
     * @param vestingId ID of the vesting
     * @return Encrypted total amount
     */
    function totalAmount(uint256 vestingId) external view returns (euint128) {
        if (!vestings[vestingId].initialized) revert VestingNotFound();
        return vestings[vestingId].totalAmount;
    }
    
    /**
     * @notice Get encrypted released amount (for authorized viewers)
     * @param vestingId ID of the vesting
     * @return Encrypted released amount
     */
    function releasedAmount(uint256 vestingId) external view returns (euint128) {
        if (!vestings[vestingId].initialized) revert VestingNotFound();
        return vestings[vestingId].releasedAmount;
    }
    
    /**
     * @notice Get beneficiary address
     * @param vestingId ID of the vesting
     * @return Beneficiary address
     */
    function beneficiary(uint256 vestingId) external view returns (address) {
        if (!vestings[vestingId].initialized) revert VestingNotFound();
        return vestings[vestingId].beneficiary;
    }
    
    /**
     * @notice Check if vesting is active
     * @param vestingId ID of the vesting
     * @return True if active
     */
    function isActive(uint256 vestingId) external view returns (bool) {
        if (!vestings[vestingId].initialized) revert VestingNotFound();
        return vestings[vestingId].active;
    }
}

