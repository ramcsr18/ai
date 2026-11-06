import { randomUUID } from 'crypto';
import { verifyVoterWithGovernmentApi } from '../services/governmentVerificationService';
import { verifyBiometricWithService } from '../services/biometricVerificationService';

export type VerificationStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface VerificationJob {
  id: string;
  govtId: string;
  name: string;
  deviceId?: string;
  faceTemplate?: string;
  liveFaceTemplate?: string;
  livenessResult?: Record<string, any>;
  status: VerificationStatus;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  error?: string;
  matchScore?: number;
  deviceTrusted?: boolean;
  livenessPassed?: boolean;
  reason?: string;
}

const queue: VerificationJob[] = [];
let workerTimer: NodeJS.Timeout | null = null;

export const enqueueVerificationJob = async (
  payload: Omit<VerificationJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'verified'>,
): Promise<VerificationJob> => {
  const job: VerificationJob = {
    id: randomUUID(),
    status: 'queued',
    verified: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...payload,
  };

  queue.push(job);
  return job;
};

export const getVerificationJobQueue = () => queue;

export const getVerificationJobStatus = (jobId: string): VerificationJob | undefined =>
  queue.find((job) => job.id === jobId);

export const processVerificationQueue = async (): Promise<VerificationJob | null> => {
  const jobIndex = queue.findIndex((job) => job.status === 'queued');
  if (jobIndex === -1) {
    return null;
  }

  const job = queue[jobIndex];
  job.status = 'processing';
  job.updatedAt = new Date().toISOString();

  try {
    const governmentRecord = await verifyVoterWithGovernmentApi(job.govtId, job.name);
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
      biometricResult = await verifyBiometricWithService(biometricPayload);
    }

    const finalVerification = biometricResult ?? { verified: true, deviceTrusted: true, livenessPassed: true, matchScore: 1 };
    if (!finalVerification.verified || !finalVerification.deviceTrusted || !finalVerification.livenessPassed) {
      throw new Error(finalVerification.reason || 'Biometric verification failed');
    }

    const completedJob: VerificationJob = {
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
  } catch (error) {
    const failedJob: VerificationJob = {
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

export const startVerificationWorker = (intervalMs = 1000) => {
  if (workerTimer) {
    return workerTimer;
  }

  workerTimer = setInterval(() => {
    void processVerificationQueue();
  }, intervalMs);

  return workerTimer;
};

export const stopVerificationWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
};
