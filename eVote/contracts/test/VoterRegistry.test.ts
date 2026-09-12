import { expect } from "chai";
import { ethers } from "hardhat";

describe("VoterRegistry", function () {
  let VoterRegistry, voterRegistry, admin, addr1;

  beforeEach(async function () {
    [admin, addr1] = await ethers.getSigners();
    VoterRegistry = await ethers.getContractFactory("VoterRegistry");
    voterRegistry = await VoterRegistry.deploy();
    await voterRegistry.deployed();
  });

  it("Should allow admin to register eligible voters", async function () {
    const nullifierHash = ethers.utils.id("voter1");
    await voterRegistry.registerEligibleVoter(nullifierHash);
    expect(await voterRegistry.isEligible(nullifierHash)).to.equal(true);
  });

  it("Should prevent non-admin from registering voters", async function () {
    const nullifierHash = ethers.utils.id("voter2");
    await expect(
      voterRegistry.connect(addr1).registerEligibleVoter(nullifierHash)
    ).to.be.revertedWith("Only admin can perform this action");
  });

  it("Should track if a voter has voted", async function () {
    const nullifier = ethers.utils.id("voter1");
    await voterRegistry.markAsVoted(nullifier);
    expect(await voterRegistry.checkVoted(nullifier)).to.equal(true);
  });
});
