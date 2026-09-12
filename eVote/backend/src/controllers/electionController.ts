import { Request, Response } from 'express';
import { Election } from '../models/Election';
import { Candidate } from '../models/Candidate';

export const getActiveElections = async (req: Request, res: Response) => {
    try {
        const elections = await Election.find({ status: 'active' });
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
        const { name, startTime, endTime, blockchainId } = req.body;
        const election = await Election.create({
            name,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            blockchainId,
            status: 'active'
        });
        res.status(201).json(election);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
