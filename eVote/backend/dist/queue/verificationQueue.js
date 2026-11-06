"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopVerificationWorker = exports.startVerificationWorker = exports.processVerificationQueue = exports.getVerificationJobStatus = exports.getVerificationJobQueue = exports.enqueueVerificationJob = void 0;
const crypto_1 = require("crypto");
const governmentVerificationService_1 = require("../services/governmentVerificationService");
const biometricVerificationService_1 = require("../services/biometricVerificationService");
const queue = [];
let workerTimer = null;
const enqueueVerificationJob = async (payload) => {
    const job = {
        id: (0, crypto_1.randomUUID)(),
        status: 'queued',
        verified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...payload,
    };
    queue.push(job);
    return job;
};
exports.enqueueVerificationJob = enqueueVerificationJob;
const getVerificationJobQueue = () => queue;
exports.getVerificationJobQueue = getVerificationJobQueue;
const getVerificationJobStatus = (jobId) => queue.find((job) => job.id === jobId);
exports.getVerificationJobStatus = getVerificationJobStatus;
const processVerificationQueue = async () => {
    const jobIndex = queue.findIndex((job) => job.status === 'queued');
    if (jobIndex === -1) {
        return null;
    }
    const job = queue[jobIndex];
    job.status = 'processing';
    job.updatedAt = new Date().toISOString();
    try {
        const governmentRecord = await (0, governmentVerificationService_1.verifyVoterWithGovernmentApi)(job.govtId, job.name);
        if (!governmentRecord.verified) {
            throw new Error('Government verification failed');
        }
        const biometricPayload = {
            govtId: job.govtId,
            name: job.name,
            deviceId: job.deviceId,
            faceTemplate: job.faceTemplate,
            liveFaceTemplate: job.liveFaceTemplate,
            livenessResult: job.livenessResult,
        };
        let biometricResult = null;
        if (job.deviceId && (job.faceTemplate || job.liveFaceTemplate)) {
            biometricResult = await (0, biometricVerificationService_1.verifyBiometricWithService)(biometricPayload);
        }
        const finalVerification = biometricResult ?? { verified: true, deviceTrusted: true, livenessPassed: true, matchScore: 1 };
        if (!finalVerification.verified || !finalVerification.deviceTrusted || !finalVerification.livenessPassed) {
            throw new Error(finalVerification.reason || 'Biometric verification failed');
        }
        const completedJob = {
            ...job,
            status: 'completed',
            verified: true,
            deviceTrusted: finalVerification.deviceTrusted,
            livenessPassed: finalVerification.livenessPassed,
            matchScore: finalVerification.matchScore,
            reason: finalVerification.reason,
            updatedAt: new Date().toISOString(),
        };
        queue[jobIndex] = completedJob;
        return completedJob;
    }
    catch (error) {
        const failedJob = {
            ...job,
            status: 'failed',
            verified: false,
            error: error instanceof Error ? error.message : 'Verification failed',
            updatedAt: new Date().toISOString(),
        };
        queue[jobIndex] = failedJob;
        return failedJob;
    }
};
exports.processVerificationQueue = processVerificationQueue;
const startVerificationWorker = (intervalMs = 1000) => {
    if (workerTimer) {
        return workerTimer;
    }
    workerTimer = setInterval(() => {
        void (0, exports.processVerificationQueue)();
    }, intervalMs);
    return workerTimer;
};
exports.startVerificationWorker = startVerificationWorker;
const stopVerificationWorker = () => {
    if (workerTimer) {
        clearInterval(workerTimer);
        workerTimer = null;
    }
};
exports.stopVerificationWorker = stopVerificationWorker;
