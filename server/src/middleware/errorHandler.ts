import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err.message);
  console.error(err.stack);

  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
}
