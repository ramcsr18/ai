import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { connectDB } from './config/db';
import authRoutes from './routes/authRoutes';
import electionRoutes from './routes/electionRoutes';
import adminRoutes from './routes/adminRoutes';
import { startVerificationWorker } from './queue/verificationQueue';
import { swaggerSpec } from './swagger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Security Middleware
app.use(helmet());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes'
}));

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

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
        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

        // Graceful Shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM signal received: closing HTTP server');
            server.close(() => {
                console.log('HTTP server closed');
                mongoose.connection.close(false, () => {
                    console.log('MongoDB connection closed');
                    process.exit(0);
                });
            });
        });

        process.on('SIGINT', () => {
            console.log('SIGINT signal received: closing HTTP server');
            server.close(() => {
                console.log('HTTP server closed');
                mongoose.connection.close(false, () => {
                    console.log('MongoDB connection closed');
                    process.exit(0);
                });
            });
        });

    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

startServer();
