import { Request, Response } from 'express';
import { Election } from '../models/Election';
import { Candidate } from '../models/Candidate';

export const getActiveElections = async (req: Request, res: Response) => {
    try {
        const now = new Date();
        await Election.updateMany(
            { status: 'scheduled', startTime: { $lte: now }, endTime: { $gte: now } },
            { $set: { status: 'active' } },
        );
        await Election.updateMany(
            { status: 'active', endTime: { $lt: now } },
            { $set: { status: 'completed' } },
        );
        const elections = await Election.find({
            status: 'active',
            startTime: { $lte: now },
            endTime: { $gte: now },
        }).sort({ startTime: 1 });
        res.json(elections);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getElectionCandidates = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const candidates = await Candidate.find({ electionId: id });
        res.json(candidates);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createElection = async (req: Request, res: Response) => {
    try {
        const { name, startTime, endTime, blockchainId, chainId, blockchainNetwork, contractAddress, constituencyId } = req.body;
        const parsedStart = new Date(startTime);
        const parsedEnd = new Date(endTime);

        if (!name || !constituencyId || !Number.isInteger(Number(blockchainId)) || !contractAddress || Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime()) || parsedEnd <= parsedStart) {
            return res.status(400).json({ error: 'Valid election dates, constituency, blockchain ID, and contract address are required' });
        }

        const now = new Date();
        const election = await Election.create({
            name,
            startTime: parsedStart,
            endTime: parsedEnd,
            blockchainId: Number(blockchainId),
            chainId: Number.isInteger(Number(chainId)) ? Number(chainId) : 80002,
            blockchainNetwork: blockchainNetwork || 'polygon-amoy',
            contractAddress,
            constituencyId,
            status: parsedStart <= now && parsedEnd >= now ? 'active' : 'scheduled',
        });
        res.status(201).json(election);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
