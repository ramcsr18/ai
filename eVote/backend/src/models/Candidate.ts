import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema({
    electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    constituencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Constituency', required: true },
    blockchainCandidateId: { type: Number, required: true },
    name: { type: String, required: true },
    bio: { type: String },
    photoUrl: { type: String },
    symbolUrl: { type: String },
});

export const Candidate = mongoose.model('Candidate', candidateSchema);
