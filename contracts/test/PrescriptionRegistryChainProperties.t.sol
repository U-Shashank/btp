// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/PrescriptionRegistry.sol";
import "../src/DoctorStatusOracle.sol";

contract PrescriptionRegistryChainPropertiesTest is Test {
    PrescriptionRegistry private registry;
    DoctorStatusOracle private oracle;

    uint256 internal doctorKey =
        0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    address private constant DOCTOR = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    uint256 internal patientKey =
        0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    address internal PATIENT;

    address private constant VIEWER = address(0xBEEF);
    address private constant OUTSIDER = address(0xCAFE);

    bytes32 private constant DOMAIN_TYPE_HASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 private constant PRESCRIPTION_TYPE_HASH =
        keccak256(
            "Prescription(address doctor,address patient,string medicationDetails,uint256 nonce,uint256 validUntil)"
        );

    function setUp() public {
        PATIENT = vm.addr(patientKey);

        oracle = new DoctorStatusOracle();
        oracle.addDoctor(DOCTOR);

        registry = new PrescriptionRegistry(address(oracle));

        vm.deal(DOCTOR, 10 ether);
        vm.deal(PATIENT, 10 ether);
    }

    function _sign(
        uint256 pk,
        address doctor,
        address patient,
        string memory details,
        uint256 nonce,
        uint256 validUntil
    ) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPE_HASH,
                keccak256(bytes("PrescriptionRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                address(registry)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                PRESCRIPTION_TYPE_HASH,
                doctor,
                patient,
                keccak256(bytes(details)),
                nonce,
                validUntil
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _registerPrescription(
        string memory details,
        string memory metadataURI
    ) internal returns (uint256 prescriptionId) {
        uint256 validUntil = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(DOCTOR);

        bytes memory sigDoctor = _sign(
            doctorKey,
            DOCTOR,
            PATIENT,
            details,
            nonce,
            validUntil
        );
        bytes memory sigPatient = _sign(
            patientKey,
            DOCTOR,
            PATIENT,
            details,
            nonce,
            validUntil
        );

        vm.prank(PATIENT);
        prescriptionId = registry.registerPrescription(
            DOCTOR,
            PATIENT,
            details,
            validUntil,
            metadataURI,
            sigDoctor,
            sigPatient
        );
    }

    function testInactiveDoctorCannotRegisterPrescription() public {
        oracle.toggleDoctorStatus(DOCTOR);

        uint256 validUntil = block.timestamp + 1 hours;
        bytes memory sigDoctor = _sign(
            doctorKey,
            DOCTOR,
            PATIENT,
            "Meds: Aspirin",
            0,
            validUntil
        );
        bytes memory sigPatient = _sign(
            patientKey,
            DOCTOR,
            PATIENT,
            "Meds: Aspirin",
            0,
            validUntil
        );

        vm.prank(PATIENT);
        vm.expectRevert("doctor not authorized");
        registry.registerPrescription(
            DOCTOR,
            PATIENT,
            "Meds: Aspirin",
            validUntil,
            "ipfs://hash",
            sigDoctor,
            sigPatient
        );
    }

    function testDelegateAccessFollowsPatientPermission() public {
        uint256 prescriptionId = _registerPrescription(
            "Meds: Amoxicillin",
            "ipfs://delegate-check"
        );

        vm.prank(PATIENT);
        registry.setDelegate(VIEWER, true);

        assertTrue(registry.canView(prescriptionId, VIEWER));

        vm.prank(VIEWER);
        PrescriptionRegistry.Prescription memory record = registry.getPrescription(
            prescriptionId
        );
        assertEq(record.metadataURI, "ipfs://delegate-check");

        vm.prank(PATIENT);
        registry.setDelegate(VIEWER, false);

        assertFalse(registry.canView(prescriptionId, VIEWER));

        vm.prank(VIEWER);
        vm.expectRevert(
            abi.encodeWithSelector(
                PrescriptionRegistry.UnauthorizedViewer.selector,
                prescriptionId,
                VIEWER
            )
        );
        registry.getPrescription(prescriptionId);
    }

    function testUnauthorizedViewerCannotReadPrescription() public {
        uint256 prescriptionId = _registerPrescription(
            "Meds: Cetirizine",
            "ipfs://private"
        );

        assertFalse(registry.canView(prescriptionId, OUTSIDER));

        vm.prank(OUTSIDER);
        vm.expectRevert(
            abi.encodeWithSelector(
                PrescriptionRegistry.UnauthorizedViewer.selector,
                prescriptionId,
                OUTSIDER
            )
        );
        registry.getPrescription(prescriptionId);
    }

    function testPrescriptionIdsAndDoctorNoncesAdvanceSequentially() public {
        uint256 firstId = _registerPrescription("Meds: Prescription A", "ipfs://a");
        uint256 secondId = _registerPrescription("Meds: Prescription B", "ipfs://b");
        uint256 thirdId = _registerPrescription("Meds: Prescription C", "ipfs://c");

        assertEq(firstId, 1);
        assertEq(secondId, 2);
        assertEq(thirdId, 3);
        assertEq(registry.nonces(DOCTOR), 3);
    }

    function testRegisterPrescriptionGasStaysWithinReviewBudget() public {
        uint256 validUntil = block.timestamp + 1 hours;
        uint256 nonce = registry.nonces(DOCTOR);
        string memory details = "Meds: Gas Budget Check";

        bytes memory sigDoctor = _sign(
            doctorKey,
            DOCTOR,
            PATIENT,
            details,
            nonce,
            validUntil
        );
        bytes memory sigPatient = _sign(
            patientKey,
            DOCTOR,
            PATIENT,
            details,
            nonce,
            validUntil
        );

        vm.startPrank(PATIENT);
        uint256 gasBefore = gasleft();
        registry.registerPrescription(
            DOCTOR,
            PATIENT,
            details,
            validUntil,
            "ipfs://gas-budget",
            sigDoctor,
            sigPatient
        );
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit log_named_uint("registerPrescription measured gas", gasUsed);
        assertLt(gasUsed, 230000);
    }

    function testSetDelegateGasStaysWithinReviewBudget() public {
        vm.startPrank(PATIENT);
        uint256 gasBefore = gasleft();
        registry.setDelegate(VIEWER, true);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit log_named_uint("setDelegate measured gas", gasUsed);
        assertLt(gasUsed, 60000);
    }
}
