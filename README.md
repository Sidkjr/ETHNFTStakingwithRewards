# NFT Staking Program
![image](https://github.com/user-attachments/assets/3bec0d4b-cbe3-4720-a0a3-1105049c6c3c)

## Tools

- Solidity (Smart Contract)
- Javascript (Testing)
- [Ethers](https://docs.ethers.io/v6/) (Blockchain Interaction)
- [Hardhat](https://hardhat.org/) (Deployment)

## Requirements For Initial Setup
- Install [NodeJS](https://nodejs.org/en/),
- Install [Hardhat](https://hardhat.org/)

## Setting Up
### 1. Clone/Download the Repository

### 2. Install Dependencies:
```
$ cd ETHNFTStakingwithRewards
$ npm install
```
### 3. Boot up local development blockchain

`$ npx hardhat node`

### 4. In a different terminal, Deploy both contracts(Overdosed and StakeV2) using the latest script
```
`$ npx hardhat run scripts/deploy.js --network localhost`
`$ npx hardhat run scripts/deployupgradeProxy.js --network localhost`
```
## Functions
- Mint NFTs with the Overdosed ERC20 contract
- Choose to Stake one or more NFTs
- Receive rewards w.r.t the time you are staking a particular NFT.
- Claim  accumulated rewards ONLY after a certain delay period.
- Choose to Unstake one or More NFTs
- The NFT can only be withdrawn after it is Unstaked
- The NFT can only be withdrawn after a certain unbonding period.
- The Deployer can only change the reward Rate, delay period, and unbonding Period.
- The Entire Staking/Unstaking Process can be paused/unpaused by the Deployer Only. (Restricts all important transactions).
- The Staking Program follows a UUPS proxy pattern.

## Tests
### To run the tests, enter this command

`$ npx hardhat test`

### Screenshots 
![Screenshot from 2024-08-02 00-52-40](https://github.com/user-attachments/assets/293bb636-4d6c-497b-a082-89a6c46a7b96)
![Screenshot from 2024-08-02 00-52-17](https://github.com/user-attachments/assets/6bf519a3-e7b0-4143-8c6d-7828e424ee6e)
# Happy Coding!

