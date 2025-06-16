import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../types';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);
  
  // Multer errors
  if (err.message && err.message.includes('Invalid file type')) {
    const response: ErrorResponse = {
      error: {
        code: 'INVALID_FILE_TYPE',
        message: err.message,
      },
    };
    return res.status(400).json(response);
  }

  if (err instanceof AppError) {
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    return res.status(err.statusCode).json(response);
  }

  // Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as any;
    if (prismaError.code === 'P2002') {
      const response: ErrorResponse = {
        error: {
          code: 'DUPLICATE_ENTRY',
          message: 'This record already exists',
        },
      };
      return res.status(409).json(response);
    }
  }

  // Default error
  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    },
  };
  res.status(500).json(response);
};