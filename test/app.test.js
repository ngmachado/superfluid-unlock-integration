const { assert } = require("chai");
const { ethers, network } = require("hardhat");
const { deployTestEnv } = require("./utils/setTestEnv");
const { expectedRevert } = require("./utils/helperFuncs");

const AppLogicABI = require("./../artifacts/contracts/AppLogic.sol/AppLogic.json");

let env;

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

const isAppJailed = async (app) => {
  return env.host.isAppJailed(app);
};

const mintAndUpgrade = async (account, amount = "1000") => {
  await env.tokens.dai.mint(
    account.address,
    ethers.utils.parseUnits(amount, 18)
  );
  await env.tokens.dai
    .connect(account)
    .approve(env.tokens.daix.address, ethers.utils.parseEther(amount));
  const daixUpgradeOperation = env.tokens.daix.upgrade({
    amount: ethers.utils.parseEther(amount),
  });
  await daixUpgradeOperation.exec(account);
};

const getFlowRate = async (sender, receiver) => {
  return await env.sf.cfaV1.getFlow({
    superToken: env.tokens.daix.address,
    sender: sender,
    receiver: receiver,
    providerOrSigner: env.accounts[0],
  });
};

const expectNoOutgoingStream = async (sender, receiver) => {
  const flow = await getFlowRate(sender, receiver);
  assert.equal(
    flow.flowRate,
    "0",
    `sender: ${sender} , receiver: ${receiver} is sending flowRate: ${flow.flowRate}`
  );
};

const createStreamWithCheck = async (
  account,
  receiver,
  lockerAddress,
  flowRate
) => {
  const createFlowOperation = env.sf.cfaV1.createFlow({
    receiver: receiver,
    superToken: env.tokens.daix.address,
    flowRate: flowRate,
  });
  await createFlowOperation.exec(account);
  assert.notOk(
    await isAppJailed(receiver),
    "app jailed - after creating stream"
  );
  const flowUserToApp = await getFlowRate(account.address, receiver);
  const flowAppToLocker = await getFlowRate(receiver, lockerAddress);
  assert.equal(flowUserToApp.flowRate, flowRate, "sender not streaming");
  assert.notEqual(flowAppToLocker.flowRate, "0", "locker not receiving stream");
  return {
    fromSender: flowUserToApp,
    toLocker: flowAppToLocker,
  };
};

const updateStreamWithCheck = async (account, receiver, lockerAddress, flowRate) => {
  const updateFlowOperation1 = env.sf.cfaV1.updateFlow({
    receiver: receiver,
    superToken: env.tokens.daix.address,
    flowRate: flowRate,
  });
  await updateFlowOperation1.exec(account);
  assert.notOk(
    await isAppJailed(receiver),
    "app jailed - after updating stream"
  );
  const flowUserToApp = await getFlowRate(account.address, receiver);
  const flowAppToLocker = await getFlowRate(receiver, lockerAddress);
  assert.equal(flowUserToApp.flowRate, flowRate, "sender not streaming right amount");
  assert.notEqual(flowAppToLocker.flowRate, "0", "locker not receiving stream");
  return {
    fromSender: flowUserToApp,
    toLocker: flowAppToLocker,
  };
};

const deleteStreamWithCheck = async (account, receiver, lockerAddress) => {
  const flowAppToLockerBefore = await getFlowRate(receiver, lockerAddress);
  const deleteFlowOperation = env.sf.cfaV1.deleteFlow({
    sender: account.address,
    receiver: receiver,
    superToken: env.tokens.daix.address,
  });
  await deleteFlowOperation.exec(account);
  assert.equal(
    await isAppJailed(receiver),
    false,
    "app jailed - after deleting stream"
  );
  const flowUserToApp = await getFlowRate(account.address, receiver);
  const flowAppToLocker = await getFlowRate(receiver, lockerAddress);
  assert.equal(flowUserToApp.flowRate, "0", "sender stream not deleted");
  assert.isBelow(
    Number(flowAppToLocker.flowRate),
    Number(flowAppToLockerBefore.flowRate),
    "stream deletion didn't update outstream"
  );
  return {
    fromSender: flowUserToApp,
    toLocker: flowAppToLocker,
  };
};

const getRTB = async (account) => {
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const timestampBefore = (await ethers.provider.getBlock(blockNumBefore))
    .timestamp;
  return await env.tokens.daix.realtimeBalanceOf({
    account: account,
    timestamp: timestampBefore,
    providerOrSigner: env.accounts[0],
  });
};

const advTime = async (seconds=3600) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};

before(async function () {
  env = await deployTestEnv();
  await mintAndUpgrade(env.accounts[0]);
  await mintAndUpgrade(env.accounts[1]);
  await mintAndUpgrade(env.accounts[2]);
});

