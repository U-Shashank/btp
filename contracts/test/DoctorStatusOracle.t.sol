// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {DoctorStatusOracle} from "../src/DoctorStatusOracle.sol";

contract DoctorStatusOracleTest is Test {
    DoctorStatusOracle public oracle;
    address public admin;
    address public doctor1;
    address public doctor2;
    address public unauthorizedUser;

    event DoctorAdded(address indexed doctor, uint256 timestamp);
    event DoctorStatusToggled(address indexed doctor, bool active, uint256 timestamp);

    function setUp() public {
        admin = address(this);
        doctor1 = address(0x1);
        doctor2 = address(0x2);
        unauthorizedUser = address(0x3);

        oracle = new DoctorStatusOracle();
    }

    function test_constructor_sets_admin() public view {
        assertEq(oracle.admin(), admin);
    }

    function test_addDoctor_success() public {
        vm.expectEmit(true, false, false, true);
        emit DoctorAdded(doctor1, block.timestamp);

        oracle.addDoctor(doctor1);

        assertTrue(oracle.isDoctorActive(doctor1));
        
        (bool active, uint256 lastUpdated) = oracle.doctors(doctor1);
        assertTrue(active);
        assertEq(lastUpdated, block.timestamp);
    }

    function test_addDoctor_emits_event() public {
        vm.expectEmit(true, false, false, true);
        emit DoctorAdded(doctor1, block.timestamp);
        
        oracle.addDoctor(doctor1);
    }

    function test_addDoctor_revert_if_zero_address() public {
        vm.expectRevert(DoctorStatusOracle.InvalidDoctorAddress.selector);
        oracle.addDoctor(address(0));
    }

    function test_addDoctor_revert_if_already_exists() public {
        oracle.addDoctor(doctor1);
        
        vm.expectRevert(abi.encodeWithSelector(DoctorStatusOracle.DoctorAlreadyExists.selector, doctor1));
        oracle.addDoctor(doctor1);
    }

    function test_addDoctor_revert_if_not_admin() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert(DoctorStatusOracle.OnlyAdmin.selector);
        oracle.addDoctor(doctor1);
    }

    function test_toggleDoctorStatus_deactivates_active_doctor() public {
        oracle.addDoctor(doctor1);
        assertTrue(oracle.isDoctorActive(doctor1));

        vm.expectEmit(true, false, false, true);
        emit DoctorStatusToggled(doctor1, false, block.timestamp);

        oracle.toggleDoctorStatus(doctor1);

        assertFalse(oracle.isDoctorActive(doctor1));
    }

    function test_toggleDoctorStatus_reactivates_inactive_doctor() public {
        oracle.addDoctor(doctor1);
        oracle.toggleDoctorStatus(doctor1);
        assertFalse(oracle.isDoctorActive(doctor1));

        vm.expectEmit(true, false, false, true);
        emit DoctorStatusToggled(doctor1, true, block.timestamp);

        oracle.toggleDoctorStatus(doctor1);

        assertTrue(oracle.isDoctorActive(doctor1));
    }

    function test_toggleDoctorStatus_updates_timestamp() public {
        oracle.addDoctor(doctor1);
        uint256 addTimestamp = block.timestamp;

        vm.warp(block.timestamp + 100);
        oracle.toggleDoctorStatus(doctor1);

        (, uint256 lastUpdated) = oracle.doctors(doctor1);
        assertGt(lastUpdated, addTimestamp);
        assertEq(lastUpdated, block.timestamp);
    }

    function test_toggleDoctorStatus_revert_if_doctor_does_not_exist() public {
        vm.expectRevert(abi.encodeWithSelector(DoctorStatusOracle.DoctorDoesNotExist.selector, doctor1));
        oracle.toggleDoctorStatus(doctor1);
    }

    function test_toggleDoctorStatus_revert_if_not_admin() public {
        oracle.addDoctor(doctor1);

        vm.prank(unauthorizedUser);
        vm.expectRevert(DoctorStatusOracle.OnlyAdmin.selector);
        oracle.toggleDoctorStatus(doctor1);
    }

    function test_isDoctorActive_returns_false_for_nonexistent_doctor() public view {
        assertFalse(oracle.isDoctorActive(doctor1));
    }

    function test_isDoctorActive_returns_true_for_active_doctor() public {
        oracle.addDoctor(doctor1);
        assertTrue(oracle.isDoctorActive(doctor1));
    }

    function test_isDoctorActive_returns_false_for_suspended_doctor() public {
        oracle.addDoctor(doctor1);
        oracle.toggleDoctorStatus(doctor1);
        assertFalse(oracle.isDoctorActive(doctor1));
    }

    function test_getDoctorInfo_returns_correct_info() public {
        oracle.addDoctor(doctor1);

        DoctorStatusOracle.DoctorInfo memory info = oracle.getDoctorInfo(doctor1);
        assertTrue(info.active);
        assertEq(info.lastUpdated, block.timestamp);
    }

    function test_getDoctorInfo_returns_empty_for_nonexistent_doctor() public view {
        DoctorStatusOracle.DoctorInfo memory info = oracle.getDoctorInfo(doctor1);
        assertFalse(info.active);
        assertEq(info.lastUpdated, 0);
    }

    function test_multiple_doctors_management() public {
        oracle.addDoctor(doctor1);
        oracle.addDoctor(doctor2);

        assertTrue(oracle.isDoctorActive(doctor1));
        assertTrue(oracle.isDoctorActive(doctor2));

        oracle.toggleDoctorStatus(doctor1);

        assertFalse(oracle.isDoctorActive(doctor1));
        assertTrue(oracle.isDoctorActive(doctor2));
    }

    function test_admin_immutable() public view {
        address adminAddress = oracle.admin();
        assertEq(adminAddress, admin);
    }

    function test_getAllDoctors_returns_empty_initially() public view {
        address[] memory doctors = oracle.getAllDoctors();
        assertEq(doctors.length, 0);
    }

    function test_getAllDoctors_returns_all_added_doctors() public {
        oracle.addDoctor(doctor1);
        oracle.addDoctor(doctor2);

        address[] memory doctors = oracle.getAllDoctors();
        assertEq(doctors.length, 2);
        assertEq(doctors[0], doctor1);
        assertEq(doctors[1], doctor2);
    }

    function test_getDoctorCount_returns_zero_initially() public view {
        assertEq(oracle.getDoctorCount(), 0);
    }

    function test_getDoctorCount_increases_with_doctors() public {
        assertEq(oracle.getDoctorCount(), 0);
        
        oracle.addDoctor(doctor1);
        assertEq(oracle.getDoctorCount(), 1);
        
        oracle.addDoctor(doctor2);
        assertEq(oracle.getDoctorCount(), 2);
    }

    function test_getAllDoctors_includes_suspended_doctors() public {
        oracle.addDoctor(doctor1);
        oracle.addDoctor(doctor2);
        
        // Suspend doctor1
        oracle.toggleDoctorStatus(doctor1);
        
        address[] memory doctors = oracle.getAllDoctors();
        assertEq(doctors.length, 2);
        assertEq(doctors[0], doctor1);
        assertEq(doctors[1], doctor2);
        
        // Verify statuses
        assertFalse(oracle.isDoctorActive(doctor1));
        assertTrue(oracle.isDoctorActive(doctor2));
    }
}
