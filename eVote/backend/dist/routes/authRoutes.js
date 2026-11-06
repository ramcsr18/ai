"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const authMiddleware_1 = require("../middleware/authMiddleware");
/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Voter authentication and verification APIs
 */
const router = (0, express_1.Router)();
/**
 * @openapi
 * /api/auth/test/government-id-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Test external government ID verification
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               govtId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test verification succeeded
 */
router.post('/test/government-id-verification', authController_1.testGovernmentVerification);
/**
 * @openapi
 * /api/auth/test/biometric-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Test biometric verification flow
 *     responses:
 *       200:
 *         description: Mock biometric verification response
 */
router.post('/test/biometric-verification', authController_1.testBiometricVerification);
/**
 * @openapi
 * /api/auth/verify-id:
 *   post:
 *     tags: [Auth]
 *     summary: Queue identity verification for a voter
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [govtId, name]
 *             properties:
 *               govtId:
 *                 type: string
 *               name:
 *                 type: string
 *               deviceId:
 *                 type: string
 *               faceTemplate:
 *                 type: string
 *               livenessResult:
 *                 type: object
 *     responses:
 *       202:
 *         description: Verification accepted and queued
 *       400:
 *         description: Missing required fields
 */
router.post('/verify-id', authController_1.verifyId);
/**
 * @openapi
 * /api/auth/verification-status/{id}:
 *   get:
 *     tags: [Auth]
 *     summary: Get the status of a queued verification job
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification status returned
 *       404:
 *         description: Verification job not found
 */
router.get('/verification-status/:id', authController_1.getVerificationStatus);
/**
 * @openapi
 * /api/auth/verify-live-voter:
 *   post:
 *     tags: [Auth]
 *     summary: Verify a live voter with biometric data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [govtId, name, deviceId, liveFaceTemplate]
 *             properties:
 *               govtId:
 *                 type: string
 *               name:
 *                 type: string
 *               deviceId:
 *                 type: string
 *               liveFaceTemplate:
 *                 type: string
 *               livenessResult:
 *                 type: object
 *     responses:
 *       200:
 *         description: Live voter verification succeeded
 *       403:
 *         description: Live biometric verification failed
 */
router.post('/verify-live-voter', authController_1.verifyLiveVoter);
/**
 * @openapi
 * /api/auth/get-voting-token:
 *   post:
 *     tags: [Auth]
 *     summary: Generate a voting token for an active election
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nullifier, electionId]
 *             properties:
 *               nullifier:
 *                 type: string
 *               electionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Voting token generated successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/get-voting-token', authMiddleware_1.authMiddleware, authController_1.getVotingToken);
exports.default = router;
