import { Request } from 'express';
import { User } from '@prisma/client';

export interface AuthRequest extends Request {
  auth?: {
    sub: string;
    [key: string]: any;
  };
  user?: User;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

