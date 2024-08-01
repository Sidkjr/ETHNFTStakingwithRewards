const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("StakeV1", function () {

  let deployer, user1, user2, overdosed, proxy, delayPeriod, rewardRate, unbondingPeriod;

  this.beforeEach(async () => {
    [deployer, user1, user2] = await ethers.getSigners();
    const OverDosed = await ethers.getContractFactory("OverDosed");

    delayPeriod = 60;
    rewardRate = 1;
    unbondingPeriod = 30; 

    overdosed = await OverDosed.deploy();

    await overdosed.connect(user1).mintOverdosed(user1.address);
    await overdosed.connect(user2).mintOverdosed(user2.address);
    await overdosed.connect(user2).mintOverdosed(user2.address);

    const ODAddress = await overdosed.getAddress();

    const StakeV1Factory = await ethers.getContractFactory("StakeV1");

    proxy = await upgrades.deployProxy(StakeV1Factory, [deployer.address, ODAddress, rewardRate, unbondingPeriod, delayPeriod], { kind: 'uups' }, { initializer: "initialize" })
    const proxyAddress = await proxy.getAddress();
    const tx = await overdosed.setApprovalForAll(proxyAddress, true);
    await tx.wait()

  })

  describe('Check Minted NFTs owner', async () => {

    it("Checking if the owner of 1st NFT is user1", async function () {
      const user1Address = user1.address;
      expect(await overdosed.connect(user1).checkOwner(1)).to.equal(user1Address);
    })
    
    it("Checking if the owner of 2nd NFT is user2", async function () {
      const user2Address = user2.address;
      expect(await overdosed.connect(user2).checkOwner(2)).to.equal(user2Address);
    })
  })

  describe('Staking NFTs', async () => {

    it("User 1 is staking NFT: 1", async function () {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
    })

    it("User 2 is batch staking NFTs: 2 and 3", async function () {
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
    })

    it("User 1 cannot stake NFT: 1 again", async function () {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await expect(proxy.connect(user1).stakeNFT(1)).to.be.revertedWith('You do not own this NFT')
    })

    it("User 2 fails to stake someone else's NFT", async function () {
      await expect(proxy.connect(user2).stakeNFT(1)).to.be.revertedWith('You do not own this NFT');
    })

    it("User 2 fails to hide other's NFT in his batch stake", async function () {
      await expect(proxy.connect(user2).stakeBatchNFT([2,3,1])).to.be.revertedWith('There is an NFT you do not Own in the Batch.');
    })
    it("User 2 cannot stake more than 10 NFTs in his batch stake(Gas optimization)", async function () {
    
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await expect(proxy.connect(user2).stakeBatchNFT([2,3,4,5,6,7,8,9,10,11, 12])).to.be.revertedWith('You can only stake 10 NFTs in a single transaction');
    })
    
  })

  describe('Test with Rewards', async () => {

    it("User 1 tries to claim rewards with no NFT staked", async function () {
      await expect(proxy.connect(user1).claimrewards()).to.be.revertedWith('There are no rewards to claim');
    })

    it("User 1 properly stakes 1 NFT and waits 2 minutes for the rewards", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
    })

    it("User 1 stakes 1 NFT, claims rewards, but requests again and fails to claim more(Reset Accumulated rewards)", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      await expect(proxy.connect(user1).claimrewards()).to.be.revertedWith('There are no rewards to claim');
    })

    it("User 1 stakes 1 NFT, doesn't wait for the delay Period and fails to claim rewards", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(10);
      await expect(proxy.connect(user1).claimrewards()).to.be.revertedWith('You must wait until the delay period to claim rewards.');
    })
    it("User 1 stakes 1 NFT, User 2 stakes 2 NFTs, both are rewarded with different amount of tokens", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
      await time.increase(60);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
    })
  })

  describe("Unstaking NFTs", async () => {
    it("User 1 stakes 1 NFT, waits 2 minutes, claims rewards and decides to unstake and withdraw only AFTER the unbonding period ends", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user1).unstakeOne(1)).to.emit(proxy, "Unstake");
      await time.increase(60);
      await expect(proxy.connect(user1).withdrawNFT(1));
    })

    it("User 1 stakes 1 NFT, waits 2 minutes, claims rewards and decides to unstake and fails to withdraw BEFORE the unbonding period ends", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user1).unstakeOne(1)).to.emit(proxy, "Unstake");
      await time.increase(30);
      await expect(proxy.connect(user1).withdrawNFT(1)).to.be.revertedWith('You need to wait for the Unbonding Period to withdraw the NFT');
    })

    it("User 1 stakes 1 NFT, User 2 stakes 1 NFT. User 2 fails to unstake User 1's NFT", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await time.increase(120);
      await expect(proxy.connect(user2).unstakeOne(1)).to.be.revertedWith('You do not own this NFT to unstake it.');
    })

    it("User 2 stakes 2 NFTs, waits 2 minutes, claims rewards and decides to unstake both and withdraw only AFTER the unbonding period ends", async function() {
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).unstakeBatch([2,3])).to.emit(proxy, "UnstakeBatch");
      await time.increase(60);
      await expect(proxy.connect(user1).withdrawNFT(2));
      await expect(proxy.connect(user2).withdrawNFT(3));
    })

    it("User 2 stakes 2 NFTs, waits 2 minutes, claims rewards and decides to unstake one but fails to withdraw both AFTER the unbonding period ends", async function() {
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).unstakeOne(2)).to.emit(proxy, "Unstake");
      await time.increase(60);
      await expect(proxy.connect(user1).withdrawNFT(2));
      await expect(proxy.connect(user2).withdrawNFT(3)).to.be.revertedWith('You cannot withdraw until you unstake the NFT');
    })

    it("User 2 stakes 2 NFTs, waits 2 minutes, claims rewards and decides to unstake both to withdraw both AFTER the unbonding period ends", async function() {
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).unstakeBatch([2,3])).to.emit(proxy, "UnstakeBatch");
      await time.increase(60);
      await expect(proxy.connect(user1).withdrawNFT(2));
      await expect(proxy.connect(user2).withdrawNFT(3));
    })
  })

  describe("Owner calls", async () => {
    it("The owner is able to Pause and Unpause the Staking/Unstaking stops", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await proxy.connect(deployer).pause();
      await expect(proxy.connect(user2).stakeNFT(3)).to.be.revertedWithCustomError(proxy, 'EnforcedPause()');
      await proxy.connect(deployer).unpause();
      expect(await proxy.connect(user2).stakeNFT(3)).to.emit(proxy, "Stake");

    })
    it("Anyone else tries to Pause the Staking/Unstaking process, will fail", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await expect(proxy.connect(user1).pause()).to.be.revertedWithCustomError(proxy, 'OwnableUnauthorizedAccount')
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
    })
  })
});