describe("AppLogic", function () {
  it("#1 - start stream to App then delete it", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1000
    );
    console.log(await createStreamWithCheck(
      env.accounts[0],
      app.address,
      locker.address,
      "100000000"
    ));
    await advTime();
    console.log("RTB 🤖 : ", await getRTB(app.address));
    console.log(await deleteStreamWithCheck(env.accounts[0], app.address, locker.address));
    await expectNoOutgoingStream(app.address, locker.address);
  });
  it("#2 - multi stream to App then delete it", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1000
    );
    await createStreamWithCheck(
      env.accounts[0],
      app.address,
      locker.address,
      "100000000"
    );
    await createStreamWithCheck(
      env.accounts[1],
      app.address,
      locker.address,
      "500000000"
    );
    await createStreamWithCheck(
      env.accounts[2],
      app.address,
      locker.address,
      "600000000"
    );
    await advTime(13600);
    await deleteStreamWithCheck(env.accounts[0], app.address, locker.address);
    console.log("RTB 🤖 : ", await getRTB(app.address));
    await deleteStreamWithCheck(env.accounts[1], app.address, locker.address);
    console.log("RTB 🤖 : ", await getRTB(app.address));
    await deleteStreamWithCheck(env.accounts[2], app.address, locker.address);
    console.log("RTB 🤖 : ", await getRTB(app.address));
    const flowAppToLocker = await getFlowRate(app.address, locker.address);
    assert.equal(
      flowAppToLocker.flowRate,
      "0",
      "stream to locker should be zero"
    );
    await expectNoOutgoingStream(app.address, locker.address);
  });
  it("#3 - create/update x2 and then delete it", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1000
    );
    await createStreamWithCheck(
      env.accounts[0],
      app.address,
      locker.address,
      "100000000"
    );
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address, "500000"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"600000000"));
    await advTime();
    console.log(await deleteStreamWithCheck(env.accounts[0], app.address, locker.address));
    await expectNoOutgoingStream(app.address, locker.address);
  });
  it("#x - create-multi updates and then delete it", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1000
    );
    await createStreamWithCheck(
      env.accounts[0],
      app.address,
      locker.address,
      "100000000"
    );
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"100000000"));
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address, "100000001"));
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"100000002"));
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"100000001"));
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"100000000"));
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address, "1000"));
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"100000000"));
    console.log(await deleteStreamWithCheck(env.accounts[0], app.address, locker.address));
    await expectNoOutgoingStream(app.address, locker.address);
  });
  it("#4 - should not jailed if locker revert on termination callback", async () => {
    const locker = await env.factories.locker.deploy();
    await locker.setReverts(false, true);
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1000
    );
    console.log(await createStreamWithCheck(
      env.accounts[0],
      app.address,
      locker.address,
      "100000000"
    ));
    await advTime();
    console.log("RTB 🤖 : ", await getRTB(app.address));
    console.log(await deleteStreamWithCheck(env.accounts[0], app.address, locker.address));
    await expectNoOutgoingStream(app.address, locker.address);
  });
  it("#5 - small value streams should revert", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1000
    );
    const rightError = await expectedRevert(
      createStreamWithCheck(env.accounts[0], app.address, locker.address, 999),
      "LowFlowRate()",
      false,
      true
    );
    assert.ok(rightError);
  });
  it("#6 - updating to small streams should revert", async () => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1000
    );
    await createStreamWithCheck(
      env.accounts[0],
      app.address,
      locker.address,
      "1000"
    );
    const rightError = await expectedRevert(
      updateStreamWithCheck(env.accounts[0], app.address, locker.address,"999"),
      "LowFlowRate()",
      false,
      true
    );
    assert.ok(rightError);
    assert.notOk(
      await isAppJailed(app.address),
      "app jailed - after reverting stream"
    );
  });
  it("#x - very low stream values", async() => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1
    );
    await createStreamWithCheck(
      env.accounts[0],
      app.address,
      locker.address,
      "1"
    );
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"2"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address, "3"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"2"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"1"));
    await advTime();
    console.log(await deleteStreamWithCheck(env.accounts[0], app.address, locker.address));
    await expectNoOutgoingStream(app.address, locker.address);
  });
  it("#x - very low multi accounts stream values", async() => {
    const locker = await env.factories.locker.deploy();
    const { app } = await deployNewClone(
      env.tokens.daix.address,
      locker.address,
      1
    );
    await createStreamWithCheck(env.accounts[0],app.address,locker.address,"1");
    await createStreamWithCheck(env.accounts[1],app.address,locker.address,"2");
    await createStreamWithCheck(env.accounts[2],app.address,locker.address,"3");
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"5"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[1], app.address, locker.address, "3"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[2], app.address, locker.address, "4"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[0], app.address, locker.address,"2"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[1], app.address, locker.address,"10"));
    await advTime();
    console.log(await updateStreamWithCheck(env.accounts[2], app.address, locker.address,"1"));
    await advTime();
    await deleteStreamWithCheck(env.accounts[0], app.address, locker.address);
    await advTime();
    await deleteStreamWithCheck(env.accounts[1], app.address, locker.address);
    await advTime();
    await deleteStreamWithCheck(env.accounts[2], app.address, locker.address);
    await advTime();
    console.log(await getFlowRate(env.accounts[0].address, app.address));
    console.log(await getFlowRate(env.accounts[1].address, app.address));
    console.log(await getFlowRate(env.accounts[2].address, app.address));
    console.log(await getFlowRate(app.address, locker.address));
    await expectNoOutgoingStream(app.address, locker.address);
  });
});
