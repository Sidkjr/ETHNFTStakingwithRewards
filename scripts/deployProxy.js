const { ethers } = require('hardhat');

async function main() {
    const StakeV1Factory = await ethers.getContractFactory("StakeV1");
    const overdosedAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const [account1] = await ethers.getSigners();

    const rewardRate = 1;
    const unbondingPeriod = 30;
    const delayPeriod = 60;

    const proxy = await upgrades.deployProxy(StakeV1Factory, 
                                            [account1.address, 
                                            overdosedAddress, 
                                            rewardRate, 
                                            unbondingPeriod, 
                                            delayPeriod], 
                                            { kind: 'uups' }, 
                                            { initializer: "initialize" })

    const proxyAddress = await proxy.getAddress();

    console.log("Proxy deployed to: ", proxyAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });