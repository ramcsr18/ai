"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Constituency = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const constituencySchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    region: { type: String, required: true },
}, { timestamps: true });
exports.Constituency = mongoose_1.default.model('Constituency', constituencySchema);
