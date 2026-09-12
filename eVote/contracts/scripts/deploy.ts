import { ethers } from "hardhat";

async function main() {
  console.log("Deploying contracts...");

  // Deploy VoterRegistry
  const VoterRegistry = await ethers.getContractFactory("VoterRegistry");
  const voterRegistry = await VoterRegistry.deploy();
  await voterRegistry.waitForDeployment();
  const vrAddress = await voterRegistry.getAddress();
  console.log(`VoterRegistry deployed to: ${vrAddress}`);

  // Deploy Election
  const Election = await ethers.getContractFactory("Election");
  const election = await Election.deploy(vrAddress);
  await election.waitForDeployment();
  const eAddress = await election.getAddress();
  console.log(`Election deployed to: ${eAddress}`);

  console.log("\nDeployment Complete!");
  console.log(`VoterRegistry: ${vrAddress}`);
  console.log(`Election: ${eAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
