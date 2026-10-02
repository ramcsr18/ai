"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVoterProfile = exports.assignVoter = exports.getParties = exports.createParty = exports.getBooths = exports.createBooth = exports.getPollingStations = exports.createPollingStation = exports.getConstituencies = exports.createConstituency = void 0;
const Constituency_1 = require("../models/Constituency");
const PollingStation_1 = require("../models/PollingStation");
const Booth_1 = require("../models/Booth");
const Party_1 = require("../models/Party");
const Voter_1 = require("../models/Voter");
const createConstituency = async (req, res) => {
    try {
        const { name, code, region } = req.body;
        const constituency = await Constituency_1.Constituency.create({ name, code, region });
        res.status(201).json(constituency);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createConstituency = createConstituency;
const getConstituencies = async (req, res) => {
    try {
        const constituencies = await Constituency_1.Constituency.find();
        res.json(constituencies);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getConstituencies = getConstituencies;
const createPollingStation = async (req, res) => {
    try {
        const { name, address, constituencyId } = req.body;
        const station = await PollingStation_1.PollingStation.create({ name, address, constituencyId });
        res.status(201).json(station);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createPollingStation = createPollingStation;
const getPollingStations = async (req, res) => {
    try {
        const { constituencyId } = req.query;
        const filter = constituencyId ? { constituencyId } : {};
        const stations = await PollingStation_1.PollingStation.find(filter);
        res.json(stations);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getPollingStations = getPollingStations;
const createBooth = async (req, res) => {
    try {
        const { boothNumber, stationId, capacity } = req.body;
        const booth = await Booth_1.Booth.create({ boothNumber, stationId, capacity });
        res.status(201).json(booth);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createBooth = createBooth;
const getBooths = async (req, res) => {
    try {
        const { stationId } = req.query;
        const filter = stationId ? { stationId } : {};
        const booths = await Booth_1.Booth.find(filter);
        res.json(booths);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getBooths = getBooths;
const createParty = async (req, res) => {
    try {
        const { name, abbreviation, logoUrl } = req.body;
        const party = await Party_1.Party.create({ name, abbreviation, logoUrl });
        res.status(201).json(party);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createParty = createParty;
const getParties = async (req, res) => {
    try {
        const parties = await Party_1.Party.find();
        res.json(parties);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getParties = getParties;
const assignVoter = async (req, res) => {
    try {
        const { voterId, constituencyId, stationId, boothId } = req.body;
        const voter = await Voter_1.Voter.findByIdAndUpdate(voterId, { constituencyId, stationId, boothId }, { new: true });
        if (!voter)
            return res.status(404).json({ error: 'Voter not found' });
        res.json(voter);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.assignVoter = assignVoter;
const getVoterProfile = async (req, res) => {
    try {
        const voterId = req.user.voterId;
        const voter = await Voter_1.Voter.findById(voterId)
            .populate('constituencyId')
            .populate('stationId')
            .populate('boothId');
        if (!voter)
            return res.status(404).json({ error: 'Voter profile not found' });
        res.json(voter);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getVoterProfile = getVoterProfile;
