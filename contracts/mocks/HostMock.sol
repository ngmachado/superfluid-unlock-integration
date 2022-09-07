// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {ISuperfluid, ISuperToken, ISuperAgreement, ISuperApp} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import "../AppLogic.sol";

contract HostMock {

    ISuperAgreement public _mockCFA1;

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

    function call_beforeAgreementUpdated(
        AppLogic app,
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata ctx
    )
    external
    {
        app.beforeAgreementUpdated(
            superToken,
            agreementClass,
            agreementId,
            agreementData,
            ctx
        );
    }

    function call_afterAgreementUpdated(
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
        app.afterAgreementUpdated(
            superToken,
            agreementClass,
            agreementId,
            agreementData,
            cbdata,
            ctx
        );
    }

    function call_beforeAgreementTerminated(
        AppLogic app,
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata ctx
    )
    external
    {
        bytes memory result = app.beforeAgreementTerminated(
            superToken,
            agreementClass,
            agreementId,
            agreementData,
            ctx
        );
        //if failed we return empty
        if(result.length == 0) {
            require(false, "NotSuperToken() | NotCFAv1()");
        }
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
        bytes memory result = app.afterAgreementTerminated(
            superToken,
            agreementClass,
            agreementId,
            agreementData,
            cbdata,
            ctx
        );
        //if same size we are returning the same ctx we send
        if(result.length == ctx.length) {
            require(false, "NotSuperToken() | NotCFAv1()");
        }
    }

    function registerAppByFactory(ISuperApp app, uint256 configWord) external pure {
    }


    function setCFA1(address _cfaAddress) external {
        _mockCFA1 = ISuperAgreement(_cfaAddress);
    }

    function getAgreementClass(bytes32 /*agreementType*/) external view returns(ISuperAgreement agreementClass) {
        return _mockCFA1;
    }
}