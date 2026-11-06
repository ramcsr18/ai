"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const verificationQueue_1 = require("../queue/verificationQueue");
(0, node_test_1.describe)('verification queue', () => {
    (0, node_test_1.it)('enqueues a job and processes it to completed when verification succeeds', async () => {
        process.env.USE_TEST_VERIFICATION_API = 'true';
        const job = await (0, verificationQueue_1.enqueueVerificationJob)({
            govtId: 'TEST-ID-123',
            name: 'Jane Doe',
            deviceId: 'device-1',
            faceTemplate: 'face-template',
            livenessResult: { blinkPassed: true, turnHeadPassed: true },
        });
        const result = await (0, verificationQueue_1.processVerificationQueue)();
        const queuedJob = (0, verificationQueue_1.getVerificationJobQueue)().find((item) => item.id === job.id);
        strict_1.default.ok(queuedJob);
        strict_1.default.equal(queuedJob?.status, 'completed');
        strict_1.default.equal(result?.id, job.id);
        strict_1.default.equal(result?.verified, true);
    });
});