//----!Repeating All the tests with the StakeV2 upgraded contract!----

describe("StakeV2", function () {

  let deployer, user1, user2, overdosed, proxy, delayPeriod, rewardRate, unbondingPeriod;

  this.beforeEach(async () => {
    [deployer, user1, user2] = await ethers.getSigners();
    const OverDosed = await ethers.getContractFactory("OverDosed");

    delayPeriod = 60;
    rewardRate = 1;
    unbondingPeriod = 30; 

    overdosed = await OverDosed.deploy();

    await overdosed.connect(user1).mintOverdosed(user1.address);
    await overdosed.connect(user2).mintOverdosed(user2.address);
    await overdosed.connect(user2).mintOverdosed(user2.address);

    const ODAddress = await overdosed.getAddress();

    const StakeV1Factory = await ethers.getContractFactory("StakeV1");

    proxy = await upgrades.deployProxy(StakeV1Factory, [deployer.address, ODAddress, rewardRate, unbondingPeriod, delayPeriod], { kind: 'uups' }, { initializer: "initialize" })
    const proxyAddress = await proxy.getAddress();
    const tx = await overdosed.setApprovalForAll(proxyAddress, true);
    await tx.wait()

    const StakeV2Factory = await ethers.getContractFactory("StakeV2");

    proxy = await upgrades.upgradeProxy(proxyAddress, StakeV2Factory);


  })

  describe('Check Minted NFTs owner', async () => {

    it("Checking if the owner of 1st NFT is user1", async function () {
      const user1Address = user1.address;
      expect(await overdosed.connect(user1).checkOwner(1)).to.equal(user1Address);
    })
    
    it("Checking if the owner of 2nd NFT is user2", async function () {
      const user2Address = user2.address;
      expect(await overdosed.connect(user2).checkOwner(2)).to.equal(user2Address);
    })
  })

  describe('Staking NFTs', async () => {

    it("User 1 is staking NFT: 1", async function () {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
    })

    it("User 2 is batch staking NFTs: 2 and 3", async function () {
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
    })

    it("User 1 cannot stake NFT: 1 again", async function () {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await expect(proxy.connect(user1).stakeNFT(1)).to.be.revertedWith('You do not own this NFT')
    })

    it("User 2 fails to stake someone else's NFT", async function () {
      await expect(proxy.connect(user2).stakeNFT(1)).to.be.revertedWith('You do not own this NFT');
    })

    it("User 2 fails to hide other's NFT in his batch stake", async function () {
      await expect(proxy.connect(user2).stakeBatchNFT([2,3,1])).to.be.revertedWith('There is an NFT you do not Own in the Batch.');
    })
    it("User 2 cannot stake more than 10 NFTs in his batch stake(Gas optimization)", async function () {
    
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await overdosed.connect(user2).mintOverdosed(user2.address);
      await expect(proxy.connect(user2).stakeBatchNFT([2,3,4,5,6,7,8,9,10,11, 12])).to.be.revertedWith('You can only stake 10 NFTs in a single transaction');
    })
    
  })

  describe('Test with Rewards', async () => {

    it("User 1 tries to claim rewards with no NFT staked", async function () {
      await expect(proxy.connect(user1).claimrewards()).to.be.revertedWith('There are no rewards to claim');
    })

    it("User 1 properly stakes 1 NFT and waits 2 minutes for the rewards", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
    })

    it("User 1 stakes 1 NFT, claims rewards, but requests again and fails to claim more(Reset Accumulated rewards)", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      await expect(proxy.connect(user1).claimrewards()).to.be.revertedWith('There are no rewards to claim');
    })

    it("User 1 stakes 1 NFT, doesn't wait for the delay Period and fails to claim rewards", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(10);
      await expect(proxy.connect(user1).claimrewards()).to.be.revertedWith('You must wait until the delay period to claim rewards.');
    })
    it("User 1 stakes 1 NFT, User 2 stakes 2 NFTs, both are rewarded with different amount of tokens", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
      await time.increase(60);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
    })
  })

  describe("Unstaking NFTs", async () => {
    it("User 1 stakes 1 NFT, waits 2 minutes, claims rewards and decides to unstake and withdraw only AFTER the unbonding period ends", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user1).unstakeOne(1)).to.emit(proxy, "Unstake");
      await time.increase(60);
      await expect(proxy.connect(user1).withdrawNFT(1))
    })

    it("User 1 stakes 1 NFT, waits 2 minutes, claims rewards and decides to unstake and fails to withdraw BEFORE the unbonding period ends", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user1).unstakeOne(1)).to.emit(proxy, "Unstake");
      await time.increase(30);
      await expect(proxy.connect(user1).withdrawNFT(1)).to.be.revertedWith('You need to wait for the Unbonding Period to withdraw the NFT');
    })

    it("User 1 stakes 1 NFT, User 2 stakes 1 NFT. User 2 fails to unstake User 1's NFT", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await time.increase(120);
      await expect(proxy.connect(user2).unstakeOne(1)).to.be.revertedWith('You do not own this NFT to unstake it.');
    })

    it("User 2 stakes 2 NFTs, waits 2 minutes, claims rewards and decides to unstake both and withdraw only AFTER the unbonding period ends", async function() {
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).unstakeBatch([2,3])).to.emit(proxy, "UnstakeBatch");
      await time.increase(60);
      await expect(proxy.connect(user1).withdrawNFT(2));
      await expect(proxy.connect(user2).withdrawNFT(3));
    })

    it("User 2 stakes 2 NFTs, waits 2 minutes, claims rewards and decides to unstake one but fails to withdraw both AFTER the unbonding period ends", async function() {
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).unstakeOne(2)).to.emit(proxy, "Unstake");
      await time.increase(60);
      await expect(proxy.connect(user1).withdrawNFT(2));
      await expect(proxy.connect(user2).withdrawNFT(3)).to.be.revertedWith('You cannot withdraw until you unstake the NFT');
    })

    it("User 2 stakes 2 NFTs, waits 2 minutes, claims rewards and decides to unstake both to withdraw both AFTER the unbonding period ends", async function() {
      expect(await proxy.connect(user2).stakeBatchNFT([2,3])).to.emit(proxy, "StakeBatch");
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).unstakeBatch([2,3])).to.emit(proxy, "UnstakeBatch");
      await time.increase(60);
      await expect(proxy.connect(user1).withdrawNFT(2));
      await expect(proxy.connect(user2).withdrawNFT(3));
    })
  })

  describe("Owner calls", async () => {
    it("The owner is able to Pause and Unpause the Staking/Unstaking stops", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await proxy.connect(deployer).pause();
      await expect(proxy.connect(user2).stakeNFT(3)).to.be.revertedWithCustomError(proxy, 'EnforcedPause()');
      await proxy.connect(deployer).unpause();
      expect(await proxy.connect(user2).stakeNFT(3)).to.emit(proxy, "Stake");
    })
    it("Anyone else tries to Pause the Staking/Unstaking process, will fail", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await expect(proxy.connect(user1).pause()).to.be.revertedWithCustomError(proxy, 'OwnableUnauthorizedAccount')
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
    })
  })

  describe("Upgraded Owner calls", async() => {
    it("The owner is able to change rewardsRate", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      await proxy.connect(deployer).changeRewardRate(2)
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await time.increase(120);
      expect(await proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
    })

    it("The owner is able to change delayPeriod", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(70);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      await proxy.connect(deployer).changedelayRate(400)
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await time.increase(70);
      await expect(proxy.connect(user2).claimrewards()).to.be.revertedWith('You must wait until the delay period to claim rewards.');
    })

    it("The owner is able to change unbondingPeriod", async function() {
      expect(await proxy.connect(user1).stakeNFT(1)).to.emit(proxy, "Stake");
      await time.increase(70);
      expect(await proxy.connect(user1).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user1).unstakeOne(1)).to.emit(proxy, "Unstake");
      await time.increase(40);
      await expect(proxy.connect(user1).withdrawNFT(1))
      await proxy.connect(deployer).changeunbondingPeriod(400)
      expect(await proxy.connect(user2).stakeNFT(2)).to.emit(proxy, "Stake");
      await time.increase(70);
      await expect(proxy.connect(user2).claimrewards()).to.emit(proxy, "claimRewards");
      expect(await proxy.connect(user2).unstakeOne(2)).to.emit(proxy, "Unstake");
      await time.increase(40);
      await expect(proxy.connect(user2).withdrawNFT(1)).to.be.revertedWith('You need to wait for the Unbonding Period to withdraw the NFT')
    })

    it("Anyone else except the owner cannot use upgraded onlyOwner functions", async function() {
      await expect(proxy.connect(user1).changeRewardRate(3)).to.be.revertedWithCustomError(proxy, 'OwnableUnauthorizedAccount');
      await expect(proxy.connect(user1).changedelayRate(1)).to.be.revertedWithCustomError(proxy, 'OwnableUnauthorizedAccount');
      await expect(proxy.connect(user1).changeunbondingPeriod(1)).to.be.revertedWithCustomError(proxy, 'OwnableUnauthorizedAccount')
    })
  })
});
