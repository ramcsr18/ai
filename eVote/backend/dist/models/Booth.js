"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Booth = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const boothSchema = new mongoose_1.default.Schema({
    boothNumber: { type: Number, required: true },
    stationId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'PollingStation', required: true },
    capacity: { type: Number, required: true },
}, { timestamps: true });
exports.Booth = mongoose_1.default.model('Booth', boothSchema);
