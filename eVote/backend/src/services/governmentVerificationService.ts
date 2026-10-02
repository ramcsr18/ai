import dotenv from 'dotenv';

dotenv.config();

export interface GovernmentVoterRecord {
    verified: boolean;
    nationalId: string;
    dob: Date;
    gender: string;
    physicalAddress: string;
}

interface GovernmentApiResponse {
    verified?: boolean;
    nationalId?: string;
    dob?: string;
    gender?: string;
    physicalAddress?: string;
    voter?: {
        nationalId?: string;
        dob?: string;
        gender?: string;
        physicalAddress?: string;
    };
}

export class GovernmentVerificationError extends Error {
    constructor(message: string, public readonly statusCode = 502) {
        super(message);
        this.name = 'GovernmentVerificationError';
    }
}

export const verifyVoterWithGovernmentApi = async (govtId: string, name: string): Promise<GovernmentVoterRecord> => {
    const apiUrl = process.env.GOVERNMENT_VERIFICATION_API_URL;
    if (!apiUrl) {
        throw new GovernmentVerificationError('Government verification API is not configured', 503);
    }

    const timeoutMs = Number(process.env.GOVERNMENT_VERIFICATION_TIMEOUT_MS || 5000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (process.env.GOVERNMENT_VERIFICATION_API_KEY) {
            headers.Authorization = `Bearer ${process.env.GOVERNMENT_VERIFICATION_API_KEY}`;
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ govtId, name }),
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new GovernmentVerificationError(`Government verification API returned ${response.status}`);
        }

        const payload = await response.json() as GovernmentApiResponse;
        const voter = payload.voter || payload;
        if (!payload.verified || !voter.nationalId || !voter.dob || !voter.gender || !voter.physicalAddress) {
            return {
                verified: false,
                nationalId: '',
                dob: new Date(0),
                gender: '',
                physicalAddress: '',
            };
        }

        const dob = new Date(voter.dob);
        if (Number.isNaN(dob.getTime())) {
            throw new GovernmentVerificationError('Government verification API returned an invalid date');
        }

        return {
            verified: true,
            nationalId: voter.nationalId,
            dob,
            gender: voter.gender,
            physicalAddress: voter.physicalAddress,
        };
    } catch (error) {
        if (error instanceof GovernmentVerificationError) {
            throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
            throw new GovernmentVerificationError('Government verification API timed out', 504);
        }
        throw new GovernmentVerificationError('Government verification API is unavailable', 502);
    } finally {
        clearTimeout(timeout);
    }
};