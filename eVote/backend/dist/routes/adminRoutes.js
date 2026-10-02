"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const adminController = __importStar(require("../controllers/adminController"));
const router = (0, express_1.Router)();
// Constituency Routes
router.get('/constituencies', adminController.getConstituencies);
router.post('/constituencies', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN']), adminController.createConstituency);
// Polling Station Routes
router.get('/polling-stations', adminController.getPollingStations);
router.post('/polling-stations', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN', 'ELECTION_OFFICER']), adminController.createPollingStation);
// Booth Routes
router.get('/booths', adminController.getBooths);
router.post('/booths', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN', 'ELECTION_OFFICER']), adminController.createBooth);
// Party Routes
router.get('/parties', adminController.getParties);
router.post('/parties', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN']), adminController.createParty);
// Voter Management
router.patch('/voters/assign', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN', 'ELECTION_OFFICER']), adminController.assignVoter);
router.get('/voters/profile', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['VOTER', 'ADMIN', 'ELECTION_OFFICER']), adminController.getVoterProfile);
exports.default = router;
