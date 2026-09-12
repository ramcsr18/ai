import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema({
    electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
    blockchainCandidateId: { type: Number, required: true },
    name: { type: String, required: true },
    party: { type: String, required: true },
    symbolUrl: { type: String },
});

export const Candidate = mongoose.model('Candidate', candidateSchema);
