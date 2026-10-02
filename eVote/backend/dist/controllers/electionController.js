"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createElection = exports.getElectionCandidates = exports.getActiveElections = void 0;
const Election_1 = require("../models/Election");
const Candidate_1 = require("../models/Candidate");
const getActiveElections = async (req, res) => {
    try {
        const now = new Date();
        await Election_1.Election.updateMany({ status: 'scheduled', startTime: { $lte: now }, endTime: { $gte: now } }, { $set: { status: 'active' } });
        await Election_1.Election.updateMany({ status: 'active', endTime: { $lt: now } }, { $set: { status: 'completed' } });
        const elections = await Election_1.Election.find({
            status: 'active',
            startTime: { $lte: now },
            endTime: { $gte: now },
        }).sort({ startTime: 1 });
        res.json(elections);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getActiveElections = getActiveElections;
const getElectionCandidates = async (req, res) => {
    try {
        const { id } = req.params;
        const candidates = await Candidate_1.Candidate.find({ electionId: id });
        res.json(candidates);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getElectionCandidates = getElectionCandidates;
const createElection = async (req, res) => {
    try {
        const { name, startTime, endTime, blockchainId, chainId, blockchainNetwork, contractAddress, constituencyId } = req.body;
        const parsedStart = new Date(startTime);
        const parsedEnd = new Date(endTime);
        if (!name || !constituencyId || !Number.isInteger(Number(blockchainId)) || !contractAddress || Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime()) || parsedEnd <= parsedStart) {
            return res.status(400).json({ error: 'Valid election dates, constituency, blockchain ID, and contract address are required' });
        }
        const now = new Date();
        const election = await Election_1.Election.create({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createElection = createElection;
