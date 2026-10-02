"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Party = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const partySchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    abbreviation: { type: String, required: true },
    logoUrl: { type: String },
}, { timestamps: true });
exports.Party = mongoose_1.default.model('Party', partySchema);
