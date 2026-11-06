import swaggerJSDoc from 'swagger-jsdoc';
import path from 'path';

const port = process.env.PORT || 5001;

const options: swaggerJSDoc.Options = {
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
    path.join(__dirname, 'routes', '*.ts'),
    path.join(__dirname, 'routes', '*.js'),
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
