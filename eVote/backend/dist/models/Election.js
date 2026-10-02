"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Election = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const electionSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ['active', 'completed', 'scheduled'], default: 'scheduled' },
    blockchainId: { type: Number, required: true }, // ID of the election on the smart contract
    chainId: { type: Number, required: true, default: 80002 }, // Network chain ID, e.g. Polygon Amoy
    blockchainNetwork: { type: String, required: true, default: 'polygon-amoy' },
    contractAddress: { type: String, required: true }, // Election contract deployed on this network
    constituencyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Constituency', required: true },
});
exports.Election = mongoose_1.default.model('Election', electionSchema);
