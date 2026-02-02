// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/DoctorStatusOracle.sol";
import "../src/PrescriptionRegistry.sol";

contract DeployRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Step 1: Deploy DoctorStatusOracle (deployer becomes admin)
        DoctorStatusOracle oracle = new DoctorStatusOracle();
        console.log("DoctorStatusOracle deployed at:", address(oracle));
        console.log("Oracle admin:", oracle.admin());

        // Step 2: Deploy PrescriptionRegistry with oracle address
        PrescriptionRegistry registry = new PrescriptionRegistry(address(oracle));
        console.log("PrescriptionRegistry deployed at:", address(registry));

        vm.stopBroadcast();
    }
}
