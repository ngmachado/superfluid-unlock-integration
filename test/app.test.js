const { assert } = require("chai");
const { MIN_FLOWRATE } = require("./utils/constants");
const { deployTestEnv } = require("./utils/setTestEnv");
const f = require("./utils/helperFuncs");

const consolePrint = false;
let env;

before(async function () {
  env = await deployTestEnv();
  await f.mintAndUpgrade(env, env.accounts[0]);
  await f.mintAndUpgrade(env, env.accounts[1]);
  await f.mintAndUpgrade(env, env.accounts[2]);
});

describe("🧑‍🏭 AppLogic - Operations️", function () {
  it("#1.1 - (single sender) start stream to App then delete it", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    await f.createStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      MIN_FLOWRATE,
      consolePrint
    );

    await f.advTime();
    await f.deleteStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      consolePrint
    );
    await f.expectNoOutgoingStream(env, app.address, locker.address);
    await f.withdrawDustMoney(env, app, locker.address);
  });
  it("#1.2 - (single sender) create/update x2 and then delete it", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    await f.createStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      MIN_FLOWRATE,
      consolePrint
    );
    await f.advTime();
    await f.multiUpdateStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      ["5000000000000", "6000000000000"],
      consolePrint
    );
    await f.deleteStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      consolePrint
    );
    await f.expectNoOutgoingStream(env, app.address, locker.address);
  });
  it("#1.3 - (multi senders) stream to App then delete it", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    await f.createStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      MIN_FLOWRATE,
      consolePrint
    );

    await f.createStreamWithCheck(
      env,
      env.accounts[1],
      app.address,
      locker.address,
      "50000000000",
      consolePrint
    );

    await f.createStreamWithCheck(
      env,
      env.accounts[2],
      app.address,
      locker.address,
      "60000000000",
      consolePrint
    );

    await f.advTime(13600);

    await f.multiDeleteStreamWithCheck(
      env,
      [env.accounts[0], env.accounts[1], env.accounts[2]],
      app.address,
      locker.address,
      consolePrint
    );
    const flowAppToLocker = await f.getFlowRate(
      env,
      app.address,
      locker.address
    );
    assert.equal(
      flowAppToLocker.flowRate,
      "0",
      "stream to locker should be zero"
    );
    await f.expectNoOutgoingStream(env, app.address, locker.address);
  });
  it("#1.4 - (multi senders) create/updates and then delete it (small flows)", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    await f.createStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      MIN_FLOWRATE,
      consolePrint
    );
    await f.advTime();
    await f.multiUpdateStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      [
        MIN_FLOWRATE,
        MIN_FLOWRATE + 1,
        MIN_FLOWRATE + 2,
        MIN_FLOWRATE + 3,
        MIN_FLOWRATE + 2,
        MIN_FLOWRATE + 1,
        MIN_FLOWRATE,
      ],
      consolePrint
    );
    await f.deleteStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      consolePrint
    );
    await f.expectNoOutgoingStream(env, app.address, locker.address);
  });
  it("#1.5 - (multi senders) create/updates and then delete it ", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    await f.createStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      "10000000000001",
      consolePrint
    );
    await f.advTime();
    await f.multiUpdateStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      [
        "123420000000001",
        "423420000000001",
        "173420000000001",
        "11420000000001",
        "170014200000001",
        "9001234200000001",
      ],
      consolePrint
    );
    await f.deleteStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      consolePrint
    );
    await f.expectNoOutgoingStream(env, app.address, locker.address);
  });
});

describe("🚨 AppLogic - Reverts", function () {
  it("#2.1 - should not jailed if locker revert on termination callback", async () => {
    const locker = await env.factories.locker.deploy();
    await locker.setReverts(false, true);
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );

    await f.createStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      MIN_FLOWRATE,
      consolePrint
    );
    await f.advTime();
    await f.deleteStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      consolePrint
    );

    await f.expectNoOutgoingStream(env, app.address, locker.address);
  });
  it("#2.2 - flows to small should revert", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    const rightError = await f.expectedRevert(
      f.createStreamWithCheck(
        env,
        env.accounts[0],
        app.address,
        locker.address,
        MIN_FLOWRATE - 1
      ),
      "LowFlowRate()",
      false,
      true
    );
    assert.ok(rightError);
  });
  it("#2.3 - updating to small streams should revert", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    await f.createStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      MIN_FLOWRATE,
      consolePrint
    );
    const rightError = await f.expectedRevert(
      f.updateStreamWithCheck(
        env,
        env.accounts[0],
        app.address,
        locker.address,
        MIN_FLOWRATE - 1
      ),
      "LowFlowRate()",
      false,
      true
    );
    assert.ok(rightError);
    assert.notOk(
      await f.isAppJailed(env, app.address),
      "app jailed - after reverting stream"
    );
  });
});

describe("⌛️ AppLogic - Random Walk", function () {
  it("#3.1 - random walk updates", async () => {
    const locker = await env.factories.locker.deploy();
    await f.mintAndUpgrade(env, env.accounts[0], "10000");
    const { app } = await f.deployNewClone(
      env,
      env.tokens.daix.address,
      locker.address,
      MIN_FLOWRATE
    );
    await f.createStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      MIN_FLOWRATE,
      consolePrint
    );

    await f.advTime();
    // random walk updates
    for (let i = 0; i <= 50; i++) {
      const myNewFlow = Math.floor(
        Math.random() * (999999999999999 - MIN_FLOWRATE) + MIN_FLOWRATE
      );
      await f.updateStreamWithCheck(
        env,
        env.accounts[0],
        app.address,
        locker.address,
        myNewFlow.toString(),
        consolePrint
      );
      await f.advTime();
    }

    await f.deleteStreamWithCheck(
      env,
      env.accounts[0],
      app.address,
      locker.address,
      consolePrint
    );
    await f.expectNoOutgoingStream(env, app.address, locker.address);
    await f.withdrawDustMoney(env, app, locker.address);
  });
});
