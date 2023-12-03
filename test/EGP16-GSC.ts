import {
  mine,
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AddressLike, BytesLike, formatEther, parseEther } from "ethers";
import { targets, callDatas } from "./gscTargetsAndCallDatas";

// ETHERSCAN THIS
// DECODE THE CALLDATA
const gscTargets = "0x654be0b5556f8eadbc2d140505445fa32715ef2b";

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

const stableNodeAddress = "0x1D1a13b16667c284b87de62CAEEfF0ce89E342B2";
const simonaAddress = "0x54BeCc7560a7Be76d72ED76a1f5fee6C5a2A7Ab6";
const robindAddress = "0x9F85221D7ec0dec8C4a28E5c7038Cfc4ad285a68";

const gscMemberAddresses = [stableNodeAddress, simonaAddress, robindAddress];

describe("EGP16-GSC", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function getContracts() {
    const signer0 = await ethers.getImpersonatedSigner(gscMemberAddresses[0]);
    const signer1 = await ethers.getImpersonatedSigner(gscMemberAddresses[1]);
    const signer2 = await ethers.getImpersonatedSigner(gscMemberAddresses[2]);

    const gscSigners = [signer0, signer1, signer2];

    // give ETH to all signers
    const stringValue = formatEther(parseEther("1000000").toString());
    const hexStringValue = ethers.hexlify(ethers.toUtf8Bytes(stringValue));
    const responses = gscSigners.map(({ address }) =>
      ethers.provider.send("hardhat_setBalance", [address, hexStringValue])
    );
    const receipts = await Promise.all(responses);

    // Now we'll create the proposal
    const signer = signer0;
    const gscCoreVoting = (
      await ethers.getContractAt("CoreVoting", addresses.gscCoreVoting)
    ).connect(signer);

    const gscVault = await ethers.getContractAt(
      "GSCVault",
      addresses.vestingVault
    );

    const vaults: AddressLike[] = [addresses.gscVault];
    const extraData: BytesLike[] = ["0x"];

    const targetsCoreVoting: AddressLike[] = targets;
    const calldatasCoreVoting: BytesLike[] = callDatas;
    const twoWeeksFromNow = 14 * 24 * 60 * 60 + Date.now();
    const currentBlock = BigInt(await signer.provider.getBlockNumber());
    const lastCall = BigInt(twoWeeksFromNow);
    const ballot = BigInt(0);

    const txResponse = await gscCoreVoting
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

    const proposalCount = await gscCoreVoting.proposalCount();
    const proposalId = proposalCount - 1n;
    let proposal = await gscCoreVoting.proposals(proposalId);

    const proposalInfo = {
      proposalHash: proposal[0],
      created: proposal[1],
      unlock: proposal[2],
      expiration: proposal[3],
      quorum: proposal[4],
      lastCall: proposal[5],
    };

    return {
      gscCoreVoting,
      gscVault,
      signer,
      gscSigners,
      currentBlock,
      proposalId,
      proposalInfo,
      targetsCoreVoting,
      calldatasCoreVoting,
    };
  }

  describe("Propsoal", function () {
    it("Should create the proposal", async function () {
      const {
        gscCoreVoting,
        currentBlock,
        proposalId,
        targetsCoreVoting,
        calldatasCoreVoting,
      } = await loadFixture(getContracts);

      const expectedProposalHash = createCallHash(
        targetsCoreVoting,
        calldatasCoreVoting
      );
      let proposal = await gscCoreVoting.proposals(proposalId);

      const proposalInfo = {
        created: proposal[1],
        proposalHash: proposal[0],
        unlock: proposal[2],
        expiration: proposal[3],
        quorum: proposal[4],
        lastCall: proposal[5],
      };

      const dayinblocks = await gscCoreVoting.DAY_IN_BLOCKS();
      const nextBlock = currentBlock + 1n;
      const lockDuration = nextBlock + dayinblocks * 3n;
      const expiration = lockDuration + dayinblocks * 5n;

      expect(proposalInfo).to.deep.equal(
        {
          proposalHash: expectedProposalHash,
          created: currentBlock,
          unlock: lockDuration,
          expiration: expiration,
          quorum: 3n,
          lastCall: proposalInfo.lastCall,
        },
        "Proposals aren't equal."
      );
    });

    it("Should execute the proposal", async function () {
      const {
        gscSigners,
        gscCoreVoting,
        currentBlock,
        proposalId,
        targetsCoreVoting,
        calldatasCoreVoting,
      } = await loadFixture(getContracts);

      // vote with enough to pass quorum
      const votePromises = gscSigners.map((signer) =>
        gscCoreVoting
          .connect(signer)
          .vote([addresses.gscVault], ["0x"], proposalId, 0)
      );

      const responses = await Promise.all(votePromises);
      await Promise.all(responses.map((response) => response.wait()));
      console.log("        votes are in!");

      // now we up the block count so we can execute
      const dayinblocks = await gscCoreVoting.DAY_IN_BLOCKS();
      const lockDuration = dayinblocks * 3n;

      await mine(lockDuration);
      console.log("        time has been advanced.");

      // finally, execute and check that the event fired
      const txResponse = await gscCoreVoting.execute(
        proposalId,
        targetsCoreVoting,
        calldatasCoreVoting
      );
      console.log("        proposal execution submitted.");
      const txReceipt = await txResponse.wait();

      expect(txReceipt).to.not.equal(null);
      console.log("        proposal is now executed.");

      const ProposalExecutedEvent = gscCoreVoting.getEvent("ProposalExecuted");
      const events = await gscCoreVoting.queryFilter(
        ProposalExecutedEvent,
        Number(currentBlock)
      );
      expect(events.length).to.equal(1);
      expect(events[0].args[0]).to.equal(proposalId);
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
