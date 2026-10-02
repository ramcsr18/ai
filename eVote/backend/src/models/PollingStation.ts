import mongoose from 'mongoose';

const pollingStationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    constituencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Constituency', required: true },
}, { timestamps: true });

export const PollingStation = mongoose.model('PollingStation', pollingStationSchema);
