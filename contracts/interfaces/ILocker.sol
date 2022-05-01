// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

interface ILocker {

    function grantKeys(
        address[] calldata _recipients,
        uint[] calldata _expirationTimestamps,
        address[] calldata _keyManagers
    ) external;

    function expireAndRefundFor(
        address _keyOwner,
        uint amount
    ) external;
}