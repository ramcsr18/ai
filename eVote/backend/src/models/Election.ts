import mongoose from 'mongoose';

const electionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ['active', 'completed', 'scheduled'], default: 'scheduled' },
    blockchainId: { type: Number, required: true }, // ID of the election on the smart contract
});

export const Election = mongoose.model('Election', electionSchema);
