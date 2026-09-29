import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { AppError } from '@shared/errors/AppError';
import { StructuredLogger } from '@monitoring/logging/StructuredLogger';

const logger = new StructuredLogger(); // Ideally injected, but simple instance for middleware is acceptable

export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Upload limits are the client's fault, not a server error (they used to answer 500).
  if (err instanceof MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      status: 'error',
      statusCode: tooLarge ? 413 : 400,
      code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
      message: tooLarge ? 'That file is too large. The limit is 10 MB.' : err.message,
    });
    return;
  }

  logger.error('Error caught in global middleware', JSON.stringify(err));

  let error = err;

  if (!(error instanceof AppError)) {
    // Convert unknown errors to AppError
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    error = new AppError(message, statusCode);
  }

  const response = {
    status: 'error',
    statusCode: error.statusCode,
    message: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  res.status(error.statusCode).json(response);
};
