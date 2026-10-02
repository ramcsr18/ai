import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Voter } from '../models/Voter';
import { Election } from '../models/Election';
import { GovernmentVerificationError, verifyVoterWithGovernmentApi } from '../services/governmentVerificationService';
import dotenv from 'dotenv';

dotenv.config();

export const verifyId = async (req: Request, res: Response) => {
    try {
        const { govtId, name } = req.body;

        if (!govtId || !name) {
            return res.status(400).json({ error: 'Govt ID and name are required' });
        }

        const governmentVoter = await verifyVoterWithGovernmentApi(govtId, name);
        if (!governmentVoter.verified) {
            return res.status(401).json({ error: 'Government identity verification failed' });
        }

        const govtIdHash = crypto.createHash('sha256').update(govtId).digest('hex');

        const voter = await Voter.findOneAndUpdate(
            { govtIdHash },
            {
                govtIdHash,
                nationalId: governmentVoter.nationalId,
                dob: governmentVoter.dob,
                gender: governmentVoter.gender,
                physicalAddress: governmentVoter.physicalAddress,
                isVerified: true,
                role: 'VOTER',
                $setOnInsert: { address: `0x${crypto.randomBytes(20).toString('hex')}` },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        const token = jwt.sign({ voterId: voter._id, govtIdHash, role: voter.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });

        res.json({
            token,
            message: 'Identity verified successfully',
            voter: {
                id: voter._id,
                isVerified: voter.isVerified,
            },
        });
    } catch (error) {
        if (error instanceof GovernmentVerificationError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getVotingToken = async (req: any, res: Response) => {
    try {
        const { nullifier, electionId } = req.body;
        const user = req.user;

        if (!user || !user.govtIdHash) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        if (!nullifier || !electionId) {
            return res.status(400).json({ error: 'Nullifier and election ID are required' });
        }

        const election = await Election.findOne({ _id: electionId, status: 'active' });
        const now = new Date();
        if (!election || election.startTime > now || election.endTime < now) {
            return res.status(400).json({ error: 'Election is not currently active' });
        }

        const govtIdHash = user.govtIdHash;

        // In a real scenario, we sign the nullifier using the backend's private key.
        // The smart contract then verifies this signature to ensure only verified voters can cast a vote.
        const privateKey = process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000';

        // Simplified signing for simulation:
        const signature = crypto.createHmac('sha256', privateKey)
            .update(`${election._id}:${election.chainId}:${election.contractAddress}:${nullifier}:${govtIdHash}`)
            .digest('hex');

        res.json({
            signature,
            electionId: election._id,
            chainId: election.chainId,
            blockchainNetwork: election.blockchainNetwork,
            contractAddress: election.contractAddress,
            message: 'Voting token generated successfully',
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
