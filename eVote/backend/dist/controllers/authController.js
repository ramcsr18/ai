"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVotingToken = exports.verifyId = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const Voter_1 = require("../models/Voter");
const Election_1 = require("../models/Election");
const governmentVerificationService_1 = require("../services/governmentVerificationService");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const verifyId = async (req, res) => {
    try {
        const { govtId, name } = req.body;
        if (!govtId || !name) {
            return res.status(400).json({ error: 'Govt ID and name are required' });
        }
        const governmentVoter = await (0, governmentVerificationService_1.verifyVoterWithGovernmentApi)(govtId, name);
        if (!governmentVoter.verified) {
            return res.status(401).json({ error: 'Government identity verification failed' });
        }
        const govtIdHash = crypto_1.default.createHash('sha256').update(govtId).digest('hex');
        const voter = await Voter_1.Voter.findOneAndUpdate({ govtIdHash }, {
            govtIdHash,
            nationalId: governmentVoter.nationalId,
            dob: governmentVoter.dob,
            gender: governmentVoter.gender,
            physicalAddress: governmentVoter.physicalAddress,
            isVerified: true,
            role: 'VOTER',
            $setOnInsert: { address: `0x${crypto_1.default.randomBytes(20).toString('hex')}` },
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        const token = jsonwebtoken_1.default.sign({ voterId: voter._id, govtIdHash, role: voter.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
        res.json({
            token,
            message: 'Identity verified successfully',
            voter: {
                id: voter._id,
                isVerified: voter.isVerified,
            },
        });
    }
    catch (error) {
        if (error instanceof governmentVerificationService_1.GovernmentVerificationError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.verifyId = verifyId;
const getVotingToken = async (req, res) => {
    try {
        const { nullifier, electionId } = req.body;
        const user = req.user;
        if (!user || !user.govtIdHash) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (!nullifier || !electionId) {
            return res.status(400).json({ error: 'Nullifier and election ID are required' });
        }
        const election = await Election_1.Election.findOne({ _id: electionId, status: 'active' });
        const now = new Date();
        if (!election || election.startTime > now || election.endTime < now) {
            return res.status(400).json({ error: 'Election is not currently active' });
        }
        const govtIdHash = user.govtIdHash;
        // In a real scenario, we sign the nullifier using the backend's private key.
        // The smart contract then verifies this signature to ensure only verified voters can cast a vote.
        const privateKey = process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000';
        // Simplified signing for simulation:
        const signature = crypto_1.default.createHmac('sha256', privateKey)
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getVotingToken = getVotingToken;
