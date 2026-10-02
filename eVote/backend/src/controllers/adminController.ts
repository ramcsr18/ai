import { Request, Response } from 'express';
import { Constituency } from '../models/Constituency';
import { PollingStation } from '../models/PollingStation';
import { Booth } from '../models/Booth';
import { Party } from '../models/Party';
import { Voter } from '../models/Voter';

export const createConstituency = async (req: Request, res: Response) => {
    try {
        const { name, code, region } = req.body;
        const constituency = await Constituency.create({ name, code, region });
        res.status(201).json(constituency);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getConstituencies = async (req: Request, res: Response) => {
    try {
        const constituencies = await Constituency.find();
        res.json(constituencies);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createPollingStation = async (req: Request, res: Response) => {
    try {
        const { name, address, constituencyId } = req.body;
        const station = await PollingStation.create({ name, address, constituencyId });
        res.status(201).json(station);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getPollingStations = async (req: Request, res: Response) => {
    try {
        const { constituencyId } = req.query;
        const filter = constituencyId ? { constituencyId } : {};
        const stations = await PollingStation.find(filter);
        res.json(stations);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createBooth = async (req: Request, res: Response) => {
    try {
        const { boothNumber, stationId, capacity } = req.body;
        const booth = await Booth.create({ boothNumber, stationId, capacity });
        res.status(201).json(booth);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getBooths = async (req: Request, res: Response) => {
    try {
        const { stationId } = req.query;
        const filter = stationId ? { stationId } : {};
        const booths = await Booth.find(filter);
        res.json(booths);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createParty = async (req: Request, res: Response) => {
    try {
        const { name, abbreviation, logoUrl } = req.body;
        const party = await Party.create({ name, abbreviation, logoUrl });
        res.status(201).json(party);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getParties = async (req: Request, res: Response) => {
    try {
        const parties = await Party.find();
        res.json(parties);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const assignVoter = async (req: Request, res: Response) => {
    try {
        const { voterId, constituencyId, stationId, boothId } = req.body;
        const voter = await Voter.findByIdAndUpdate(
            voterId,
            { constituencyId, stationId, boothId },
            { new: true }
        );
        if (!voter) return res.status(404).json({ error: 'Voter not found' });
        res.json(voter);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getVoterProfile = async (req: any, res: Response) => {
    try {
        const voterId = req.user.voterId;
        const voter = await Voter.findById(voterId)
            .populate('constituencyId')
            .populate('stationId')
            .populate('boothId');

        if (!voter) return res.status(404).json({ error: 'Voter profile not found' });
        res.json(voter);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
