// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "../interfaces/ILocker.sol";
import {ISuperfluid, ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

contract LockerMock is ILocker{

    event GrantKey(address indexed recipient, uint256 expirationTimestamp,  address keyManager);
    event ExpireAndRefundFor(address indexed keyOwner, uint256 amount);

    bool public revertGrantKey;
    bool public revertExpireAndRefundFor;

    function setReverts(bool fgrantKey, bool fexpireAndRefundFor) external {
        revertGrantKey = fgrantKey;
        revertExpireAndRefundFor = fexpireAndRefundFor;
    }

    function grantKeys(
        address[] calldata _recipients,
        uint[] calldata _expirationTimestamps,
        address[] calldata _keyManagers
    ) external {
        require(!revertGrantKey, "grantKeys revert");
        emit GrantKey(_recipients[0], _expirationTimestamps[0], _keyManagers[0]);
    }

    function expireAndRefundFor(address _keyOwner, uint amount) external {
        require(!revertExpireAndRefundFor, "expireAndRefundFor revert");
        emit ExpireAndRefundFor(_keyOwner, amount);
    }
}