// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VoterRegistry {
    mapping(uint256 => mapping(bytes32 => bool)) public constituencyEligibility;
    mapping(bytes32 => bool) public hasVoted;

    event VoterRegistered(uint256 indexed constituencyId, bytes32 indexed nullifierHash);
    event VoteRecorded(bytes32 indexed nullifier);

    address public admin;

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    function registerEligibleVoter(uint256 _constituencyId, bytes32 nullifierHash) external onlyAdmin {
        constituencyEligibility[_constituencyId][nullifierHash] = true;
        emit VoterRegistered(_constituencyId, nullifierHash);
    }

    function isEligible(uint256 _constituencyId, bytes32 nullifierHash) external view returns (bool) {
        return constituencyEligibility[_constituencyId][nullifierHash];
    }

    function markAsVoted(bytes32 nullifier) external {
        // In a real scenario, this would be called by the Election contract
        hasVoted[nullifier] = true;
        emit VoteRecorded(nullifier);
    }

    function checkVoted(bytes32 nullifier) external view returns (bool) {
        return hasVoted[nullifier];
    }
}
