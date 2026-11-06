import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { connectDB } from './config/db';
import authRoutes from './routes/authRoutes';
import electionRoutes from './routes/electionRoutes';
import adminRoutes from './routes/adminRoutes';
import { startVerificationWorker } from './queue/verificationQueue';
import { swaggerSpec } from './swagger';

dotenv.config();

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

app.use('/api/auth', authRoutes);
app.use('/api/elections', electionRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.send('eVote API is running...');
});

const startServer = async () => {
    try {
        startVerificationWorker();
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

startServer();
