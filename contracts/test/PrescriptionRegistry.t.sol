// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/PrescriptionRegistry.sol";

contract PrescriptionRegistryTest is Test {
    PrescriptionRegistry private registry;
    uint256 internal doctorKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d; // 0x7099...
    address private constant DOCTOR = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    
    uint256 internal patientKey = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a; // Anvil #2
    address internal PATIENT;
    address private constant VIEWER = address(0xBEEF);

    bytes32 private constant DOMAIN_TYPE_HASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PRESCRIPTION_TYPE_HASH = keccak256("Prescription(address doctor,address patient,string medicationDetails,uint256 nonce,uint256 validUntil)");

    function setUp() public {
        PATIENT = vm.addr(patientKey);
        registry = new PrescriptionRegistry();
        vm.deal(DOCTOR, 10 ether);
        vm.deal(PATIENT, 10 ether);
    }

    function _sign(uint256 pk, string memory details, uint256 nonce, uint256 validUntil) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(abi.encode(
            DOMAIN_TYPE_HASH,
            keccak256(bytes("PrescriptionRegistry")),
            keccak256(bytes("1")),
            block.chainid,
            address(registry)
        ));
        bytes32 structHash = keccak256(abi.encode(
            PRESCRIPTION_TYPE_HASH,
            DOCTOR,
            PATIENT,
            keccak256(bytes(details)),
            nonce,
            validUntil
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function testDualSignatureRegistration() public {
        string memory details = "Meds: Aspirin (100mg)";
        uint256 nonce = 0;
        uint256 validUntil = block.timestamp + 1 hours;

        // Both sign the same data
        bytes memory sigDoctor = _sign(doctorKey, details, nonce, validUntil);
        bytes memory sigPatient = _sign(patientKey, details, nonce, validUntil);

        // Patient submits (pays gas)
        vm.prank(PATIENT);
        uint256 prescriptionId = registry.registerPrescription(
            DOCTOR,
            PATIENT,
            details,
            validUntil,
            "ipfs://hash",
            sigDoctor,
            sigPatient
        );

        vm.prank(PATIENT); // Patient reads their own prescription
        PrescriptionRegistry.Prescription memory record = registry.getPrescription(prescriptionId);
        assertEq(record.doctor, DOCTOR);
        assertEq(record.patient, PATIENT);
        assertEq(record.metadataURI, "ipfs://hash");
    }

    function testExpiredSignatureReverts() public {
        string memory details = "Meds: Aspirin";
        uint256 nonce = 0;
        uint256 validUntil = block.timestamp - 1; // Expired

        bytes memory sigDoctor = _sign(doctorKey, details, nonce, validUntil);
        bytes memory sigPatient = _sign(patientKey, details, nonce, validUntil);

        vm.prank(PATIENT);
        vm.expectRevert("signature expired");
        registry.registerPrescription(
            DOCTOR,
            PATIENT,
            details,
            validUntil,
            "ipfs://hash",
            sigDoctor,
            sigPatient
        );
    }

    function testInvalidDoctorSignature() public {
        string memory details = "Meds: Aspirin";
        uint256 nonce = 0;
        uint256 validUntil = block.timestamp + 1 hours;

        // Patient signs FOR Doctor (Invalid)
        bytes memory sigDoctor = _sign(patientKey, details, nonce, validUntil);
        bytes memory sigPatient = _sign(patientKey, details, nonce, validUntil);

        vm.prank(PATIENT);
        vm.expectRevert("invalid doctor signature");
        registry.registerPrescription(
            DOCTOR,
            PATIENT,
            details,
            validUntil,
            "ipfs://hash",
            sigDoctor,
            sigPatient
        );
    }

    function testReplayAttackFails() public {
        string memory details = "Meds: Aspirin";
        uint256 nonce = 0;
        uint256 validUntil = block.timestamp + 1 hours;

        bytes memory sigDoctor = _sign(doctorKey, details, nonce, validUntil);
        bytes memory sigPatient = _sign(patientKey, details, nonce, validUntil);

        vm.prank(PATIENT);
        registry.registerPrescription(DOCTOR, PATIENT, details, validUntil, "ipfs://1", sigDoctor, sigPatient);

        // Try reusing same signatures (nonce matches hash but contract nonce incremented)
        // Wait... actually the hash depends on the nonce passed in.
        // If I pass nonce 0 again, the hash matches the signature, but the Contract checks `nonces[doctor]`?
        // Ah, the contract USES `nonces[doctor]` to BUILD the hash.
        // So if I call it again, `nonces[doctor]` is now 1.
        // The contract will build hash with nonce=1.
        // But signatures were for nonce=0.
        // Recover will fail (or return random address).
        
        vm.prank(PATIENT);
        vm.expectRevert("invalid doctor signature");
        registry.registerPrescription(DOCTOR, PATIENT, details, validUntil, "ipfs://1", sigDoctor, sigPatient);
    }
}

