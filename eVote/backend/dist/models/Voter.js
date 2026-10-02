"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Voter = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const voterSchema = new mongoose_1.default.Schema({
    govtIdHash: { type: String, required: true, unique: true },
    nationalId: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true },
    physicalAddress: { type: String, required: true },
    address: { type: String, required: true }, // Blockchain address
    constituencyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Constituency' },
    stationId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'PollingStation' },
    boothId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Booth' },
    role: {
        type: String,
        enum: ['ADMIN', 'ELECTION_OFFICER', 'VOTER'],
        default: 'VOTER'
    },
    isVerified: { type: Boolean, default: false },
    lastLogin: { type: Date, default: Date.now },
});
exports.Voter = mongoose_1.default.model('Voter', voterSchema);
