// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/PrescriptionRegistry.sol";

contract PrescriptionRegistryTest is Test {
    PrescriptionRegistry private registry;
    address private constant DOCTOR = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address private constant PATIENT = address(0xAa11);
    address private constant VIEWER = address(0xBEEF);

    function setUp() public {
        registry = new PrescriptionRegistry();
        vm.deal(DOCTOR, 10 ether);
        vm.deal(PATIENT, 10 ether);
    }

    function testDoctorSubmitsAndPatientFinalizes() public {
        vm.startPrank(DOCTOR);
        uint256 draftId = registry.submitDraft(PATIENT);
        vm.stopPrank();

        vm.startPrank(PATIENT);
        uint256 prescriptionId = registry.finalizeDraft(draftId, "ipfs://hash");
        vm.stopPrank();

        vm.prank(PATIENT);
        PrescriptionRegistry.Prescription memory record = registry.getPrescription(prescriptionId);

        assertEq(record.doctor, DOCTOR);
        assertEq(record.patient, PATIENT);
        assertEq(record.metadataURI, "ipfs://hash");
        assertGt(record.createdAt, 0);
    }

    function testDraftMustBeActive() public {
        vm.prank(DOCTOR);
        uint256 draftId = registry.submitDraft(PATIENT);

        vm.prank(PATIENT);
        registry.finalizeDraft(draftId, "ipfs://hash");

        vm.prank(PATIENT);
        vm.expectRevert(abi.encodeWithSelector(PrescriptionRegistry.DraftNotActive.selector, draftId));
        registry.finalizeDraft(draftId, "ipfs://hash");
    }

    function testOnlyPatientCanFinalize() public {
        vm.prank(DOCTOR);
        uint256 draftId = registry.submitDraft(PATIENT);

        vm.expectRevert("not draft patient");
        registry.finalizeDraft(draftId, "cid");
    }

    function testDelegationAllowsViewer() public {
        uint256 prescriptionId = _issuePrescription();

        vm.prank(PATIENT);
        registry.setDelegate(VIEWER, true);

        vm.prank(VIEWER);
        PrescriptionRegistry.Prescription memory record = registry.getPrescription(prescriptionId);
        assertEq(record.patient, PATIENT);
    }

    function _issuePrescription() internal returns (uint256) {
        vm.prank(DOCTOR);
        uint256 draftId = registry.submitDraft(PATIENT);

        vm.prank(PATIENT);
        return registry.finalizeDraft(draftId, "ipfs://hash");
    }
}

