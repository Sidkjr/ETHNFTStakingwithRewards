// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./OverDosed.sol";
import "hardhat/console.sol";



contract StakeV1 is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable, ERC20Upgradeable, IERC721Receiver {

    // Keep tracks of total NFTs that have been staked. Doesn't decrease after Unstaking. 
    uint256 public stakeCounter;

    // Kepp tracks of total rewards sent to users
    uint256 public rewardsDisbursed;

    // This struct represents the staked NFT object 
    struct StakedNFT {
        uint256 nftID;
        address owner;
        uint256 rewards;
        uint256 timestamp;
    }

    // This array of struct type: StakedNFT stores all the NFT objects currently under Staking.
    StakedNFT[] public totalStakedNFTs;

    // This maps the NFT ID with the location of the StakedNFT object as the index in the above StakedNFT[] array.
    mapping(uint => uint) nftLocs;

    // This maps the NFT ID with the time at which the NFT was unstaked.
    mapping(uint => uint) timeatUnStake;

    // This mapping sets the delay for the user
    mapping(address => uint) usersDelay;

    // This maps the address of a specific user with the NFT IDs of the NFTs they have staked. 
    mapping(address => uint[]) usersNFTs;

    // Getting contract information here.
    OverDosed public nftContract;
    ERC20Upgradeable public rewardToken;

    // This variable will be used for the rewardRate.
    uint256 public rewardRate;

    // This variable will represent the unbonding period required to recieve the unstaked NFT back.
    uint256 public unbondingPeriod;

    // This variable represents the delay period required to claim the accumulated rewards.
    uint256 public delayPeriod;

    // Represents the staking vault
    bool public emptyorfull;

    event Stake(address _user, uint256 _nftID, uint256 _timestamp);
    event StakeBatch(address _user, uint[] _nftIDs, uint256 _timestamp);
    event Unstake(address _user, uint256 _nftID);
    event claimRewards(address _user, uint256 _amount);

    function initialize(address initialOwner, 
                        address _nfToken, 
                        uint256 _rewardRate, 
                        uint256  _unbondingPeriod, 
                        uint256 _delayPeriod
                        ) initializer public {
        __Pausable_init();
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __ERC20_init("SkullBones", "SBT");
        nftContract = OverDosed(_nfToken);
        rewardRate = _rewardRate;
        unbondingPeriod = _unbondingPeriod;
        delayPeriod = _delayPeriod;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function getUserNFTs(address _user) public view returns (uint[] memory) {
        return usersNFTs[_user];
    }

    function getNFTLoc(uint _nftID) public view returns (uint) {
        return nftLocs[_nftID];
    }

    function stakeNFT(uint256 _nftID) public {
        if(emptyorfull == false) {
            StakedNFT memory genesis = StakedNFT({
                nftID: 0,
                owner: msg.sender,
                rewards: 0,
                timestamp: 0
            });
            totalStakedNFTs.push(genesis);

        }
        require(nftContract.checkOwner(_nftID) == msg.sender, "You do not own this NFT");
        if(stakeCounter > 0) {

            uint[] memory userstakedNFTs = getUserNFTs(msg.sender);
            for(uint i=0; i < userstakedNFTs.length; i++) {
                require(userstakedNFTs[i] != _nftID, "This NFT is already Staked!");
            }
            
        }

        StakedNFT memory newStake = StakedNFT({
            nftID: _nftID,
            owner: msg.sender,
            rewards: 0,
            timestamp: block.timestamp
        });
        stakeCounter++;
        if(usersDelay[msg.sender] == 0) {
            usersDelay[msg.sender] = block.timestamp + delayPeriod;
        }
        totalStakedNFTs.push(newStake);
        usersNFTs[msg.sender].push(_nftID);        
        nftLocs[_nftID] = stakeCounter;
        
        console.log("The id of the staked NFT is: ", totalStakedNFTs[stakeCounter].nftID);
        nftContract.transferFrom(msg.sender, address(this), _nftID);

        emptyorfull = true;
        emit Stake(msg.sender, _nftID, block.timestamp);
    }

    function stakeBatchNFT(uint[] calldata _nftIDs) public {
        if(emptyorfull == false) {
            StakedNFT memory genesis = StakedNFT({
                nftID: 0,
                owner: msg.sender,
                rewards: 0,
                timestamp: 0
            });
            totalStakedNFTs.push(genesis);
        }
        require(_nftIDs.length < 10, "You can only stake 10 NFTs in a single transaction");
        uint[] memory userstakedNFTs = getUserNFTs(msg.sender);
        for(uint i = 0; i < _nftIDs.length; i++) {
            bool stake_found;
            require(nftContract.checkOwner(_nftIDs[i]) == msg.sender, "There is an NFT you do not Own in the Batch.");

                for(uint j = 0; j < userstakedNFTs.length; j++) {
                    if(_nftIDs[i] != userstakedNFTs[j]) {
                        stake_found = true;
                        break;
                    }
                }
            require(stake_found == false, "There is an NFT in the batch that is already staked.");
        }

        for(uint i = 0; i < _nftIDs.length;) {

            StakedNFT memory newStake = StakedNFT({
                nftID: _nftIDs[i],
                owner: msg.sender,
                rewards: 0,
                timestamp: block.timestamp
            });
            stakeCounter++;
            totalStakedNFTs.push(newStake);
            usersNFTs[msg.sender].push(_nftIDs[i]);
            nftLocs[_nftIDs[i]] = stakeCounter;
            nftContract.safeTransferFrom(msg.sender, address(this), _nftIDs[i]);
            unchecked {
                ++i;
            }

        }
        if(usersDelay[msg.sender] == 0) {
            usersDelay[msg.sender] = block.timestamp + delayPeriod;
        }
        emptyorfull = true;
        console.log("All NFTs staked successfully!");
        emit StakeBatch(msg.sender, _nftIDs, block.timestamp);

    }

    function withdrawNFT(uint _nftID) public {
        
        uint256 currentTimestamp = block.timestamp;
        uint256 timeAtunstake = timeatUnStake[_nftID];
        require(currentTimestamp - timeAtunstake >= unbondingPeriod, "You need to wait for the Unbonding Period to withdraw the NFT");
        nftContract.safeTransferFrom(address(this), msg.sender, _nftID);
        for(uint i;  i < usersNFTs[msg.sender].length; i++) {
            if(usersNFTs[msg.sender][i] == _nftID) {
                usersNFTs[msg.sender][i] = 0;
            }
        }
    }

    function unstakeOne(uint _nftID) public {

        uint nftLocation = getNFTLoc(_nftID);
        require(totalStakedNFTs[nftLocation].owner == msg.sender, "You do not own this NFT to unstake it.");
        timeatUnStake[_nftID] = block.timestamp + unbondingPeriod;
        nftLocs[_nftID] = 0;
        delete totalStakedNFTs[nftLocation];
    }

    function unstakeBatch(uint[] calldata _nftIDs) public {

        for(uint i; i < _nftIDs.length; i++) {  
            uint nftLocation = getNFTLoc(_nftIDs[i]);
            require(totalStakedNFTs[nftLocation].owner == msg.sender, "You do not own an NFT in the batch to unstake it.");
            timeatUnStake[_nftIDs[i]] = block.timestamp + unbondingPeriod;
            nftLocs[_nftIDs[i]] = 0;
            delete totalStakedNFTs[nftLocation];
        }
    }

    function calcRewards(address _user) public returns (uint256) {
        uint currentBlock = block.timestamp;
        uint[] memory userstakedNFTs = getUserNFTs(_user);
        uint256 totalNFTsReward;
        for(uint i = 0; i < userstakedNFTs.length; i++) {
            uint256 indexofNFT = nftLocs[userstakedNFTs[i]];
            uint256 blockDifference = currentBlock - totalStakedNFTs[indexofNFT].timestamp;
            uint256 rewardPerNFT = rewardRate * blockDifference;
            totalNFTsReward += rewardPerNFT;
            totalStakedNFTs[indexofNFT].rewards = rewardPerNFT;
        }
        console.log("The total reward is: ", totalNFTsReward);
        return totalNFTsReward;
    }

    function claimrewards() public {
        uint256 amount = calcRewards(msg.sender);
        require(block.timestamp - usersDelay[msg.sender] >= delayPeriod, "You must wait until the delay period to claim rewards.");
        _mint(msg.sender, amount);
        rewardsDisbursed += amount;
        resetDelay(msg.sender);
        console.log("The amount sent to ", msg.sender, " is: ", amount);
        uint[] memory userstakedNFTs = getUserNFTs(msg.sender);
        for(uint i = 0; i < userstakedNFTs.length; i++) {
            uint256 indexofNFT = nftLocs[userstakedNFTs[i]];
            totalStakedNFTs[indexofNFT].rewards = 0;
        }
    }

    function resetDelay(address _user) public {
        usersDelay[_user] = block.timestamp + delayPeriod;   
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }


    function _authorizeUpgrade(address newImplementation)
        internal
        onlyOwner
        override
    {}

}