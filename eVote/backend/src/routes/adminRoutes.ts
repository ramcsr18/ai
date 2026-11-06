import { Router } from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';
import * as adminController from '../controllers/adminController';

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Administrative records and voter management APIs
 */
const router = Router();

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
router.post('/constituencies', authMiddleware, roleMiddleware(['ADMIN']), adminController.createConstituency);

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
router.post('/polling-stations', authMiddleware, roleMiddleware(['ADMIN', 'ELECTION_OFFICER']), adminController.createPollingStation);

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
router.post('/booths', authMiddleware, roleMiddleware(['ADMIN', 'ELECTION_OFFICER']), adminController.createBooth);

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
router.post('/parties', authMiddleware, roleMiddleware(['ADMIN']), adminController.createParty);

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
router.patch('/voters/assign', authMiddleware, roleMiddleware(['ADMIN', 'ELECTION_OFFICER']), adminController.assignVoter);

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
router.get('/voters/profile', authMiddleware, roleMiddleware(['VOTER', 'ADMIN', 'ELECTION_OFFICER']), adminController.getVoterProfile);

export default router;
