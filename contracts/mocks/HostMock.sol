// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {ISuperfluid, ISuperToken, ISuperAgreement, ISuperApp} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import "../AppLogic.sol";

contract HostMock {

    bytes myCtxStamp;

    function setMyCtxStamp(bytes calldata ctx) external {
        myCtxStamp = ctx;
    }

    function call_afterAgreementCreated(
        AppLogic app,
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata cbdata,
        bytes calldata ctx
    )
    external
    {
    app.afterAgreementCreated(
        superToken,
        agreementClass,
        agreementId,
        agreementData,
        cbdata,
        ctx
    );
    }

    function call_afterAgreementTerminated(
        AppLogic app,
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata cbdata,
        bytes calldata ctx
    )
    external
    {
        app.afterAgreementTerminated(
            superToken,
            agreementClass,
            agreementId,
            agreementData,
            cbdata,
            ctx
        );
    }

    function registerAppByFactory(ISuperApp app, uint256 configWord) external pure {
    }
    function getAgreementClass(bytes32 agreementType) external pure returns(ISuperAgreement agreementClass) {
        return ISuperAgreement(address(0));
    }
    function isCtxValid(bytes calldata ctx) external view returns (bool) {
        bytes memory a = ctx;
        return keccak256(ctx) == keccak256(myCtxStamp);
    }
}