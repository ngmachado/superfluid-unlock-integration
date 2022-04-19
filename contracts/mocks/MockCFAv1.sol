// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

contract MockCFAv1 {
    string _agreementTypeString;

    function agreementTypeString(string memory atype) external {
        _agreementTypeString = atype;
    }

    function agreementType() external view returns (bytes32) {
        return keccak256(abi.encode(_agreementTypeString));
    }
}