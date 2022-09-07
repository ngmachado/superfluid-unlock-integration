const { ethers, network } = require("hardhat");
const AppLogicABI = require("../../artifacts/contracts/AppLogic.sol/AppLogic.json");
const { assert } = require("chai");
const BN = require("bn.js");

const expectedRevert = async (
  fn,
  revertMsg,
  printError = false,
  nestedError = false
) => {
  try {
    await fn;
    return false;
  } catch (err) {
    if (printError) console.log(err);
    if (nestedError) {
      return err.errorObject.errorObject.error.toString().includes(revertMsg);
    }
    return err.toString().includes(revertMsg);
  }
};

const deployNewClone = async (
  env,
  lockerAddress,
  owner = env.defaultDeployer
) => {
  const tx = await env.factories.clone
    .connect(owner)
    .deployNewApp(lockerAddress);
  const rc = await tx.wait();
  const event = rc.events.find((event) => event.event === "NewAppLogic");
  return {
    app: new ethers.Contract(event.args.newApp, AppLogicABI.abi, owner),
    event: {
      newApp: event.args.newApp,
      host: event.args.host,
      locker: event.args.locker,
    },
  };
};

const deployNewCloneWithMockHost = async (
    env,
    lockerAddress,
    owner = env.defaultDeployer
) => {
  const tx = await env.mocks.clone
      .connect(owner)
      .deployNewApp(lockerAddress);
  const rc = await tx.wait();
  const event = rc.events.find((event) => event.event === "NewAppLogic");
  return {
    app: new ethers.Contract(event.args.newApp, AppLogicABI.abi, owner),
    event: {
      newApp: event.args.newApp,
      host: event.args.host,
      locker: event.args.locker,
    },
  };
};

