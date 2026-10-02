import mongoose from 'mongoose';

const electionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ['active', 'completed', 'scheduled'], default: 'scheduled' },
    blockchainId: { type: Number, required: true }, // ID of the election on the smart contract
    chainId: { type: Number, required: true, default: 80002 }, // Network chain ID, e.g. Polygon Amoy
    blockchainNetwork: { type: String, required: true, default: 'polygon-amoy' },
    contractAddress: { type: String, required: true }, // Election contract deployed on this network
    constituencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Constituency', required: true },
});

export const Election = mongoose.model('Election', electionSchema);
