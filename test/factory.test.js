const { assert } = require("chai");
const { ethers } = require("hardhat");
const { ZERO_ADDRESS, MIN_FLOWRATE } = require("./utils/constants");
const { deployTestEnv } = require("./utils/setTestEnv");
const { expectedRevert } = require("./utils/helperFuncs");

const AppLogicABI = require("./../artifacts/contracts/AppLogic.sol/AppLogic.json");

const deployNewClone = async (
  superTokenAddress,
  lockerAddress,
  minFlow,
  host = env.sf.settings.config.hostAddress,
  owner = env.defaultDeployer
) => {
  const tx = await env.factories.clone
    .connect(owner)
    .deployNewApp(host, superTokenAddress, lockerAddress, minFlow);
  const rc = await tx.wait();
  const event = rc.events.find((event) => event.event === "NewAppLogic");
  return {
    app: new ethers.Contract(event.args.newApp, AppLogicABI.abi, owner),
    event: {
      newApp: event.args.newApp,
      host: event.args.host,
      acceptedToken: event.args.acceptedToken,
      locker: event.args.locker,
      minFlowRate: event.args.minFlowRate,
    },
  };
};

before(async function () {
  env = await deployTestEnv();
});
describe("Factory", function () {
  it("#1 - deploy app from Factory", async () => {
    const locker = await env.factories.locker.deploy();
    let rightError = await expectedRevert(
      deployNewClone(env.tokens.daix.address, locker.address, 0, ZERO_ADDRESS),
      "HostRequired()"
    );
    assert.ok(rightError);
    rightError = await expectedRevert(
      deployNewClone(ZERO_ADDRESS, locker.address, 0),
      "SuperTokenRequired()"
    );
    assert.ok(rightError);
    rightError = await expectedRevert(
      deployNewClone(env.tokens.daix.address, ZERO_ADDRESS, 0),
      "LockerRequired()"
    );
    assert.ok(rightError);
    rightError = await expectedRevert(
      deployNewClone(env.tokens.daix.address, locker.address, 0),
      "LowFlowRate()"
    );
    assert.ok(rightError);
    await deployNewClone(env.tokens.daix.address, locker.address, MIN_FLOWRATE);
  });
  it("#1.1 - deploy app and re-run initialize", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    const rightError = await expectedRevert(
      app.initialize(
        env.sf.settings.config.hostAddress,
        env.tokens.daix.address,
        locker.address,
        100
      ),
      "Initializable: contract is already initialized"
    );
    assert.ok(rightError);
  });
  it("#1.2 - revert of not owner of factory", async () => {
    const locker = await env.factories.locker.deploy();
    const rightError = await expectedRevert(
      deployNewClone(
        env.tokens.daix.address,
        locker.address,
        0,
        env.sf.settings.config.hostAddress,
        env.accounts[1]
      ),
      "NotOwner()"
    );
    assert.ok(rightError);
  });
  it("#1.3 - Callback from wrong host", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      4294967296
    );
    await env.mocks.host.setMyCtxStamp("0x01");
    const rightError = await expectedRevert(
      env.mocks.host.call_afterAgreementCreated(
        app.address,
        env.tokens.daix.address,
        env.sf.settings.config.cfaV1Address,
        ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(
            "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
          )
        ),
        "0x",
        "0x",
        "0x01"
      ),
      "NotHost()"
    );
    assert.ok(rightError);
  });
  it("#1.4 - Callback with wrong data", async () => {
    const locker = await env.factories.locker.deploy();
    await env.mocks.host.setMyCtxStamp("0x01");
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE,
      env.mocks.host.address
    );
    let rightError = await expectedRevert(
      env.mocks.host.call_afterAgreementCreated(
        app.address,
        env.tokens.daix.address,
        env.sf.settings.config.cfaV1Address,
        ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(
            "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
          )
        ),
        "0x",
        "0x",
        "0x02"
      ),
      "InvalidCtx()"
    );
    assert.ok(rightError);
    rightError = await expectedRevert(
      env.mocks.host.call_afterAgreementCreated(
        app.address,
        app.address,
        env.sf.settings.config.cfaV1Address,
        ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(
            "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
          )
        ),
        "0x",
        "0x",
        "0x01"
      ),
      "NotSuperToken()"
    );
    assert.ok(rightError);
    rightError = await expectedRevert(
      env.mocks.host.call_afterAgreementCreated(
        app.address,
        env.tokens.daix.address,
        env.mocks.cfa.address,

        ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(
            "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
          )
        ),
        "0x",
        "0x",
        "0x01"
      ),
      "NotCFAv1()"
    );
    assert.ok(rightError);
  });
  it("#1.5 - Callback termination wrong data", async () => {
    const locker = await env.factories.locker.deploy();
    await env.mocks.host.setMyCtxStamp("0x01");
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE,
      env.mocks.host.address
    );

    await env.mocks.host.call_afterAgreementTerminated(
      app.address,
      env.tokens.daix.address,
      env.sf.settings.config.cfaV1Address,
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(
          "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
        )
      ),
      "0x",
      "0x",
      "0x02"
    );

    await env.mocks.host.call_afterAgreementTerminated(
      app.address,
      env.tokens.dai.address,
      env.sf.settings.config.cfaV1Address,
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(
          "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
        )
      ),
      "0x",
      "0x",
      "0x01"
    );

    await env.mocks.host.call_afterAgreementTerminated(
      app.address,
      env.tokens.dai.address,
      env.mocks.host.address,
      ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(
          "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
        )
      ),
      "0x",
      "0x",
      "0x01"
    );
  });
});
