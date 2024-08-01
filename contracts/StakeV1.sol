// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./OverDosed.sol";
import "hardhat/console.sol";



contract StakeV1 is Initializable, OwnableUpgradeable, UUPSUpgradeable, PausableUpgradeable, ERC20Upgradeable, IERC721Receiver,  ReentrancyGuardUpgradeable {

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

    // This maps the NFT ID with the location/index of the StakedNFT object from the above StakedNFT[] array.
    mapping(uint => uint) nftLocs;

    // This maps the NFT ID with the time at which the NFT was unstaked.
    mapping(uint => uint) timeatUnStake;

    // This mapping sets the delay for the user
    mapping(address => uint) usersDelay;

    // This maps the address of a specific user with the NFT IDs of the NFTs they have staked. 
    mapping(address => uint[]) usersNFTs;

    // Getting contract instance.
    OverDosed public nftContract;
    ERC20Upgradeable public rewardToken;

    // This variable will be used for the rewardRate.
    uint256 public rewardRate;

    // This variable will represent the unbonding period required to recieve the unstaked NFT back.
    uint256 public unbondingPeriod;

    // This variable represents the delay period required to claim the accumulated rewards.
    uint256 public delayPeriod;

    // Represents the status of the Genesis Gap
    bool public emptyorfull;

    event Stake(address _user, uint256 _nftID, uint256 _timestamp);
    event StakeBatch(address _user, uint[] _nftIDs, uint256 _timestamp);
    event Unstake(address _user, uint256 _nftID, uint256 _timestamp);
    event UnstakeBatch(address _user, uint[] _nftIDs, uint256 _timestamp);
    event claimRewards(address _user, uint256 _amount);

    // Initializes the parameters required by the proxy
    function initialize(address initialOwner, 
                        address _nfToken, 
                        uint256 _rewardRate, 
                        uint256  _unbondingPeriod, 
                        uint256 _delayPeriod
                        ) initializer public {
        __Pausable_init();
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
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


    // Returns a uint[] array that contains the NFT Ids of a specific user.
    function getUserNFTs(address _user) public view returns (uint[] memory) {
        return usersNFTs[_user];
    }

    // Returns the index/location of a specific NFT from the totalStakedNFTs struct w.r.t the NFT Id.
    function getNFTLoc(uint _nftID) public view returns (uint) {
        return nftLocs[_nftID];
    }

    // Stakes 1 NFT from the user.

    function stakeNFT(uint256 _nftID) public nonReentrant {

        // A genesis NFT space reserved to stop comparing zeroed-values. Hence NFT locations will start from 1 index as well the NFT IDs.
        if(emptyorfull == false) {
            StakedNFT memory genesis = StakedNFT({
                nftID: 0,
                owner: msg.sender,
                rewards: 0,
                timestamp: 0
            });
            totalStakedNFTs.push(genesis);

        }

        // Check to see if the owner is the one staking the NFT or not
        require(nftContract.checkOwner(_nftID) == msg.sender, "You do not own this NFT");

        // If there is/are already NFT/s that has/have been staked then perform these checks.
        if(stakeCounter > 0) {

            uint[] memory userstakedNFTs = getUserNFTs(msg.sender);
            for(uint i=0; i < userstakedNFTs.length; i++) {
                require(userstakedNFTs[i] != _nftID, "This NFT is already Staked!");
            }
            
        }

        // Otherwise(No NFTs are staked) - OR - If all the above tests pass(If there are NFTs being staked), Stake the NFT
        StakedNFT memory newStake = StakedNFT({
            nftID: _nftID,
            owner: msg.sender,
            rewards: 0,
            timestamp: block.timestamp
        });

        // Increment the amount of staked NFTs by one
        stakeCounter++;

        // Check if the user hasn't staked before i.e. No value initialized for the user's delay
        if(usersDelay[msg.sender] == 0) {

            // If the case being true, set the delay to the delayPeriod
            usersDelay[msg.sender] = block.timestamp + delayPeriod;
        }
        totalStakedNFTs.push(newStake);

        // Push the Id of the NFT w.r.t the specific user into the uint[] array containing NFT IDs
        usersNFTs[msg.sender].push(_nftID);        

        // Push the current index value i.e the no. of NFTs staked, into the nftLocs mapping wrt to the NFT ID
        nftLocs[_nftID] = stakeCounter;
        

        console.log("The id of the staked NFT is: ", totalStakedNFTs[stakeCounter].nftID);
        nftContract.transferFrom(msg.sender, address(this), _nftID);

        // Change the bool to true here to say - No more need for adding a Genesis gap.
        emptyorfull = true;

        emit Stake(msg.sender, _nftID, block.timestamp);
    }

    // Stakes multiple NFTs (limit: 10 to optimize gas) 

    function stakeBatchNFT(uint[] calldata _nftIDs) public nonReentrant {

        // First Check if the there are only 10 NFTs to stake or not  
        require(_nftIDs.length <= 10, "You can only stake 10 NFTs in a single transaction");
        
        // Add a genesis if bool is false
        if(emptyorfull == false) {
            StakedNFT memory genesis = StakedNFT({
                nftID: 0,
                owner: msg.sender,
                rewards: 0,
                timestamp: 0
            });
            totalStakedNFTs.push(genesis);
        }

        // Condition to check whether the NFTs are owned by the user or not. Also to check whether that NFT is already being staked or not.
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

        // Follow the same procedure as Staking for every individual NFT

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

    // User can only withdraw the NFT until they have Unstaked it and only after the unbonding period.
    function withdrawNFT(uint _nftID) public nonReentrant {
        
        uint256 currentTimestamp = block.timestamp;
        uint256 timeAtunstake = timeatUnStake[_nftID];

        // Condition to check whether unbonding period is finished or not
        require(currentTimestamp - timeAtunstake >= unbondingPeriod, "You need to wait for the Unbonding Period to withdraw the NFT");
        nftContract.safeTransferFrom(address(this), msg.sender, _nftID);

        // Setting the Id for user's Owned NFT to 0 - It is no longer under staking.
        for(uint i;  i < usersNFTs[msg.sender].length; i++) {
            if(usersNFTs[msg.sender][i] == _nftID) {
                usersNFTs[msg.sender][i] = 0;
            }
        }
    }

    // Unstakes 1 NFT - Removes/Stops the rewards for that specific NFT and also set the Unbonding period here. 
    function unstakeOne(uint _nftID) public nonReentrant {

        uint nftLocation = getNFTLoc(_nftID);
        require(totalStakedNFTs[nftLocation].owner == msg.sender, "You do not own this NFT to unstake it.");

        // Setting the unbonding period for the NFT to restrict withdraw for some time.
        timeatUnStake[_nftID] = block.timestamp + unbondingPeriod;
        nftLocs[_nftID] = 0;
        delete totalStakedNFTs[nftLocation];

        emit Unstake(msg.sender, _nftID, block.timestamp);
    }

    // Unstakes multiple NFTs 

    function unstakeBatch(uint[] calldata _nftIDs) public nonReentrant {

        for(uint i; i < _nftIDs.length; i++) {  
            uint nftLocation = getNFTLoc(_nftIDs[i]);
            require(totalStakedNFTs[nftLocation].owner == msg.sender, "You do not own an NFT in the batch to unstake it.");

            // Set unbonding period 
            timeatUnStake[_nftIDs[i]] = block.timestamp + unbondingPeriod;
            nftLocs[_nftIDs[i]] = 0;
            delete totalStakedNFTs[nftLocation];
        }

        emit UnstakeBatch(msg.sender, _nftIDs, block.timestamp);
    }

    // Secondary function - Used to calculate rewards for a user.

    function calcRewards(address _user) public returns (uint256) {
        uint currentBlock = block.timestamp;
        uint[] memory userstakedNFTs = getUserNFTs(_user);
        uint256 totalNFTsReward;

        // Loops reason - Every NFT Staked, will have different timestamps, Meaning different rewards. So gather all of the rewards, and return the total rewards for the user.
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

    // Checks if the delay period is over to claim the rewards. The transaction fails until the delay period is over.
    function claimrewards() public nonReentrant {
        uint256 userDelay = usersDelay[msg.sender];
        require(block.timestamp - userDelay >= delayPeriod, "You must wait until the delay period to claim rewards.");
        uint256 amount = calcRewards(msg.sender);
        _mint(msg.sender, amount);

        // Keep track of total rewards sent to users
        rewardsDisbursed += amount;

        // Reset the delay for the user after rewards are claimed.
        resetDelay(msg.sender);
        console.log("The amount sent to ", msg.sender, " is: ", amount);

        // This block resets the reward values of all NFTs staked by the user to 0.
        uint[] memory userstakedNFTs = getUserNFTs(msg.sender);
        for(uint i = 0; i < userstakedNFTs.length; i++) {
            uint256 indexofNFT = nftLocs[userstakedNFTs[i]];
            totalStakedNFTs[indexofNFT].rewards = 0;
        }
        emit claimRewards(msg.sender, amount);
    }

    // Secondary function that set's the delay period for the user

    function resetDelay(address _user) public {
        usersDelay[_user] = block.timestamp + delayPeriod;   
    }

    // Pause and Unpause functionality for the Smart Contract.

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }


    // Upgrade authorization function to upgrade the contract.

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyOwner
        override
    {}

}