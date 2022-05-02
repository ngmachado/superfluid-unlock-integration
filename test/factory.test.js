const { assert } = require("chai");
const { ethers } = require("hardhat");
const { ZERO_ADDRESS, MIN_FLOWRATE } = require("./utils/constants");
const { deployTestEnv } = require("./utils/setTestEnv");
const f = require("./utils/helperFuncs");
let env;

const anyAgreementId = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("anyAgreementId")
);
const anyAgreementData = "0x";
const anyCbData = "0x";
const anyCtx = "0x";

before(async function () {
  env = await deployTestEnv();
});

describe("⏬ Factory - Deployments", function () {
  it("#1.1 - deploy app from Factory", async () => {
    const locker = await env.factories.locker.deploy();
    let rightError = await f.expectedRevert(
      f.deployNewClone(
        env,
        env.tokens.daix.address,
        locker.address,
        MIN_FLOWRATE,
        ZERO_ADDRESS
      ),
      "HostRequired()"
    );
    assert.ok(rightError);
    rightError = await f.expectedRevert(
      f.deployNewClone(env, ZERO_ADDRESS, locker.address, MIN_FLOWRATE),
      "SuperTokenRequired()"
    );
    assert.ok(rightError);
    rightError = await f.expectedRevert(
      f.deployNewClone(
        env,
        env.tokens.daix.address,
        ZERO_ADDRESS,
        MIN_FLOWRATE
      ),
      "LockerRequired()"
    );
    assert.ok(rightError);
    await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
  });
  it("#1.2 - deploy app and re-run initialize", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    const rightError = await f.expectedRevert(
      app.initialize(
        env.sf.settings.config.hostAddress,
        env.tokens.daix.address,
        locker.address,
        MIN_FLOWRATE
      ),
      "Initializable: contract is already initialized"
    );
    assert.ok(rightError);
  });
});

describe("📣 Factory - Callbacks checks", function() {
  it("#2.1 - Callback from wrong host (afterAgreementCreated)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    const rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementCreated(
        app.address,
        env.tokens.daix.address,
        env.sf.settings.config.cfaV1Address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotHost()"
    );
    assert.ok(rightError);
  });
  it("#2.2 - Callback with wrong data (afterAgreementCreated)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE,
      env.mocks.host.address
    );
    let rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementCreated(
        app.address,
        app.address,
        env.sf.settings.config.cfaV1Address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotSuperToken()"
    );
    assert.ok(rightError);
    rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementCreated(
        app.address,
        env.tokens.daix.address,
        env.mocks.cfa.address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotCFAv1()"
    );
    assert.ok(rightError);
  });
  it("#2.5 - Callback from wrong host (afterAgreementUpdated)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    const rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementUpdated(
        app.address,
        env.tokens.daix.address,
        env.sf.settings.config.cfaV1Address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotHost()"
    );
    assert.ok(rightError);
  });
  it("#2.6 - Callback with wrong data (afterAgreementUpdated)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE,
      env.mocks.host.address
    );
    let rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementUpdated(
        app.address,
        app.address,
        env.sf.settings.config.cfaV1Address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotSuperToken()"
    );

    assert.ok(rightError);
    rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementUpdated(
        app.address,
        env.tokens.daix.address,
        env.mocks.cfa.address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotCFAv1()"
    );
    assert.ok(rightError);
  });
  it("#2.7 - Callback from wrong host (beforeAgreementTerminated)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    const rightError = await f.expectedRevert(
      env.mocks.host.call_beforeAgreementTerminated(
        app.address,
        env.tokens.daix.address,
        env.sf.settings.config.cfaV1Address,
        anyAgreementId,
        anyAgreementData,
        anyCtx
      ),
      "NotHost()"
    );
    assert.ok(rightError);
  });
  it("#2.8 - Callback with wrong data (beforeAgreementTerminated)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE,
      env.mocks.host.address
    );
    let rightError = await f.expectedRevert(
      env.mocks.host.call_beforeAgreementTerminated(
        app.address,
        app.address,
        env.sf.settings.config.cfaV1Address,
        anyAgreementId,
        anyAgreementData,
        anyCtx
      ),
      "NotSuperToken()"
    );

    assert.ok(rightError);
    rightError = await f.expectedRevert(
      env.mocks.host.call_beforeAgreementTerminated(
        app.address,
        env.tokens.daix.address,
        env.mocks.cfa.address,
        anyAgreementId,
        anyAgreementData,
        anyCtx
      ),
      "NotCFAv1()"
    );
    assert.ok(rightError);
  });
  it("#2.9 - Callback from wrong host (afterAgreementTerminated)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    const rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementTerminated(
        app.address,
        env.tokens.daix.address,
        env.sf.settings.config.cfaV1Address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotHost()"
    );
    assert.ok(rightError);
  });
  it("#2.10 - Callback with wrong data (afterAgreementTerminated)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE,
      env.mocks.host.address
    );
    let rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementTerminated(
        app.address,
        app.address,
        env.sf.settings.config.cfaV1Address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotSuperToken()"
    );

    assert.ok(rightError);
    rightError = await f.expectedRevert(
      env.mocks.host.call_afterAgreementTerminated(
        app.address,
        env.tokens.daix.address,
        env.mocks.cfa.address,
        anyAgreementId,
        anyAgreementData,
        anyCbData,
        anyCtx
      ),
      "NotCFAv1()"
    );
    assert.ok(rightError);
  });
});