const mintAndUpgrade = async (env, account, amount = "1000") => {
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

const getFlowRate = async (env, sender, receiver) => {
  return await env.sf.cfaV1.getFlow({
    superToken: env.tokens.daix.address,
    sender: sender,
    receiver: receiver,
    providerOrSigner: env.accounts[0],
  });
};

const expectNoOutgoingStream = async (env, sender, receiver) => {
  const flow = await getFlowRate(env, sender, receiver);
  assert.equal(
    flow.flowRate,
    "0",
    `sender: ${sender} , receiver: ${receiver} is sending flowRate: ${flow.flowRate}`
  );
};

const expectZeroBalance = async (env, account) => {
  const balance = await env.tokens.daix.balanceOf({
    account: account,
    providerOrSigner: env.accounts[0],
  });
  assert.equal(
    balance.toString(),
    "0",
    `account: ${account} not zero balance`
  );
};

const createStreamWithCheck = async (
  env,
  account,
  receiver,
  lockerAddress,
  flowRate,
  consolePrint = false
) => {
  const createFlowOperation = env.sf.cfaV1.createFlow({
    receiver: receiver,
    superToken: env.tokens.daix.address,
    flowRate: flowRate,
  });

  await createFlowOperation.exec(account);

  const flowUserToApp = await getFlowRate(env, account.address, receiver);
  const flowAppToLocker = await getFlowRate(env, receiver, lockerAddress);
  const senderClippedFlow = toBN(flowRate);
  assert.isAtLeast(
    Number(flowAppToLocker.flowRate),
    Number(senderClippedFlow),
    "Locker should receive at least the clipped flow"
  );

  const r = {
    sender: account.address,
    receiver: receiver,
    locker: lockerAddress,
    fromSender: flowUserToApp,
    toLocker: flowAppToLocker,
  };
  if (consolePrint) {
    console.log(r);
  }
  return r;
};

const updateStreamWithCheck = async (
  env,
  account,
  receiver,
  lockerAddress,
  flowRate,
  consolePrint = false
) => {
  const updateFlowOperation1 = env.sf.cfaV1.updateFlow({
    receiver: receiver,
    superToken: env.tokens.daix.address,
    flowRate: flowRate,
  });
  await updateFlowOperation1.exec(account);
  assert.notOk(
    await isAppJailed(env, receiver),
    "app jailed - after updating stream"
  );
  const flowUserToApp = await getFlowRate(env, account.address, receiver);
  const flowAppToLocker = await getFlowRate(env, receiver, lockerAddress);
  const senderClippedFlow = toBN(flowRate);
  assert.isAtLeast(
    Number(flowAppToLocker.flowRate),
    Number(senderClippedFlow),
    "Locker should receive at least the clipped flow"
  );
  assert.equal(
    flowUserToApp.flowRate,
    flowRate,
    "sender not streaming right amount"
  );
  assert.notEqual(flowAppToLocker.flowRate, "0", "locker not receiving stream");
  const r = {
    sender: account.address,
    receiver: receiver,
    locker: lockerAddress,
    fromSender: flowUserToApp,
    toLocker: flowAppToLocker,
  };
  if (consolePrint) {
    console.log(`updateStreamWithCheck: flowRate: ${flowRate}`);
    console.log(r);
  }
  return r;
};

const multiUpdateStreamWithCheck = async (
  env,
  account,
  receiver,
  lockerAddress,
  arrFlowRates,
  consolePrint = false
) => {
  if (arrFlowRates.length === 0) throw Error("empty array");
  for (const flow of arrFlowRates) {
    await updateStreamWithCheck(
      env,
      account,
      receiver,
      lockerAddress,
      flow,
      consolePrint
    );
    await advTime();
  }
};

const deleteStreamWithCheck = async (
  env,
  account,
  receiver,
  lockerAddress,
  consolePrint = false
) => {
  const flowUserToAppBefore = await getFlowRate(env, account.address, receiver);
  const clippedSenderFlow = toBN(flowUserToAppBefore.flowRate);
  const flowAppToLockerBefore = await getFlowRate(env, receiver, lockerAddress);
  const finalAppToLockerFlow = toBN(flowAppToLockerBefore.flowRate).sub(clippedSenderFlow);
  const deleteFlowOperation = env.sf.cfaV1.deleteFlow({
    sender: account.address,
    receiver: receiver,
    superToken: env.tokens.daix.address,
  });
  await deleteFlowOperation.exec(account);
  assert.equal(
    await isAppJailed(env, receiver),
    false,
    "app jailed - after deleting stream"
  );
  const flowUserToApp = await getFlowRate(env, account.address, receiver);
  const flowAppToLocker = await getFlowRate(env, receiver, lockerAddress);

  assert.equal(flowUserToApp.flowRate, "0", "sender stream not deleted");
  assert.equal(
    flowAppToLocker.flowRate.toString(),
    finalAppToLockerFlow.toString(),
    "stream deletion didn't update outgoing stream"
  );
  const r = {
    sender: account.address,
    receiver: receiver,
    locker: lockerAddress,
    fromSender: flowUserToApp,
    toLocker: flowAppToLocker,
  };
  if (consolePrint) {
    console.log(r);
  }
  return r;
};

const multiDeleteStreamWithCheck = async (
  env,
  arrAccounts,
  receiver,
  lockerAddress,
  consolePrint = false
) => {
  if (arrAccounts.length === 0) throw Error("empty array");
  for (const account of arrAccounts) {
    await deleteStreamWithCheck(
      env,
      account,
      receiver,
      lockerAddress,
      consolePrint
    );
  }
};

const withdrawDustMoney = async (env, app, locker) => {
  const appBalance = await env.tokens.daix.balanceOf({
    account: app.address,
    providerOrSigner: env.accounts[0],
  });
  const balance = await env.tokens.daix.balanceOf({
    account: locker,
    providerOrSigner: env.accounts[0],
  });
  await app.connect(env.accounts[0]).withdraw();
  const appBalanceAfter = await env.tokens.daix.balanceOf({
    account: locker,
    providerOrSigner: env.accounts[0],
  });
  if (appBalance !== "0") {
    assert.isAbove(
      Number(appBalanceAfter),
      Number(balance),
      "locker should get tokens"
    );
  }
};

const getRTB = async (env, account) => {
  const blockNumBefore = await ethers.provider.getBlockNumber();
  const timestampBefore = (await ethers.provider.getBlock(blockNumBefore))
    .timestamp;
  return await env.tokens.daix.realtimeBalanceOf({
    account: account,
    timestamp: timestampBefore,
    providerOrSigner: env.accounts[0],
  });
};

const isAppJailed = async (env, app) => {
  return env.host.isAppJailed(app);
};
const advTime = async (seconds = 3600) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};
//TODO: remove and refactor
const clip96x32 = (a) => {
  const _a = new BN(a);
  //return _a.shrn(32).shln(32);
  return _a;
};

const toBN = (a) => {
  return new BN(a);
}

module.exports = {
  expectedRevert,
  deployNewClone,
  deployNewCloneWithMockHost,
  mintAndUpgrade,
  getFlowRate,
  expectNoOutgoingStream,
  expectZeroBalance,
  createStreamWithCheck,
  updateStreamWithCheck,
  multiUpdateStreamWithCheck,
  deleteStreamWithCheck,
  multiDeleteStreamWithCheck,
  withdrawDustMoney,
  getRTB,
  isAppJailed,
  advTime,
  clip96x32,
  toBN,
};
