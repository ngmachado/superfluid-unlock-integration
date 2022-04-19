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
        if(_minFlowRate < 2**32) revert Errors.LowFlowRate();

        host = ISuperfluid(_host);
        cfa = IConstantFlowAgreementV1(
            address(host.getAgreementClass(cfaID))
        );
        acceptedToken = ISuperToken(_acceptedToken);
        locker = ILocker(_locker);
        minFlowRate = _minFlowRate;
        cfaV1 = CFAv1Library.InitData(host, cfa);
    }

    function withdraw() external {
        acceptedToken.transfer(
            address(locker),
            acceptedToken.balanceOf(address(this))
        );
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
    external override
    onlyHost
    validCtx(ctx)
    onlyExpected(superToken, agreementClass)
    returns (bytes memory newCtx)
    {
        (address sender,) = abi.decode(agreementData, (address, address));
        int96 flowRate = _getFlowRateByID(agreementId);
        if(uint96(flowRate) < minFlowRate) revert Errors.LowFlowRate();
        newCtx = _increaseFlowBy(_clip96x32(flowRate), ctx);
        locker.grantKey(sender, flowRate);
    }

    function beforeAgreementUpdated(
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata agreementData,
        bytes calldata ctx
    )
    external override
    onlyHost
    validCtx(ctx)
    onlyExpected(superToken, agreementClass)
    view
    returns (bytes memory cbdata)
    {
        return abi.encode(_clip96x32(_getFlowRateByID(agreementId)));
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
    onlyHost
    validCtx(ctx)
    onlyExpected(superToken, agreementClass)
    returns (bytes memory newCtx)
    {
        int96 clippedOldFlowRate = abi.decode(cbdata, (int96));
        int96 newFlowRate = _getFlowRateByID(agreementId);
        if(uint96(newFlowRate) < minFlowRate) revert Errors.LowFlowRate();
        int96 clippedNewFlowRate = _clip96x32(newFlowRate);
        if(clippedOldFlowRate > clippedNewFlowRate) {
            return _reduceFlowBy(clippedOldFlowRate - clippedNewFlowRate, ctx);
        } else {
            return _increaseFlowBy(clippedNewFlowRate - clippedOldFlowRate, ctx);
        }
    }

    function beforeAgreementTerminated(
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata /*agreementData*/,
        bytes calldata ctx
    )
    external
    view
    override
    onlyHost
    returns (bytes memory cbdata)
    {
        if (!_isCtxValid(ctx) || !_isSameToken(superToken) || !_isCFAv1(agreementClass) )
            return "";
        return abi.encode(_clip96x32(_getFlowRateByID(agreementId)));
    }

    function afterAgreementTerminated(
        ISuperToken superToken,
        address agreementClass,
        bytes32, //agreementId,
        bytes calldata agreementData,
        bytes calldata cbdata,
        bytes calldata ctx
    )
    external override
    onlyHost
    returns (bytes memory newCtx)
    {
        if (!_isCtxValid(ctx) || !_isSameToken(superToken) || !_isCFAv1(agreementClass) )
            return ctx;
        newCtx = _reduceFlowBy(abi.decode(cbdata, (int96)), ctx);
        (address sender,) = abi.decode(agreementData, (address, address));
        try locker.cancelAndRefund(sender) {
        } catch {
            emit LockerCloseNotificationFailed(address(locker));
        }
    }

    function _getFlowRateByID(bytes32 agreementId) internal view returns(int96 flowRate) {
        (,flowRate , ,) = cfa.getFlowByID(acceptedToken, agreementId);
    }

    function _clip96x32(int96 n) internal pure returns(int96 r) {
        r = ((n >> 32) << 32);
        assert(r != 0);
    }

    //reduce outgoing stream, close stream if needed
    function _reduceFlowBy(int96 amount, bytes memory ctx) internal returns(bytes memory newCtx) {
        (, int96 flowToLocker , ,) = cfa.getFlow(acceptedToken, address(this), address(locker));
        int96 amountToReduce = flowToLocker - amount;
        if(amountToReduce <= 0) {
            return cfaV1.deleteFlowWithCtx(ctx, address(this), address(locker), acceptedToken);
        }
        return cfaV1.updateFlowWithCtx(ctx, address(locker), acceptedToken, amountToReduce);
    }
    //increase outgoing stream, open stream if needed
    function _increaseFlowBy(int96 amount, bytes memory ctx) internal returns(bytes memory newCtx) {
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