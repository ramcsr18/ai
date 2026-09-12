// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VoterRegistry.sol";

contract Election {
    struct ElectionInfo {
        string name;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
    }

    struct Candidate {
        string name;
        string party;
        uint256 voteCount;
    }

    VoterRegistry public voterRegistry;
    mapping(uint256 => ElectionInfo) public elections;
    mapping(uint256 => Candidate[]) public electionCandidates;
    uint256 public electionCount;

    event ElectionCreated(uint256 indexed electionId, string name);
    event CandidateAdded(uint256 indexed electionId, uint256 candidateId, string name);
    event VoteCast(uint256 indexed electionId, uint256 indexed candidateId);

    address public admin;

    constructor(address _voterRegistryAddress) {
        voterRegistry = VoterRegistry(_voterRegistryAddress);
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    function createElection(string memory _name, uint256 _start, uint256 _end) external onlyAdmin returns (uint256) {
        electionCount++;
        elections[electionCount] = ElectionInfo(_name, _start, _end, true);
        emit ElectionCreated(electionCount, _name);
        return electionCount;
    }

    function addCandidate(uint256 _electionId, string memory _name, string memory _party) external onlyAdmin {
        Candidate memory newCandidate = Candidate(_name, _party, 0);
        electionCandidates[_electionId].push(newCandidate);
        emit CandidateAdded(_electionId, electionCandidates[_electionId].length - 1, _name);
    }

    function castVote(
        uint256 _electionId,
        uint256 _candidateId,
        bytes32 _nullifier,
        bytes memory _signature
    ) external {
        ElectionInfo storage election = elections[_electionId];
        require(block.timestamp >= election.startTime && block.timestamp <= election.endTime, "Election is not active");
        require(voterRegistry.isEligible(_nullifier), "Voter not eligible");
        require(!voterRegistry.checkVoted(_nullifier), "Voter has already voted");

        // In a production system, we would verify the signature from the backend here
        // using ecrecover to ensure the backend authorized this specific nullifier

        require(_candidateId < electionCandidates[_electionId].length, "Invalid candidate");

        electionCandidates[_electionId][_candidateId].voteCount++;
        voterRegistry.markAsVoted(_nullifier);

        emit VoteCast(_electionId, _candidateId);
    }

    function getCandidates(uint256 _electionId) external view returns (Candidate[] memory) {
        return electionCandidates[_electionId];
    }
}
