// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/PrescriptionRegistry.sol";

contract DeployRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        PrescriptionRegistry registry = new PrescriptionRegistry();
        console.log("PrescriptionRegistry deployed at:", address(registry));

        vm.stopBroadcast();
    }
}
