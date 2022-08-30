// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ISuperfluid, ISuperToken, ISuperAgreement } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";
import {ILocker} from "./interfaces/ILocker.sol";
import {Errors} from "./libs/Errors.sol";

// SuperApp which forwards all streams of a specific SuperToken to a specific Locker contract
contract AppLogic is SuperAppBase, Initializable {

    using CFAv1Library for CFAv1Library.InitData;

    CFAv1Library.InitData public cfaV1Lib;
    ISuperToken public acceptedToken;
    uint96 public minFlowRate;
    ILocker public locker;
    bytes32 constant public CFA_ID = keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");

    event LockerCloseNotificationFailed(address indexed locker);

    modifier onlyHost() {
        if(msg.sender != address(cfaV1Lib.host)) revert Errors.NotHost();
        _;
    }

    modifier onlyExpected(ISuperToken superToken, address agreementClass) {
        if(!_isSameToken(superToken)) revert Errors.NotSuperToken();
        if(!_isCFAv1(agreementClass)) revert Errors.NotCFAv1();
        _;
    }

    function initialize(
        address _host,
        address _locker,
    )
        external
        initializer
    {
        if(_host == address(0)) revert Errors.HostRequired();
        if(_locker == address(0)) revert Errors.LockerRequired();

        cfaV1Lib = CFAv1Library.InitData(
            ISuperfluid(_host),
            IConstantFlowAgreementV1(
                address(ISuperfluid(_host).getAgreementClass(CFA_ID))
            )
        );
        
        locker = ILocker(_locker);
        acceptedToken = ISuperToken(locker.tokenAddress);
        syncPrice();
    }

    // calculating minFlowRate based on lock price divided by duration
    function syncPrice() public {
        minFlowRate = locker.keyPrice / locker.expirationDuration; 
    }

    // tranfers all tokens held by this contract (this is just a fallback, usually not needed)
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
        bytes calldata /*cbdata*/,
        bytes calldata ctx
    )
    external override
        onlyHost
        onlyExpected(superToken, agreementClass)
        returns (bytes memory newCtx)
    {
        (address sender,) = abi.decode(agreementData, (address, address));
        int96 flowRate = _getFlowRateByID(agreementId);
        if(uint96(flowRate) < minFlowRate) revert Errors.LowFlowRate();
        newCtx = _increaseFlowBy(flowRate, ctx);
        locker.grantKeys(_getAddressAsArray(sender), _getUint256AsArray(type(uint256).max), _getAddressAsArray(address(this)));
    }

    function beforeAgreementUpdated(
        ISuperToken /*superToken*/,
        address /*agreementClass*/,
        bytes32 agreementId,
        bytes calldata /*agreementData*/,
        bytes calldata /*ctx*/
    )
        external override
        view
        returns (bytes memory cbdata)
    {
        return abi.encode(_getFlowRateByID(agreementId));
    }

    function afterAgreementUpdated(
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata /*agreementData*/,
        bytes calldata cbdata,
        bytes calldata ctx
    )
        external override
        onlyHost
        onlyExpected(superToken, agreementClass)
        returns (bytes memory newCtx)
    {
        int96 oldFlowRate = abi.decode(cbdata, (int96));
        int96 newFlowRate = _getFlowRateByID(agreementId);
        if(uint96(newFlowRate) < minFlowRate) revert Errors.LowFlowRate();
        if(newFlowRate > oldFlowRate) {
            return _increaseFlowBy(newFlowRate - oldFlowRate, ctx);
        } else {
            return _reduceFlowBy(oldFlowRate - newFlowRate, ctx);
        }
    }

    function beforeAgreementTerminated(
        ISuperToken superToken,
        address agreementClass,
        bytes32 agreementId,
        bytes calldata /*agreementData*/,
        bytes calldata /*ctx*/
    )
        external
        view
        override
        onlyHost
        returns (bytes memory cbdata)
    {
        if (!_isSameToken(superToken) || !_isCFAv1(agreementClass) ) {
            return "";
        }
        return abi.encode(_getFlowRateByID(agreementId));
    }

    function afterAgreementTerminated(
        ISuperToken superToken,
        address agreementClass,
        bytes32 /*agreementId*/,
        bytes calldata agreementData,
        bytes calldata cbdata,
        bytes calldata ctx
    )
        external override
        onlyHost
        returns (bytes memory newCtx)
    {
        if (!_isSameToken(superToken) || !_isCFAv1(agreementClass)) {
            return ctx;
        }
        newCtx = _reduceFlowBy(abi.decode(cbdata, (int96)), ctx);
        (address sender,) = abi.decode(agreementData, (address, address));
        try locker.expireAndRefundFor(sender, 0) {
        } catch {
            emit LockerCloseNotificationFailed(address(locker));
        }
        // CAUTION: Don't add any logic after this external call to the Locker contract!
        // If it were to run out of gas, that could cause this call to run out of gas too
        // which could cause the App to be jailed if exhausting the SF callback gas limit
    }

    /// Fallback in case locker.expireAndRefund() failed in the termination callback
    function expireAndRefundFor(address sender) external {
        (, int96 flowRateToLocker , ,) = cfaV1Lib.cfa.getFlow(acceptedToken, sender, address(this));
        if(flowRateToLocker == 0) {
            locker.expireAndRefundFor(sender, 0);
        }
    }

    /**************************************************************************
     * Internal helper functions
     *************************************************************************/

    function _getFlowRateByID(bytes32 agreementId) internal view returns(int96 flowRate) {
        (,flowRate , ,) = cfaV1Lib.cfa.getFlowByID(acceptedToken, agreementId);
    }

    // reduce outgoing stream, close stream if needed
    function _reduceFlowBy(int96 amount, bytes memory ctx) internal returns(bytes memory newCtx) {
        (, int96 flowRateToLocker , ,) = cfaV1Lib.cfa.getFlow(acceptedToken, address(this), address(locker));
        int96 newFlowRate = flowRateToLocker - amount;
        if(newFlowRate <= 0) {
            return cfaV1Lib.deleteFlowWithCtx(ctx, address(this), address(locker), acceptedToken);
        } else {
            return cfaV1Lib.updateFlowWithCtx(ctx, address(locker), acceptedToken, newFlowRate);
        }
    }
    // increase outgoing stream, open stream if needed
    function _increaseFlowBy(int96 amount, bytes memory ctx) internal returns(bytes memory newCtx) {
        (, int96 flowRateToLocker , ,) = cfaV1Lib.cfa.getFlow(acceptedToken, address(this), address(locker));
        if(flowRateToLocker == 0) {
            //locker is not getting a stream, open one
            return cfaV1Lib.createFlowWithCtx(ctx, address(locker), acceptedToken, amount);
        } else {
            //note: this will revert in the case of a overflow
            return cfaV1Lib.updateFlowWithCtx(ctx, address(locker), acceptedToken, (flowRateToLocker + amount));
        }
    }

    function _isSameToken(ISuperToken superToken) private view returns (bool) {
        return address(superToken) == address(acceptedToken);
    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return ISuperAgreement(agreementClass).agreementType() == CFA_ID;
    }

    function _getAddressAsArray(address addr) private pure returns(address[] memory) {
        address[] memory arr = new address[](1);
        arr[0] = addr;
        return arr;
    }

    function _getUint256AsArray(uint256 num) private pure returns(uint256[] memory) {
        uint256[] memory arr = new uint256[](1);
        arr[0] = num;
        return arr;
    }
}