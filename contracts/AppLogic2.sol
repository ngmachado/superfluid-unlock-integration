// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ISuperfluid, ISuperToken, ISuperAgreement } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import {ILocker} from "./interfaces/ILocker.sol";
import {Errors} from "./libs/Errors.sol";

contract AppLogic2 is SuperAppBase, Initializable {

    using CFAv1Library for CFAv1Library.InitData;

    event LockerCloseNotificationFailed(address indexed locker);

    CFAv1Library.InitData public cfaV1;
    ISuperfluid public host;
    IConstantFlowAgreementV1 public cfa;
    ISuperToken public acceptedToken;
    uint96 public minFlowRate;
    ILocker public locker;
    bytes32 constant public cfaID = keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");

    function initialize(
        address _host,
        address _acceptedToken,
        address _locker,
        uint96 _minFlowRate
    )
    external
    initializer
    {

        if(_host == address(0)) revert Errors.HostRequired();
        if(_acceptedToken == address(0)) revert Errors.SuperTokenRequired();
        if(_locker == address(0)) revert Errors.LockerRequired();

        host = ISuperfluid(_host);
        cfa = IConstantFlowAgreementV1(
            address(host.getAgreementClass(cfaID))
        );
        acceptedToken = ISuperToken(_acceptedToken);
        locker = ILocker(_locker);
        minFlowRate = _minFlowRate;
        cfaV1 = CFAv1Library.InitData(host, cfa);
    }

    /**************************************************************************
     * SuperApp callbacks
     *************************************************************************/

    function afterAgreementCreated(
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata, // cbdata,
        bytes calldata ctx
    )
    external
    override
    onlyHost
    validCtx(ctx)
    onlyExpected(superToken, agreementClass)
    returns (bytes memory newCtx)
    {
        (address sender,) = abi.decode(agreementData, (address, address));
        int96 flowRate = _getFlowRateByID(agreementId);
        if(uint96(flowRate) < minFlowRate) revert Errors.LowFlowRate();
        newCtx = _increaseFlowBy(flowRate, ctx);
        locker.grantKey(sender, flowRate);
    }

    function beforeAgreementUpdated(
        ISuperToken /*superToken*/,
        address /*agreementClass*/,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata ctx
    )
    external
    view
    virtual
    override
    returns (bytes memory cbdata)
    {
        int96 flowRate = _getFlowRateByID(agreementId);
        return abi.encode(flowRate);
    }

    function afterAgreementUpdated(
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata cbdata,
        bytes calldata ctx
    )
    external override
    validCtx(ctx)
    onlyExpected(superToken, agreementClass)
    onlyHost
    returns (bytes memory newCtx)
    {
        int96 oldFlowRate = abi.decode(cbdata, (int96));
        int96 newFlowRate = _getFlowRateByID(agreementId);
        if(uint96(newFlowRate) < minFlowRate) revert Errors.LowFlowRate();
        if(oldFlowRate > newFlowRate) {
            return _reduceFlowBy(oldFlowRate - newFlowRate, ctx);
        } else {
            return _increaseFlowBy(newFlowRate - oldFlowRate, ctx);
        }
    }

    function beforeAgreementTerminated(
        ISuperToken /*superToken*/,
        address /*agreementClass*/,
        bytes32 agreementId,
        bytes calldata /*agreementData*/,
        bytes calldata /*ctx*/
    )
    external
    view
    virtual
    override
    returns (bytes memory cbdata)
    {
        //gets how much our outgoing flow is affect by this user before termination
        int96 flowRate = _getFlowRateByID(agreementId);
        return abi.encode(flowRate);
    }

    function afterAgreementTerminated(
        ISuperToken superToken,
        address agreementClass,
        bytes32, //agreementId,
        bytes calldata agreementData,
        bytes calldata cbdata,
        bytes calldata ctx
    ) external
    override
    onlyHost
    returns (bytes memory newCtx)
    {
        if (!_isCtxValid(ctx) || !_isSameToken(superToken) || !_isCFAv1(agreementClass) )
            return ctx;
        int96 oldFlowRate = abi.decode(cbdata, (int96));
        newCtx = _reduceFlowBy(oldFlowRate, ctx);
        (address sender,) = abi.decode(agreementData, (address, address));
        try locker.cancelAndRefund(sender) {
        } catch {
            emit LockerCloseNotificationFailed(address(locker));
        }
    }

    function _getFlowRateByID(bytes32 agreementId) internal view returns(int96 flowRate) {
        (,flowRate , ,) = cfa.getFlowByID(acceptedToken, agreementId);
    }

    //reduce outgoing stream, close stream if needed
    function _reduceFlowBy(int96 amount, bytes memory ctx) internal returns(bytes memory newCtx) {
        newCtx = ctx;
        (, int96 flowToLocker , ,) = cfa.getFlow(acceptedToken, address(this), address(locker));
        int96 amountToReduce = flowToLocker - amount;
        if(amountToReduce <= 0) {
            return cfaV1.deleteFlowWithCtx(ctx, address(this), address(locker), acceptedToken);
        }
        return cfaV1.updateFlowWithCtx(ctx, address(locker), acceptedToken, amountToReduce);
    }
    //increase outgoing stream, open stream if needed
    function _increaseFlowBy(int96 amount, bytes memory ctx) internal returns(bytes memory newCtx) {
        newCtx = ctx;
        (, int96 flowToLocker , ,) = cfa.getFlow(acceptedToken, address(this), address(locker));
        //locker is not getting a stream, open one
        if(flowToLocker == 0) {
            return cfaV1.createFlowWithCtx(ctx, address(locker), acceptedToken, amount);
        } else {
            //note: this will revert in the case of a overflow
            return cfaV1.updateFlowWithCtx(ctx, address(locker), acceptedToken, (flowToLocker + amount));
        }
    }

    function _isSameToken(ISuperToken superToken) private view returns (bool) {
        return address(superToken) == address(acceptedToken);
    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return ISuperAgreement(agreementClass).agreementType() == cfaID;
    }

    function _isCtxValid(bytes memory ctx) private view returns(bool) {
        return host.isCtxValid(ctx);
    }

    modifier onlyHost() {
        if(msg.sender != address(host)) revert Errors.NotHost();
        _;
    }

    modifier validCtx(bytes memory ctx) {
        if(!_isCtxValid(ctx)) revert Errors.InvalidCtx();
        _;
    }

    modifier onlyExpected(ISuperToken superToken, address agreementClass) {
        if(!_isSameToken(superToken)) revert Errors.NotSuperToken();
        if(!_isCFAv1(agreementClass)) revert Errors.NotCFAv1();
        _;
    }
}