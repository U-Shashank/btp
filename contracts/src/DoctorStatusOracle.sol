// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title DoctorStatusOracle
/// @notice Oracle contract for managing doctor authorization status
/// @dev Admin (deployer) can add doctors and toggle their active status
contract DoctorStatusOracle {
    struct DoctorInfo {
        bool active;
        uint256 lastUpdated;
    }

    mapping(address => DoctorInfo) public doctors;
    address[] private doctorList; // Array to track all doctor addresses
    address public immutable admin;

    event DoctorAdded(address indexed doctor, uint256 timestamp);
    event DoctorStatusToggled(address indexed doctor, bool active, uint256 timestamp);

    error OnlyAdmin();
    error DoctorAlreadyExists(address doctor);
    error DoctorDoesNotExist(address doctor);
    error InvalidDoctorAddress();

    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert OnlyAdmin();
        }
        _;
    }

    /// @notice Constructor sets deployer as admin
    constructor() {
        admin = msg.sender;
    }

    /// @notice Add a new doctor to the oracle
    /// @param doctor Address of the doctor to add
    function addDoctor(address doctor) external onlyAdmin {
        if (doctor == address(0)) {
            revert InvalidDoctorAddress();
        }
        if (doctors[doctor].lastUpdated > 0) {
            revert DoctorAlreadyExists(doctor);
        }
        
        doctors[doctor] = DoctorInfo({
            active: true,
            lastUpdated: block.timestamp
        });
        
        doctorList.push(doctor); // Add to list
        
        emit DoctorAdded(doctor, block.timestamp);
    }

    /// @notice Toggle doctor's active status
    /// @param doctor Address of the doctor to toggle
    function toggleDoctorStatus(address doctor) external onlyAdmin {
        if (doctors[doctor].lastUpdated == 0) {
            revert DoctorDoesNotExist(doctor);
        }
        
        doctors[doctor].active = !doctors[doctor].active;
        doctors[doctor].lastUpdated = block.timestamp;
        
        emit DoctorStatusToggled(doctor, doctors[doctor].active, block.timestamp);
    }

    /// @notice Check if a doctor is currently active
    /// @param doctor Address of the doctor to check
    /// @return bool True if doctor is active, false otherwise
    function isDoctorActive(address doctor) external view returns (bool) {
        return doctors[doctor].active;
    }

    /// @notice Get detailed information about a doctor
    /// @param doctor Address of the doctor
    /// @return DoctorInfo struct containing active status and last update timestamp
    function getDoctorInfo(address doctor) external view returns (DoctorInfo memory) {
        return doctors[doctor];
    }

    /// @notice Get all doctor addresses
    /// @return address[] Array of all doctor addresses
    function getAllDoctors() external view returns (address[] memory) {
        return doctorList;
    }

    /// @notice Get the total number of doctors
    /// @return uint256 Total count of doctors
    function getDoctorCount() external view returns (uint256) {
        return doctorList.length;
    }
}
