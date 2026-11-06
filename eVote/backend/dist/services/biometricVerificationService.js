"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyBiometricWithService = exports.BiometricVerificationError = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class BiometricVerificationError extends Error {
    constructor(message, statusCode = 502) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'BiometricVerificationError';
    }
}
exports.BiometricVerificationError = BiometricVerificationError;
const verifyBiometricWithService = async (payload) => {
    const mockMode = process.env.USE_TEST_VERIFICATION_API === 'true';
    if (mockMode) {
        return {
            verified: true,
            matchScore: 0.99,
            deviceTrusted: true,
            livenessPassed: true,
            reason: 'Mock biometric verification successful',
        };
    }
    const apiUrl = process.env.BIOMETRIC_VERIFICATION_API_URL;
    if (!apiUrl) {
        throw new BiometricVerificationError('Biometric verification API is not configured', 503);
    }
    const timeoutMs = Number(process.env.BIOMETRIC_VERIFICATION_TIMEOUT_MS || 5000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (process.env.BIOMETRIC_VERIFICATION_API_KEY) {
            headers.Authorization = `Bearer ${process.env.BIOMETRIC_VERIFICATION_API_KEY}`;
        }
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new BiometricVerificationError(`Biometric verification API returned ${response.status}`);
        }
        const body = await response.json();
        const verified = Boolean(body.verified);
        const matchScore = typeof body.matchScore === 'number' ? body.matchScore : 0.95;
        const deviceTrusted = body.deviceTrusted ?? true;
        const livenessPassed = body.livenessPassed ?? true;
        if (!verified || !deviceTrusted || !livenessPassed) {
            return {
                verified: false,
                matchScore,
                deviceTrusted,
                livenessPassed,
                reason: body.reason || 'Biometric verification failed',
            };
        }
        return {
            verified: true,
            matchScore,
            deviceTrusted,
            livenessPassed,
            reason: body.reason || 'Biometric verification successful',
        };
    }
    catch (error) {
        if (error instanceof BiometricVerificationError) {
            throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
            throw new BiometricVerificationError('Biometric verification API timed out', 504);
        }
        throw new BiometricVerificationError('Biometric verification API is unavailable', 502);
    }
    finally {
        clearTimeout(timeout);
    }
};
exports.verifyBiometricWithService = verifyBiometricWithService;
