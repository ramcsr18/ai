import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Voter } from '../models/Voter';
import dotenv from 'dotenv';

dotenv.config();

export const verifyId = async (req: Request, res: Response) => {
    try {
        const { govtId, name } = req.body;

        if (!govtId || !name) {
            return res.status(400).json({ error: 'Govt ID and name are required' });
        }

        // Simulate Govt ID verification (e.g., EPIC or Aadhaar)
        // In a real app, this would be an API call to a govt database
        const govtIdHash = crypto.createHash('sha256').update(govtId).digest('hex');

        let voter = await Voter.findOne({ govtIdHash });

        if (!voter) {
            // Register new voter for simulation purposes
            voter = await Voter.create({
                govtIdHash,
                address: `simulated_address_${crypto.randomBytes(4).toString('hex')}`,
                isVerified: true,
            });
        }

        const token = jwt.sign({ voterId: voter._id, govtIdHash }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });

        res.json({
            token,
            message: 'Identity verified successfully',
            voter: {
                id: voter._id,
                isVerified: voter.isVerified,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getVotingToken = async (req: any, res: Response) => {
    try {
        const { nullifier } = req.body;
        const user = req.user;

        if (!user || !user.govtIdHash) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const govtIdHash = user.govtIdHash;

        // In a real scenario, we sign the nullifier using the backend's private key.
        // The smart contract then verifies this signature to ensure only verified voters can cast a vote.
        const privateKey = process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000';

        // Simplified signing for simulation:
        const signature = crypto.createHmac('sha256', privateKey)
            .update(nullifier + govtIdHash)
            .digest('hex');

        res.json({
            signature,
            message: 'Voting token generated successfully',
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
