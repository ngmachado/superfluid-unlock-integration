// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

interface ILocker {

    function expirationDuration() external returns(uint256);
    function keyPrice() external returns(uint256);
    function tokenAddress() external returns(address);

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