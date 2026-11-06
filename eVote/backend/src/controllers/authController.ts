import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Voter } from '../models/Voter';
import { Election } from '../models/Election';
import { GovernmentVerificationError, verifyVoterWithGovernmentApi } from '../services/governmentVerificationService';
import { BiometricVerificationError, verifyBiometricWithService } from '../services/biometricVerificationService';
import { enqueueVerificationJob, getVerificationJobStatus } from '../queue/verificationQueue';
import dotenv from 'dotenv';

dotenv.config();

const biometricVerificationRequired = process.env.BIOMETRIC_VERIFICATION_REQUIRED !== 'false';

export const testGovernmentVerification = async (req: Request, res: Response) => {
    return res.json({
        verified: true,
        nationalId: req.body.govtId || 'TEST-NATIONAL-ID',
        dob: '1995-01-15',
        gender: 'Male',
        physicalAddress: 'Mock Government Address',
        message: 'Test government verification successful',
    });
};

export const testBiometricVerification = async (req: Request, res: Response) => {
    return res.json({
        verified: true,
        matchScore: 0.99,
        deviceTrusted: true,
        livenessPassed: true,
        reason: 'Test biometric verification successful',
    });
};

export const verifyId = async (req: Request, res: Response) => {
    try {
        const { govtId, name, deviceId, faceTemplate, livenessResult } = req.body;

        if (!govtId || !name) {
            return res.status(400).json({ error: 'Govt ID and name are required' });
        }

        if (biometricVerificationRequired && (!deviceId || !faceTemplate)) {
            return res.status(400).json({ error: 'Device ID and face template are required for biometric verification' });
        }

        const job = await enqueueVerificationJob({
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
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getVerificationStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const job = getVerificationJobStatus(id);

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

export const verifyLiveVoter = async (req: Request, res: Response) => {
    try {
        const { govtId, name, deviceId, liveFaceTemplate, livenessResult } = req.body;

        if (!govtId || !name || !deviceId || !liveFaceTemplate) {
            return res.status(400).json({ error: 'Government ID, name, device ID, and live face template are required' });
        }

        const govtIdHash = crypto.createHash('sha256').update(govtId).digest('hex');
        const voter = await Voter.findOne({ govtIdHash });

        if (!voter) {
            return res.status(404).json({ error: 'Voter not found; complete initial verification first' });
        }

        const biometricResult = await verifyBiometricWithService({
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

        const updatedVoter = await Voter.findOneAndUpdate(
            { govtIdHash },
            {
                biometricVerified: true,
                livenessVerified: true,
                deviceId,
                deviceTrustScore: biometricResult.matchScore ?? 0,
                deviceAttested: biometricResult.deviceTrusted ?? false,
                lastBiometricCheckAt: new Date(),
            },
            { new: true },
        );

        return res.json({
            verified: true,
            matchScore: biometricResult.matchScore,
            deviceTrusted: biometricResult.deviceTrusted,
            livenessPassed: biometricResult.livenessPassed,
            voterId: updatedVoter?._id,
            message: 'Live biometric verification successful',
        });
    } catch (error) {
        if (error instanceof BiometricVerificationError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
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
