// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

library Errors {
    error NotHost();
    error NotCFAv1();
    error NotSuperToken();
    error HostRequired();
    error SuperTokenRequired();
    error LockerRequired();
    error LowFlowRate();
    error SafeCast();
}