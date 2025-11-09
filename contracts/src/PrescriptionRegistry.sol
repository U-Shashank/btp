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

    struct Draft {
        address doctor;
        address patient;
        bool active;
    }

    mapping(uint256 => Prescription) private prescriptions;
    mapping(uint256 => Draft) private drafts;
    mapping(address => mapping(address => bool)) private patientDelegates;
    mapping(address => bool) private allowedDoctors;

    uint256 private nextPrescriptionId = 1;
    uint256 private nextDraftId = 1;

    event DraftCreated(uint256 indexed draftId, address indexed doctor, address indexed patient);
    event DraftFinalized(uint256 indexed draftId, uint256 indexed prescriptionId, string metadataURI);
    event PrescriptionIssued(uint256 indexed prescriptionId, address indexed doctor, address indexed patient, string metadataURI);
    event PatientDelegationUpdated(address indexed patient, address indexed viewer, bool allowed);

    error NotPatient(uint256 prescriptionId, address caller);
    error UnauthorizedViewer(uint256 prescriptionId, address caller);
    error DraftNotActive(uint256 draftId);

    // Hard-coded sample doctors for prototyping.
    address private constant DOCTOR_ONE = address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
    address private constant DOCTOR_TWO = address(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC);
    address private constant DOCTOR_THREE = address(0x90F79bf6EB2c4f870365E785982E1f101E93b906);

    constructor() {
        allowedDoctors[DOCTOR_ONE] = true;
        allowedDoctors[DOCTOR_TWO] = true;
        allowedDoctors[DOCTOR_THREE] = true;
    }

    /// @notice Allows an allow-listed doctor to register a draft for a patient.
    function submitDraft(address patient) external returns (uint256 draftId) {
        require(allowedDoctors[msg.sender], "doctor not authorized");
        require(patient != address(0), "invalid patient");

        draftId = nextDraftId++;
        drafts[draftId] = Draft({doctor: msg.sender, patient: patient, active: true});

        emit DraftCreated(draftId, msg.sender, patient);
    }

    /// @notice Patient finalizes a draft by providing the metadata URI, minting the immutable record.
    function finalizeDraft(uint256 draftId, string calldata metadataURI) external returns (uint256 prescriptionId) {
        Draft storage draft = drafts[draftId];
        if (!draft.active) {
            revert DraftNotActive(draftId);
        }
        require(draft.patient == msg.sender, "not draft patient");
        require(bytes(metadataURI).length > 0, "empty metadata");

        draft.active = false;

        prescriptionId = nextPrescriptionId++;
        prescriptions[prescriptionId] = Prescription({
            doctor: draft.doctor,
            patient: draft.patient,
            metadataURI: metadataURI,
            createdAt: block.timestamp
        });

        emit DraftFinalized(draftId, prescriptionId, metadataURI);
        emit PrescriptionIssued(prescriptionId, draft.doctor, draft.patient, metadataURI);
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

    function getDraft(uint256 draftId) external view returns (Draft memory) {
        return drafts[draftId];
    }

    function _canView(uint256 prescriptionId, address viewer) internal view returns (bool) {
        Prescription memory prescription = prescriptions[prescriptionId];
        if (viewer == prescription.doctor || viewer == prescription.patient) {
            return true;
        }
        return patientDelegates[prescription.patient][viewer];
    }
}

