import mongoose from 'mongoose';

const voterSchema = new mongoose.Schema({
    govtIdHash: { type: String, required: true, unique: true },
    nationalId: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true },
    physicalAddress: { type: String, required: true },
    address: { type: String, required: true }, // Blockchain address
    constituencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Constituency' },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PollingStation' },
    boothId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booth' },
    role: {
        type: String,
        enum: ['ADMIN', 'ELECTION_OFFICER', 'VOTER'],
        default: 'VOTER'
    },
    isVerified: { type: Boolean, default: false },
    lastLogin: { type: Date, default: Date.now },
});

export const Voter = mongoose.model('Voter', voterSchema);
