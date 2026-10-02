import mongoose from 'mongoose';

const boothSchema = new mongoose.Schema({
    boothNumber: { type: Number, required: true },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PollingStation', required: true },
    capacity: { type: Number, required: true },
}, { timestamps: true });

export const Booth = mongoose.model('Booth', boothSchema);
