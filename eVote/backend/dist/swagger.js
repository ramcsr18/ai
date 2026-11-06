"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerSpec = void 0;
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const path_1 = __importDefault(require("path"));
const port = process.env.PORT || 5001;
const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'eVote API',
            version: '1.0.0',
            description: 'API documentation for the eVote blockchain voting platform.',
        },
        servers: [
            {
                url: `http://localhost:${port}`,
                description: 'Local development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        tags: [
            { name: 'Auth', description: 'Authentication and voter verification flows' },
            { name: 'Elections', description: 'Election and candidate lookup APIs' },
            { name: 'Admin', description: 'Administrative records and voter management APIs' },
        ],
    },
    apis: [
        path_1.default.join(__dirname, 'routes', '*.ts'),
        path_1.default.join(__dirname, 'routes', '*.js'),
    ],
};
exports.swaggerSpec = (0, swagger_jsdoc_1.default)(options);
