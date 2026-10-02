"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const electionController_1 = require("../controllers/electionController");
(0, node_test_1.describe)('final election vote report', () => {
    (0, node_test_1.it)('builds the aggregate totals and checks blockchain consistency', () => {
        const voteRecords = [
            { candidateId: 'cand-1', blockchainCandidateId: 0, nullifier: 'n1', blockchainHash: 'hash-a' },
            { candidateId: 'cand-1', blockchainCandidateId: 0, nullifier: 'n2', blockchainHash: 'hash-b' },
            { candidateId: 'cand-2', blockchainCandidateId: 1, nullifier: 'n3', blockchainHash: 'hash-c' },
        ];
        const report = (0, electionController_1.buildElectionVoteReport)({
            election: { _id: 'e1', name: 'Local election', status: 'completed' },
            candidates: [
                { _id: 'cand-1', name: 'Alice', party: 'Party A', blockchainCandidateId: 0 },
                { _id: 'cand-2', name: 'Bob', party: 'Party B', blockchainCandidateId: 1 },
            ],
            votes: voteRecords,
        }, 'e1');
        strict_1.default.equal(report.totalVotes, 3);
        strict_1.default.equal(report.candidates[0].voteCount, 2);
        strict_1.default.equal(report.candidates[1].voteCount, 1);
        strict_1.default.equal(report.blockchainValidation.isConsistent, true);
        const invalid = (0, electionController_1.validateVoteBlockchainConsistency)(voteRecords.slice(0, 2), 'e1');
        strict_1.default.equal(invalid.isConsistent, true);
    });
});
