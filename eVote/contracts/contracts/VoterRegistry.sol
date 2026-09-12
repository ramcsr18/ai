// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract VoterRegistry {
    mapping(bytes32 => bool) public eligibleVoters;
    mapping(bytes32 => bool) public hasVoted;

    event VoterRegistered(bytes32 indexed nullifierHash);
    event VoteRecorded(bytes32 indexed nullifier);

    address public admin;

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    function registerEligibleVoter(bytes32 nullifierHash) external onlyAdmin {
        eligibleVoters[nullifierHash] = true;
        emit VoterRegistered(nullifierHash);
    }

    function isEligible(bytes32 nullifierHash) external view returns (bool) {
        return eligibleVoters[nullifierHash];
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
