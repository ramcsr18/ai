import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        voterId: string;
        govtIdHash: string;
        [key: string]: any;
      };
    }
  }
}
