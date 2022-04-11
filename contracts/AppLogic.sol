// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ISuperfluid, ISuperToken, ISuperAgreement } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import {ILocker} from "./interfaces/ILocker.sol";
import {Errors} from "./libs/Errors.sol";

contract AppLogic is SuperAppBase, Initializable {

    using CFAv1Library for CFAv1Library.InitData;

    event LockerCloseNotificationFailed(address indexed locker);

    CFAv1Library.InitData public cfaV1;
    ISuperfluid public host;
    IConstantFlowAgreementV1 public cfa;
    ISuperToken public acceptedToken;
    uint96 public minFlowRate;
    ILocker public locker;
    bytes32 constant public cfaID = keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
    mapping(address => int96) private _outFlows;

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
        bytes32, // agreementId,
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
        int96 flowRate = _getFlowRate(sender);
        if(uint96(flowRate) < minFlowRate) revert Errors.LowFlowRate();
        int96 outFlow = _min(
            flowRate,
                cfa.getMaximumFlowRateFromDeposit(
                    acceptedToken,
                        host.decodeCtx(ctx).appAllowanceGranted
                )
        );
        _outFlows[sender] = outFlow;
        newCtx = _increaseFlowBy(outFlow,ctx);
        locker.grantKey(sender, flowRate);
    }

    function afterAgreementUpdated(
        ISuperToken superToken,
        address agreementClass,
        bytes32, //agreementId,
        bytes calldata agreementData,
        bytes calldata, //cbdata,
        bytes calldata ctx
    )
    external override
    validCtx(ctx)
    onlyExpected(superToken, agreementClass)
    onlyHost
    returns (bytes memory newCtx)
    {
        (address sender,) = abi.decode(agreementData, (address, address));
        int96 newFlowRate = _getFlowRate(sender);
        if(uint96(newFlowRate) < minFlowRate) revert Errors.LowFlowRate();
        int96 maxAllowedFlowRate = _min(
            newFlowRate,
            cfa.getMaximumFlowRateFromDeposit(
                acceptedToken,
                host.decodeCtx(ctx).appAllowanceGranted
            )
        );
        int96 outFlow = _outFlows[sender];
        _outFlows[sender] = maxAllowedFlowRate;
        if(outFlow > maxAllowedFlowRate) {
            return _reduceFlowBy(outFlow - maxAllowedFlowRate, ctx);
        } else {
            return _increaseFlowBy(maxAllowedFlowRate - outFlow, ctx);
        }
    }

    function afterAgreementTerminated(
        ISuperToken superToken,
        address agreementClass,
        bytes32, //agreementId,
        bytes calldata agreementData,
        bytes calldata,// cbdata,
        bytes calldata ctx
    ) external
    override
    onlyHost
    returns (bytes memory newCtx)
    {
        if (!_isCtxValid(ctx) || !_isSameToken(superToken) || !_isCFAv1(agreementClass) )
            return ctx;
        (address sender,) = abi.decode(agreementData, (address, address));
        int96 outFlow = _outFlows[sender];
        delete _outFlows[sender];
        newCtx = _reduceFlowBy(outFlow, ctx);
        try locker.cancelAndRefund(sender) {
        } catch {
            emit LockerCloseNotificationFailed(address(locker));
        }
    }

    function _getFlowRate(address sender) internal view returns(int96 flowRate) {
        (, flowRate , ,) = cfa.getFlow(acceptedToken, sender, address(this));
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

    function _min(int96 a, int96 b) private pure returns(int96) {
        return a < b ? a : b;
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