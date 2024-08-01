const { ethers, artifacts, network } = require('hardhat');
const hardhatConfig = require('../hardhat.config');

async function main() {
    const OverDosedFactory = await ethers.getContractFactory("OverDosed");
    const overdosed = await OverDosedFactory.deploy();

    const contractAddress = await overdosed.getAddress() 
    console.log("Overdosed deployed to:", contractAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });