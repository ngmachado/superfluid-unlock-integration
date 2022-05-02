// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {ISuperfluid, SuperAppDefinitions, ISuperApp} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {AppLogic} from "./AppLogic.sol";

contract CloneFactory {

    event NewAppLogic(address indexed newApp, address host, address indexed acceptedToken, address indexed locker, uint96 minFlowRate);

    uint256 immutable configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
    SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP;

    AppLogic public appLogicImplementation;

    constructor(AppLogic _appLogicImplementation) {
        appLogicImplementation = _appLogicImplementation;
    }

    function deployNewApp(
        address host,
        address acceptedToken,
        address locker,
        uint96 minFlowRate
    )
        external
        returns(address)
    {
        address newAppClone = Clones.clone(address(appLogicImplementation));
        AppLogic(newAppClone).initialize(host, acceptedToken, locker, minFlowRate);
        ISuperfluid(host).registerAppByFactory(ISuperApp(newAppClone), configWord);
        emit NewAppLogic(newAppClone, host, acceptedToken, locker, minFlowRate);
        return newAppClone;
    }

}