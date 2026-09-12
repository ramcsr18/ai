import mongoose from 'mongoose';

const voterSchema = new mongoose.Schema({
    govtIdHash: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    lastLogin: { type: Date, default: Date.now },
});

export const Voter = mongoose.model('Voter', voterSchema);
