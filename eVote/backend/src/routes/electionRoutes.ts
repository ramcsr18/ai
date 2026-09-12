import { Router } from 'express';
import { getActiveElections, getElectionCandidates, createElection } from '../controllers/electionController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.get('/', getActiveElections);
router.get('/:id/candidates', getElectionCandidates);
router.post('/', authMiddleware, createElection);

export default router;
