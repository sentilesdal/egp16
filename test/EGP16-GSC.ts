import {
  mine,
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AddressLike, BytesLike } from "ethers";
import { targetsTimeLock, callDatasTimeLock } from "./gscTargetsAndCallDatas";

const addresses = {
  airdrop: "0xd04a459FFD3A5E3C93d5cD8BB13d26a9845716c2",
  coreVoting: "0xEaCD577C3F6c44C3ffA398baaD97aE12CDCFed4a",
  elementToken: "0x5c6D51ecBA4D8E4F20373e3ce96a62342B125D6d",
  gscCoreVoting: "0x40309f197e7f94B555904DF0f788a3F48cF326aB",
  gscVault: "0xcA870E8aa4FCEa85b5f0c6F4209C8CBA9265B940",
  lockingVault: "0x02Bd4A3b1b95b01F2Aa61655415A5d3EAAcaafdD",
  optimisticGrants: "0x0000000000000000000000000000000000000000",
  optimisticRewardsVault: "0x0000000000000000000000000000000000000000",
  spender: "0xDa2Baf34B5717b257e52039f78d02B9C58751781",
  timeLock: "0x81758f3361A769016eae4844072FA6d7f828a651",
  treasury: "0x82eF450FB7f06E3294F2f19ed1713b255Af0f541",
  vestingVault: "0x6De73946eab234F1EE61256F10067D713aF0e37A",
  frozenVestingVaultAddress: "0x716D4e863536aC862AD34bC4eCaCBa07d8831bEA",
  unfrozenVestingVaultAddress: "0x38dbc89Fc52948192843920E78c8B609474b60B4",
};

const ADDRESS_ONE = "0x0000000000000000000000000000000000000001";

describe("EGP16-GSC", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function getContracts() {
    const signer = await ethers.getImpersonatedSigner(ADDRESS_ONE);
    const coreVoting = (
      await ethers.getContractAt("CoreVoting", addresses.coreVoting)
    ).connect(signer);

    const timeLock = (
      await ethers.getContractAt("Timelock", addresses.timeLock)
    ).connect(signer);

    const lockingVault = await ethers.getContractAt(
      "LockingVault",
      addresses.lockingVault
    );

    const vestingVault = await ethers.getContractAt(
      "VestingVault",
      addresses.vestingVault
    );

    const vaults: AddressLike[] = [addresses.lockingVault];
    const extraData: BytesLike[] = ["0x"];

    const callHashTimelock = createCallHash(targetsTimeLock, callDatasTimeLock);

    const calldataCoreVoting = timeLock.interface.encodeFunctionData(
      "registerCall",
      [callHashTimelock]
    );
    const targetsCoreVoting: AddressLike[] = [addresses.timeLock];
    const calldatasCoreVoting: BytesLike[] = [calldataCoreVoting];
    const twoWeeksFromNow = 14 * 24 * 60 * 60 + Date.now();
    const currentBlock = BigInt(await signer.provider.getBlockNumber());
    const lastCall = BigInt(twoWeeksFromNow);
    const ballot = BigInt(0);

    const txResponse = await coreVoting
      .connect(signer)
      .proposal(
        vaults,
        extraData,
        targetsCoreVoting,
        calldatasCoreVoting,
        lastCall,
        ballot
      );
    const txReceipt = await txResponse.wait();

    if (!txReceipt) {
      throw Error("No transaction receipt");
    }

    const proposalCount = await coreVoting.proposalCount();
    const proposalId = proposalCount - 1n;
    let proposal = await coreVoting.proposals(proposalId);

    const proposalInfo = {
      proposalHash: proposal[0],
      created: proposal[1],
      unlock: proposal[2],
      expiration: proposal[3],
      quorum: proposal[4],
      lastCall: proposal[5],
    };

    return {
      coreVoting,
      timeLock,
      lockingVault,
      vestingVault,
      signer,
      currentBlock,
      proposalId,
      proposalInfo,
      callHashTimelock,
      targetsCoreVoting,
      calldatasCoreVoting,
    };
  }

  describe("Propsoal", function () {
    it("Should create the proposal", async function () {
      const {
        coreVoting,
        currentBlock,
        proposalId,
        targetsCoreVoting,
        calldatasCoreVoting,
      } = await loadFixture(getContracts);

      const expectedProposalHash = createCallHash(
        targetsCoreVoting,
        calldatasCoreVoting
      );
      let proposal = await coreVoting.proposals(proposalId);

      const proposalInfo = {
        created: proposal[1],
        proposalHash: proposal[0],
        unlock: proposal[2],
        expiration: proposal[3],
        quorum: proposal[4],
        lastCall: proposal[5],
      };

      const dayinblocks = await coreVoting.DAY_IN_BLOCKS();
      const nextBlock = currentBlock + 1n;
      const lockDuration = nextBlock + dayinblocks * 3n;
      const expiration = lockDuration + dayinblocks * 5n;

      expect(proposalInfo).to.deep.equal(
        {
          proposalHash: expectedProposalHash,
          created: currentBlock,
          unlock: lockDuration,
          expiration: expiration,
          quorum: 1100000000000000000000000n,
          lastCall: proposalInfo.lastCall,
        },
        "Proposals aren't equal."
      );
    });
    it("Should execute the proposal", async function () {
      const {
        signer,
        coreVoting,
        currentBlock,
        proposalId,
        targetsCoreVoting,
        calldatasCoreVoting,
      } = await loadFixture(getContracts);

      const dayinblocks = await coreVoting.DAY_IN_BLOCKS();
      const lockDuration = dayinblocks * 3n;

      await mine(lockDuration);

      const txResponse = await coreVoting.execute(
        proposalId,
        targetsCoreVoting,
        calldatasCoreVoting
      );
      const txReceipt = await txResponse.wait();
      expect(txReceipt).to.not.equal(null);

      const ProposalExecutedEvent = coreVoting.getEvent("ProposalExecuted");
      const events = await coreVoting.queryFilter(
        ProposalExecutedEvent,
        Number(currentBlock)
      );
      expect(events.length).to.equal(1);
      expect(events[0].args[0]).to.equal(proposalId);
    });

    it("Should execute the timelocked proposal", async function () {
      const {
        signer,
        coreVoting,
        timeLock,
        proposalId,
        targetsCoreVoting,
        calldatasCoreVoting,
        callHashTimelock,
      } = await loadFixture(getContracts);

      const dayinblocks = await coreVoting.DAY_IN_BLOCKS();
      const lockDuration = dayinblocks * 3n;

      await mine(lockDuration);
      (
        await coreVoting.execute(
          proposalId,
          targetsCoreVoting,
          calldatasCoreVoting
        )
      ).wait();

      const waitTime = await timeLock.waitTime();
      time.increaseTo(BigInt(Date.now()) + waitTime);
      await mine(1);
      const txResponse = await timeLock.execute(
        targetsTimeLock,
        callDatasTimeLock
      );
      console.log("txResponse", txResponse);
      const txReceipt = await txResponse.wait();
      console.log("txReceipt", txReceipt);
      expect(txReceipt).to.not.equal(null);
    });
  });
});

function createCallHash(targets: AddressLike[], calldata: BytesLike[]): string {
  const toBeHashed = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "bytes[]"],
    [targets, calldata]
  );
  return ethers.keccak256(toBeHashed);
}
