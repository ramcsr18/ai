import { Router } from 'express';
import { verifyId, getVotingToken } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.post('/verify-id', verifyId);
router.post('/get-voting-token', authMiddleware, getVotingToken);

export default router;
