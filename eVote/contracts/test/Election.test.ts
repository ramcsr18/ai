import { expect } from "chai";
import { ethers } from "hardhat";

describe("Election", function () {
  let VoterRegistry, voterRegistry, Election, election, admin, addr1;

  beforeEach(async function () {
    [admin, addr1] = await ethers.getSigners();

    VoterRegistry = await ethers.getContractFactory("VoterRegistry");
    voterRegistry = await VoterRegistry.deploy();
    await voterRegistry.deployed();

    Election = await ethers.getContractFactory("Election");
    election = await Election.deploy(voterRegistry.address);
    await election.deployed();
  });

  it("Should create an election", async function () {
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = startTime + 3600;
    const electionId = await election.createElection("General Election 2026", startTime, endTime);

    const info = await election.elections(electionId);
    expect(info.name).to.equal("General Election 2026");
    expect(info.isActive).to.equal(true);
  });

  it("Should add candidates to an election", async function () {
    const electionId = await election.createElection("Test Election", 0, 10000000000);
    await election.addCandidate(electionId, "Candidate A", "Party A");

    const candidates = await election.getCandidates(electionId);
    expect(candidates.length).to.equal(1);
    expect(candidates[0].name).to.equal("Candidate A");
  });

  it("Should allow an eligible voter to cast a vote", async function () {
    const electionId = await election.createElection("Test Election", 0, 10000000000);
    await election.addCandidate(electionId, "Candidate A", "Party A");

    const nullifier = ethers.utils.id("voter1");
    await voterRegistry.registerEligibleVoter(nullifier);

    // Cast vote
    await election.castVote(electionId, 0, nullifier, "0x"); // signature omitted for test simplicity

    const candidates = await election.getCandidates(electionId);
    expect(candidates[0].voteCount).to.equal(1);
    expect(await voterRegistry.checkVoted(nullifier)).to.equal(true);
  });

  it("Should prevent double voting", async function () {
    const electionId = await election.createElection("Test Election", 0, 10000000000);
    await election.addCandidate(electionId, "Candidate A", "Party A");

    const nullifier = ethers.utils.id("voter1");
    await voterRegistry.registerEligibleVoter(nullifier);

    await election.castVote(electionId, 0, nullifier, "0x");

    await expect(
      election.castVote(electionId, 0, nullifier, "0x")
    ).to.be.revertedWith("Voter has already voted");
  });

  it("Should prevent ineligible voters from voting", async function () {
    const electionId = await election.createElection("Test Election", 0, 10000000000);
    await election.addCandidate(electionId, "Candidate A", "Party A");

    const nullifier = ethers.utils.id("ineligible_voter");

    await expect(
      election.castVote(electionId, 0, nullifier, "0x")
    ).to.be.revertedWith("Voter not eligible");
  });
});
