import { Request } from 'express';
import { User } from '@prisma/client';

export interface AuthRequest extends Request {
  auth?: {
    sub: string;
    [key: string]: any;
  };
  user?: User;
}

// Type for async route handlers
export type AsyncHandler = (
  req: AuthRequest,
  res: any,
  next: any
) => Promise<void>;

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface SuccessResponse<T> {
  data: T;
  meta?: {
    page?: number;
    totalPages?: number;
    totalCount?: number;
  };
}

export interface SocketWithAuth {
  userId?: string;
  user?: User;
}