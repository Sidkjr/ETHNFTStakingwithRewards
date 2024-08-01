// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import '@openzeppelin/contracts/access/Ownable.sol';

contract OverDosed is ERC721Enumerable {
    uint256 private tokenId;

    constructor() ERC721("OverDosed Art", "ODA") { }

    function mintOverdosed(address to) external {
        uint256 _tokenId = ++tokenId;
        _safeMint(to, _tokenId);
        _setApprovalForAll(to, to, true);
    }

    function checkOwner(uint256 _tokenId) view external returns (address){ 
        return ownerOf(_tokenId); 
    }

    function transferNFT(address from, address to, uint256 _tokenId) external {
        _safeTransfer(from, to, _tokenId);
    }   

}