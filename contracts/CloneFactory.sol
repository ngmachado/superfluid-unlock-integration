// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {ISuperfluid, SuperAppDefinitions, ISuperApp} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AppLogic} from "./AppLogic.sol";
//import {AppLogic2} from "./AppLogic2.sol";
//import {AppLogic3} from "./AppLogic3.sol";
import {Errors} from "./libs/Errors.sol";

//open ownable

contract CloneFactory {

    event NewAppLogic(address indexed newApp, address host, address indexed acceptedToken, address indexed locker, uint96 minFlowRate);

    uint256 immutable configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
    SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP;

    address public owner;
    AppLogic public appLogicImplementation;

    constructor(AppLogic _appLogicImplementation) {
        owner = msg.sender;
        appLogicImplementation = _appLogicImplementation;
    }

    function deployNewApp(
        address host,
        address acceptedToken,
        address locker,
        uint96 minFlowRate)
    external
    onlyOwner
    returns(address)
    {
        address newAppClone = Clones.clone(address(appLogicImplementation));
        AppLogic(newAppClone).initialize(host, acceptedToken, locker, minFlowRate);
        ISuperfluid(host).registerAppByFactory(ISuperApp(newAppClone), configWord);
        emit NewAppLogic(newAppClone, host, acceptedToken, locker, minFlowRate);
        return newAppClone;
    }

    modifier onlyOwner {
        if(msg.sender != owner) revert Errors.NotOwner();
        _;
    }
}