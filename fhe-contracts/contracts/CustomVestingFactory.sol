// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig, ZamaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Initializable} from
    "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {VestingWalletCliffConfidential} from 
    "./finance/VestingWalletCliffConfidential.sol";
import {VestingWalletConfidentialFactory} from 
    "./finance/VestingWalletConfidentialFactory.sol";
import {IERC7984} from 
    "./interfaces/IERC7984.sol";

/**
 * @title CustomVestingFactory
 * @dev A factory contract for creating and batch-funding confidential vesting wallets with cliff periods.
 */
contract CustomVestingFactory is VestingWalletConfidentialFactory, SepoliaConfig {
    /**
     * @dev Constructor initializes the FHE coprocessor for Sepolia
     */
    constructor() {
        FHE.setCoprocessor(ZamaConfig.getSepoliaConfig());
    }
    /// @dev Structure for defining a vesting schedule for a beneficiary
    struct VestingSchedule {
        address beneficiary;          // Who receives the tokens
        externalEuint64 encryptedAmount; // How many tokens (encrypted)
        uint48 startTimestamp;        // When vesting starts
        uint48 durationSeconds;       // Total vesting period (e.g., 5 minutes = 300 seconds)
        uint48 cliffSeconds;          // Lock period (e.g., 2 minutes = 120 seconds)
    }

    /// @dev Emitted when a batch of vesting wallets is created and funded
    event BatchVestingCreated(
        address indexed token,
        uint256 totalRecipients,
        uint256 timestamp
    );

    /// @dev Emitted for each individual vesting wallet created
    event IndividualVestingCreated(
        address indexed beneficiary,
        address indexed vestingWallet,
        uint48 startTimestamp,
        uint48 durationSeconds,
        uint48 cliffSeconds
    );

    /**
     * @dev Deploys the vesting wallet implementation that will be cloned
     * This is called once in the constructor
     */
    function _deployVestingWalletImplementation() internal virtual override returns (address) {
        return address(new CliffVestingWalletImplementation());
    }

    /**
     * @dev Validates the initialization arguments before creating/funding a wallet
     * Ensures beneficiary is valid and cliff doesn't exceed duration
     */
    function _validateVestingWalletInitArgs(bytes memory initArgs) internal view virtual override {
        (
            address beneficiary,
            uint48 startTimestamp,
            uint48 durationSeconds,
            uint48 cliffSeconds
        ) = abi.decode(initArgs, (address, uint48, uint48, uint48));

        require(beneficiary != address(0), "CustomVestingFactory: beneficiary is zero address");
        require(cliffSeconds <= durationSeconds, "CustomVestingFactory: cliff exceeds duration");
        require(durationSeconds > 0, "CustomVestingFactory: duration must be positive");
        require(startTimestamp > 0, "CustomVestingFactory: start timestamp must be positive");
    }

    /**
     * @dev Initializes a newly created vesting wallet with the decoded parameters
     */
    function _initializeVestingWallet(
        address vestingWalletAddress,
        bytes calldata initArgs
    ) internal virtual override {
        (
            address beneficiary,
            uint48 startTimestamp,
            uint48 durationSeconds,
            uint48 cliffSeconds
        ) = abi.decode(initArgs, (address, uint48, uint48, uint48));

        CliffVestingWalletImplementation(vestingWalletAddress).initialize(
            beneficiary,
            startTimestamp,
            durationSeconds,
            cliffSeconds
        );

        emit IndividualVestingCreated(
            beneficiary,
            vestingWalletAddress,
            startTimestamp,
            durationSeconds,
            cliffSeconds
        );
    }

    /**
     * @dev Batch creates and funds vesting wallets for multiple beneficiaries
     * 
     */
    function batchCreateAndFundVesting(
        address token,
        VestingSchedule[] calldata schedules,
        bytes calldata inputProof
    ) external {
        require(schedules.length > 0, "CustomVestingFactory: empty schedules");

        // Step 1: Create all vesting wallets (if they don't exist)
        for (uint256 i = 0; i < schedules.length; i++) {
            VestingSchedule memory schedule = schedules[i];
            
            bytes memory initArgs = abi.encode(
                schedule.beneficiary,
                schedule.startTimestamp,
                schedule.durationSeconds,
                schedule.cliffSeconds
            );

            // Try to create wallet (will revert if already exists)
            try this.createVestingWalletConfidential(initArgs) returns (address) {
                // Wallet created successfully
            } catch {
                // Wallet already exists, that's fine
            }
        }

        // Step 2: Fund each wallet with ENCRYPTED amounts
        // We iterate instead of using the batch function to avoid memory/calldata conversion issues
        for (uint256 i = 0; i < schedules.length; i++) {
            VestingSchedule memory schedule = schedules[i];
            
            bytes memory initArgs = abi.encode(
                schedule.beneficiary,
                schedule.startTimestamp,
                schedule.durationSeconds,
                schedule.cliffSeconds
            );

            address vestingWalletAddress = predictVestingWalletConfidential(initArgs);

            // Import encrypted amount from external input with proof
            euint64 encryptedAmount = FHE.fromExternal(schedule.encryptedAmount, inputProof);
            
            // Grant temporary permission for token contract to read the encrypted amount
            FHE.allowTransient(encryptedAmount, token);
            
            // Transfer ENCRYPTED tokens to the vesting wallet
            // No one can see the actual amount being transferred!
            euint64 transferredAmount = IERC7984(token).confidentialTransferFrom(
                msg.sender,
                vestingWalletAddress,
                encryptedAmount
            );

            // Emit event with wallet address (amount is encrypted, so it's private)
            emit VestingWalletConfidentialFunded(vestingWalletAddress, token, transferredAmount, initArgs);
        }

        emit BatchVestingCreated(token, schedules.length, block.timestamp);
    }

    /**
     * @dev Helper function to get vesting wallet address for a beneficiary
     * Useful for beneficiaries to find their wallet address
     */
    function getVestingWalletAddress(
        address beneficiary,
        uint48 startTimestamp,
        uint48 durationSeconds,
        uint48 cliffSeconds
    ) external view returns (address) {
        bytes memory initArgs = abi.encode(
            beneficiary,
            startTimestamp,
            durationSeconds,
            cliffSeconds
        );
        return predictVestingWalletConfidential(initArgs);
    }
}

/**
 * @title CliffVestingWalletImplementation
 * @dev The actual vesting wallet implementation that gets cloned for each beneficiary
 * 
 */
contract CliffVestingWalletImplementation is VestingWalletCliffConfidential, SepoliaConfig {
    /**
     * @dev Constructor disables initializers to prevent implementation from being initialized
     * Only clones can be initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the vesting wallet for a specific beneficiary
     * Called by the factory when creating a new vesting wallet
     */
    function initialize(
        address beneficiary,
        uint48 startTimestamp,
        uint48 durationSeconds,
        uint48 cliffSeconds
    ) external initializer {
        // Initialize the vesting schedule with cliff
        __VestingWalletCliffConfidential_init(
            beneficiary,
            startTimestamp,
            durationSeconds,
            cliffSeconds
        );
        
        FHE.setCoprocessor(ZamaConfig.getSepoliaConfig());
    }
}

