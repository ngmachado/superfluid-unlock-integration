const { ethers } = require("hardhat");
module.exports = {
  ZERO_ADDRESS: "0x0000000000000000000000000000000000000000",
  MIN_FLOWRATE: 1000,
  CFA_ID: ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(
      "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
    )
  ),
};
