// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title PrescriptionRegistry
/// @notice Anchors prescription metadata on-chain while delegating payload storage off-chain.
contract PrescriptionRegistry {
    struct Prescription {
        address doctor;
        address patient;
        string metadataURI; // points to hashed/immutable payload stored off-chain
        uint256 createdAt;
    }

    // Removed Draft struct as it's handled off-chain

    mapping(uint256 => Prescription) private prescriptions;
    // Removed drafts mapping
    mapping(address => mapping(address => bool)) private patientDelegates;
    mapping(address => bool) private allowedDoctors;

    uint256 private nextPrescriptionId = 1;
    // Removed nextDraftId

    // Removed DraftCreated, DraftFinalized events
    event PrescriptionIssued(uint256 indexed prescriptionId, address indexed doctor, address indexed patient, string metadataURI);
    event PatientDelegationUpdated(address indexed patient, address indexed viewer, bool allowed);

    error NotPatient(uint256 prescriptionId, address caller);
    error UnauthorizedViewer(uint256 prescriptionId, address caller);
    // Removed DraftNotActive error

    // Hard-coded sample doctors for prototyping.
    address private constant DOCTOR_ONE = address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
    address private constant DOCTOR_TWO = address(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC);
    address private constant DOCTOR_THREE = address(0x90F79bf6EB2c4f870365E785982E1f101E93b906);

    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PRESCRIPTION_TYPE_HASH = keccak256("Prescription(address doctor,address patient,string medicationDetails,uint256 nonce,uint256 validUntil)");

    constructor() {
        allowedDoctors[DOCTOR_ONE] = true;
        allowedDoctors[DOCTOR_TWO] = true;
        allowedDoctors[DOCTOR_THREE] = true;
    }

    function _domainSeparatorV4() internal view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPE_HASH,
            keccak256(bytes("PrescriptionRegistry")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash));
    }

    function recover(bytes32 hash, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) {
            return address(0);
        }
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        if (v != 27 && v != 28) {
            return address(0);
        }
        return ecrecover(hash, v, r, s);
    }

    mapping(address => uint256) public nonces;

    function registerPrescription(
        address doctor,
        address patient,
        string calldata medicationDetails,
        uint256 validUntil,
        string calldata metadataURI,
        bytes calldata doctorSignature,
        bytes calldata patientSignature
    ) external returns (uint256 prescriptionId) {
        require(allowedDoctors[doctor], "doctor not authorized");
        require(patient != address(0), "invalid patient");
        require(block.timestamp <= validUntil, "signature expired");
        require(bytes(metadataURI).length > 0, "empty metadata");

        uint256 nonce = nonces[doctor]++;
        {
            bytes32 structHash = keccak256(abi.encode(
                PRESCRIPTION_TYPE_HASH,
                doctor,
                patient,
                keccak256(bytes(medicationDetails)),
                nonce,
                validUntil
            ));
            bytes32 digest = _hashTypedDataV4(structHash);

            require(recover(digest, doctorSignature) == doctor, "invalid doctor signature");
            require(recover(digest, patientSignature) == patient, "invalid patient signature");
        }

        prescriptionId = nextPrescriptionId++;
        prescriptions[prescriptionId] = Prescription({
            doctor: doctor,
            patient: patient,
            metadataURI: metadataURI,
            createdAt: block.timestamp
        });

        emit PrescriptionIssued(prescriptionId, doctor, patient, metadataURI);
    }

    /// @notice Patients can delegate blanket access to a doctor/viewer.
    function setDelegate(address viewer, bool allowed) external {
        require(viewer != address(0), "invalid viewer");
        patientDelegates[msg.sender][viewer] = allowed;
        emit PatientDelegationUpdated(msg.sender, viewer, allowed);
    }

    /// @notice Fetches prescription metadata if caller is the doctor, patient, or an authorized delegate.
    function getPrescription(uint256 prescriptionId)
        external
        view
        returns (Prescription memory)
    {
        if (!_canView(prescriptionId, msg.sender)) {
            revert UnauthorizedViewer(prescriptionId, msg.sender);
        }
        return prescriptions[prescriptionId];
    }

    function canView(uint256 prescriptionId, address viewer) external view returns (bool) {
        return _canView(prescriptionId, viewer);
    }

    function patientDelegate(address patient, address viewer) external view returns (bool) {
        return patientDelegates[patient][viewer];
    }

    function isDoctor(address account) external view returns (bool) {
        return allowedDoctors[account];
    }
    
    // Removed getDraft function

    function _canView(uint256 prescriptionId, address viewer) internal view returns (bool) {
        Prescription memory prescription = prescriptions[prescriptionId];
        if (viewer == prescription.doctor || viewer == prescription.patient) {
            return true;
        }
        return patientDelegates[prescription.patient][viewer];
    }
}

