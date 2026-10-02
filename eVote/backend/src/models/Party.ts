import mongoose from 'mongoose';

const partySchema = new mongoose.Schema({
    name: { type: String, required: true },
    abbreviation: { type: String, required: true },
    logoUrl: { type: String },
}, { timestamps: true });

export const Party = mongoose.model('Party', partySchema);
