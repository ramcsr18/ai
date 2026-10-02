import mongoose from 'mongoose';

const constituencySchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    region: { type: String, required: true },
}, { timestamps: true });

export const Constituency = mongoose.model('Constituency', constituencySchema);
