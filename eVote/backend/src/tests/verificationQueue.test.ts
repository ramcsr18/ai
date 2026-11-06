import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueVerificationJob, getVerificationJobQueue, processVerificationQueue } from '../queue/verificationQueue';

describe('verification queue', () => {
  it('enqueues a job and processes it to completed when verification succeeds', async () => {
    process.env.USE_TEST_VERIFICATION_API = 'true';

    const job = await enqueueVerificationJob({
      govtId: 'TEST-ID-123',
      name: 'Jane Doe',
      deviceId: 'device-1',
      faceTemplate: 'face-template',
      livenessResult: { blinkPassed: true, turnHeadPassed: true },
    });

    const result = await processVerificationQueue();

    const queuedJob = getVerificationJobQueue().find((item) => item.id === job.id);
    assert.ok(queuedJob);
    assert.equal(queuedJob?.status, 'completed');
    assert.equal(result?.id, job.id);
    assert.equal(result?.verified, true);
  });
});
