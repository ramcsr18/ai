"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVotingToken = exports.verifyLiveVoter = exports.getVerificationStatus = exports.verifyId = exports.testBiometricVerification = exports.testGovernmentVerification = void 0;
const crypto_1 = __importDefault(require("crypto"));
const Voter_1 = require("../models/Voter");
const Election_1 = require("../models/Election");
const biometricVerificationService_1 = require("../services/biometricVerificationService");
const verificationQueue_1 = require("../queue/verificationQueue");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const biometricVerificationRequired = process.env.BIOMETRIC_VERIFICATION_REQUIRED !== 'false';
const testGovernmentVerification = async (req, res) => {
    return res.json({
        verified: true,
        nationalId: req.body.govtId || 'TEST-NATIONAL-ID',
        dob: '1995-01-15',
        gender: 'Male',
        physicalAddress: 'Mock Government Address',
        message: 'Test government verification successful',
    });
};
exports.testGovernmentVerification = testGovernmentVerification;
const testBiometricVerification = async (req, res) => {
    return res.json({
        verified: true,
        matchScore: 0.99,
        deviceTrusted: true,
        livenessPassed: true,
        reason: 'Test biometric verification successful',
    });
};
exports.testBiometricVerification = testBiometricVerification;
const verifyId = async (req, res) => {
    try {
        const { govtId, name, deviceId, faceTemplate, livenessResult } = req.body;
        if (!govtId || !name) {
            return res.status(400).json({ error: 'Govt ID and name are required' });
        }
        if (biometricVerificationRequired && (!deviceId || !faceTemplate)) {
            return res.status(400).json({ error: 'Device ID and face template are required for biometric verification' });
        }
        const job = await (0, verificationQueue_1.enqueueVerificationJob)({
            govtId,
            name,
            deviceId,
            faceTemplate,
            livenessResult,
        });
        return res.status(202).json({
            status: job.status,
            requestId: job.id,
            message: 'Verification queued successfully',
        });
    }
    catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.verifyId = verifyId;
const getVerificationStatus = async (req, res) => {
    const { id } = req.params;
    const job = (0, verificationQueue_1.getVerificationJobStatus)(id);
    if (!job) {
        return res.status(404).json({ error: 'Verification job not found' });
    }
    return res.json({
        id: job.id,
        status: job.status,
        verified: job.verified,
        matchScore: job.matchScore,
        deviceTrusted: job.deviceTrusted,
        livenessPassed: job.livenessPassed,
        error: job.error,
        reason: job.reason,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    });
};
exports.getVerificationStatus = getVerificationStatus;
const verifyLiveVoter = async (req, res) => {
    try {
        const { govtId, name, deviceId, liveFaceTemplate, livenessResult } = req.body;
        if (!govtId || !name || !deviceId || !liveFaceTemplate) {
            return res.status(400).json({ error: 'Government ID, name, device ID, and live face template are required' });
        }
        const govtIdHash = crypto_1.default.createHash('sha256').update(govtId).digest('hex');
        const voter = await Voter_1.Voter.findOne({ govtIdHash });
        if (!voter) {
            return res.status(404).json({ error: 'Voter not found; complete initial verification first' });
        }
        const biometricResult = await (0, biometricVerificationService_1.verifyBiometricWithService)({
            govtId,
            name,
            deviceId,
            liveFaceTemplate,
            livenessResult,
        });
        if (!biometricResult.verified || !biometricResult.deviceTrusted || !biometricResult.livenessPassed) {
            return res.status(403).json({
                error: biometricResult.reason || 'Live biometric verification failed',
                matchScore: biometricResult.matchScore,
            });
        }
        const updatedVoter = await Voter_1.Voter.findOneAndUpdate({ govtIdHash }, {
            biometricVerified: true,
            livenessVerified: true,
            deviceId,
            deviceTrustScore: biometricResult.matchScore ?? 0,
            deviceAttested: biometricResult.deviceTrusted ?? false,
            lastBiometricCheckAt: new Date(),
        }, { new: true });
        return res.json({
            verified: true,
            matchScore: biometricResult.matchScore,
            deviceTrusted: biometricResult.deviceTrusted,
            livenessPassed: biometricResult.livenessPassed,
            voterId: updatedVoter?._id,
            message: 'Live biometric verification successful',
        });
    }
    catch (error) {
        if (error instanceof biometricVerificationService_1.BiometricVerificationError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.verifyLiveVoter = verifyLiveVoter;
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
