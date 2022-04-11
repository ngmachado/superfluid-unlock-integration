// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "../interfaces/ILocker.sol";
import {ISuperfluid, ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

contract LockerMock is ILocker{

    event GrantKey(address indexed account, int96 flowRate);
    event CancelAndRefund(address indexed account);

    bool public revertGrantKey;
    bool public revertCancelAndRefund;

    function setReverts(bool grantKey, bool cancelAndRefund) external {
        revertGrantKey = grantKey;
        revertCancelAndRefund = cancelAndRefund;
    }

    function grantKey(address account, int96 flowRate) external {
        require(!revertGrantKey, "grantKey revert");
        emit GrantKey(account, flowRate);
    }

    function cancelAndRefund(address account) external {
        require(!revertCancelAndRefund, "cancelAndRefund revert");
        emit CancelAndRefund(account);
    }

    function createFlow(
        address host,
        address cfa,
        address token,
        address receiver,
        int96 flowRate
    ) external {
        ISuperfluid(host).callAgreement(
            IConstantFlowAgreementV1(cfa),
            abi.encodeWithSelector(
                    IConstantFlowAgreementV1(cfa).createFlow.selector,
                    ISuperToken(token),
                receiver,
                flowRate,
                new bytes(0)
            ),
            "0x"
        );
    }

}