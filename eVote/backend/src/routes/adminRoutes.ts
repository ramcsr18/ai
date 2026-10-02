import { Router } from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware';
import * as adminController from '../controllers/adminController';

const router = Router();

// Constituency Routes
router.get('/constituencies', adminController.getConstituencies);
router.post('/constituencies', authMiddleware, roleMiddleware(['ADMIN']), adminController.createConstituency);

// Polling Station Routes
router.get('/polling-stations', adminController.getPollingStations);
router.post('/polling-stations', authMiddleware, roleMiddleware(['ADMIN', 'ELECTION_OFFICER']), adminController.createPollingStation);

// Booth Routes
router.get('/booths', adminController.getBooths);
router.post('/booths', authMiddleware, roleMiddleware(['ADMIN', 'ELECTION_OFFICER']), adminController.createBooth);

// Party Routes
router.get('/parties', adminController.getParties);
router.post('/parties', authMiddleware, roleMiddleware(['ADMIN']), adminController.createParty);

// Voter Management
router.patch('/voters/assign', authMiddleware, roleMiddleware(['ADMIN', 'ELECTION_OFFICER']), adminController.assignVoter);
router.get('/voters/profile', authMiddleware, roleMiddleware(['VOTER', 'ADMIN', 'ELECTION_OFFICER']), adminController.getVoterProfile);

export default router;
