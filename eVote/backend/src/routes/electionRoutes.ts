import { Router } from 'express';
import { getActiveElections, getElectionCandidates, createElection } from '../controllers/electionController';
import { authMiddleware } from '../middleware/authMiddleware';

/**
 * @openapi
 * tags:
 *   - name: Elections
 *     description: Election and candidate lookup APIs
 */
const router = Router();

/**
 * @openapi
 * /api/elections:
 *   get:
 *     tags: [Elections]
 *     summary: List all active elections
 *     responses:
 *       200:
 *         description: Active elections returned
 */
router.get('/', getActiveElections);

/**
 * @openapi
 * /api/elections/{id}/candidates:
 *   get:
 *     tags: [Elections]
 *     summary: Get candidates for a specific election
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Candidates returned
 */
router.get('/:id/candidates', getElectionCandidates);

/**
 * @openapi
 * /api/elections:
 *   post:
 *     tags: [Elections]
 *     summary: Create a new election record
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, startTime, endTime, blockchainId, contractAddress, constituencyId]
 *             properties:
 *               name:
 *                 type: string
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               endTime:
 *                 type: string
 *                 format: date-time
 *               blockchainId:
 *                 type: integer
 *               chainId:
 *                 type: integer
 *               blockchainNetwork:
 *                 type: string
 *               contractAddress:
 *                 type: string
 *               constituencyId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Election created successfully
 *       400:
 *         description: Invalid election payload
 */
router.post('/', authMiddleware, createElection);

export default router;
