// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

interface ILocker {
    function grantKey(address account, int96 flowRate) external;
    function cancelAndRefund(address account) external;
}