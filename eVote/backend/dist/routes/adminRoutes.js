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
/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Administrative records and voter management APIs
 */
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/admin/constituencies:
 *   get:
 *     tags: [Admin]
 *     summary: List constituencies
 *     responses:
 *       200:
 *         description: Constituencies returned
 */
router.get('/constituencies', adminController.getConstituencies);
/**
 * @openapi
 * /api/admin/constituencies:
 *   post:
 *     tags: [Admin]
 *     summary: Create a constituency
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Constituency created
 */
router.post('/constituencies', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN']), adminController.createConstituency);
/**
 * @openapi
 * /api/admin/polling-stations:
 *   get:
 *     tags: [Admin]
 *     summary: List polling stations
 *     responses:
 *       200:
 *         description: Polling stations returned
 */
router.get('/polling-stations', adminController.getPollingStations);
/**
 * @openapi
 * /api/admin/polling-stations:
 *   post:
 *     tags: [Admin]
 *     summary: Create a polling station
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Polling station created
 */
router.post('/polling-stations', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN', 'ELECTION_OFFICER']), adminController.createPollingStation);
/**
 * @openapi
 * /api/admin/booths:
 *   get:
 *     tags: [Admin]
 *     summary: List booths
 *     responses:
 *       200:
 *         description: Booth list returned
 */
router.get('/booths', adminController.getBooths);
/**
 * @openapi
 * /api/admin/booths:
 *   post:
 *     tags: [Admin]
 *     summary: Create a booth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Booth created
 */
router.post('/booths', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN', 'ELECTION_OFFICER']), adminController.createBooth);
/**
 * @openapi
 * /api/admin/parties:
 *   get:
 *     tags: [Admin]
 *     summary: List parties
 *     responses:
 *       200:
 *         description: Parties returned
 */
router.get('/parties', adminController.getParties);
/**
 * @openapi
 * /api/admin/parties:
 *   post:
 *     tags: [Admin]
 *     summary: Create a party
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Party created
 */
router.post('/parties', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN']), adminController.createParty);
/**
 * @openapi
 * /api/admin/voters/assign:
 *   patch:
 *     tags: [Admin]
 *     summary: Assign a voter to a booth or constituency
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Voter assigned successfully
 */
router.patch('/voters/assign', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['ADMIN', 'ELECTION_OFFICER']), adminController.assignVoter);
/**
 * @openapi
 * /api/admin/voters/profile:
 *   get:
 *     tags: [Admin]
 *     summary: Get the current voter profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Voter profile returned
 */
router.get('/voters/profile', authMiddleware_1.authMiddleware, (0, authMiddleware_1.roleMiddleware)(['VOTER', 'ADMIN', 'ELECTION_OFFICER']), adminController.getVoterProfile);
exports.default = router;
