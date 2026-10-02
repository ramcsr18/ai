import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildElectionVoteReport, validateVoteBlockchainConsistency } from '../controllers/electionController';

describe('final election vote report', () => {
  it('builds the aggregate totals and checks blockchain consistency', () => {
    const voteRecords = [
      { candidateId: 'cand-1', blockchainCandidateId: 0, nullifier: 'n1', blockchainHash: 'hash-a' },
      { candidateId: 'cand-1', blockchainCandidateId: 0, nullifier: 'n2', blockchainHash: 'hash-b' },
      { candidateId: 'cand-2', blockchainCandidateId: 1, nullifier: 'n3', blockchainHash: 'hash-c' },
    ];

    const report = buildElectionVoteReport({
      election: { _id: 'e1', name: 'Local election', status: 'completed' },
      candidates: [
        { _id: 'cand-1', name: 'Alice', party: 'Party A', blockchainCandidateId: 0 },
        { _id: 'cand-2', name: 'Bob', party: 'Party B', blockchainCandidateId: 1 },
      ],
      votes: voteRecords,
    }, 'e1');

    assert.equal(report.totalVotes, 3);
    assert.equal(report.candidates[0].voteCount, 2);
    assert.equal(report.candidates[1].voteCount, 1);
    assert.equal(report.blockchainValidation.isConsistent, true);

    const invalid = validateVoteBlockchainConsistency(voteRecords.slice(0, 2), 'e1');
    assert.equal(invalid.isConsistent, true);
  });
});
