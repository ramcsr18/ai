import mongoose from 'mongoose';
import { Voter } from './src/models/Voter';
import { connectDB } from './src/config/db';
import crypto from 'crypto';

async function seed() {
    try {
        await connectDB();

        const testUsers = [
            {
                name: 'Admin User',
                govtId: 'ADMIN123',
                role: 'ADMIN',
                address: '0xAdminAddress'
            },
            {
                name: 'Officer User',
                govtId: 'OFFICER123',
                role: 'ELECTION_OFFICER',
                address: '0xOfficerAddress'
            },
            {
                name: 'Standard Voter',
                govtId: 'VOTER123',
                role: 'VOTER',
                address: '0xVoterAddress'
            },
        ];

        for (const user of testUsers) {
            const govtIdHash = crypto.createHash('sha256').update(user.govtId).digest('hex');

            // Check if already exists
            const exists = await Voter.findOne({ govtIdHash });
            if (exists) {
                console.log(`User ${user.name} already exists.`);
                continue;
            }

            await Voter.create({
                govtIdHash,
                nationalId: user.govtId,
                dob: new Date('1990-01-01'),
                gender: 'Other',
                physicalAddress: '123 Test St',
                address: user.address,
                role: user.role,
                isVerified: true,
            });
            console.log(`Created ${user.role}: ${user.name}`);
        }

        console.log('Seeding completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
}

seed();
