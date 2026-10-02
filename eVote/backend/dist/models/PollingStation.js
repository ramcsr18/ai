"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PollingStation = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const pollingStationSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    constituencyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Constituency', required: true },
}, { timestamps: true });
exports.PollingStation = mongoose_1.default.model('PollingStation', pollingStationSchema);
