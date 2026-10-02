"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Candidate = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const candidateSchema = new mongoose_1.default.Schema({
    electionId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Election', required: true },
    partyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Party', required: true },
    constituencyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Constituency', required: true },
    blockchainCandidateId: { type: Number, required: true },
    name: { type: String, required: true },
    bio: { type: String },
    photoUrl: { type: String },
    symbolUrl: { type: String },
});
exports.Candidate = mongoose_1.default.model('Candidate', candidateSchema);
