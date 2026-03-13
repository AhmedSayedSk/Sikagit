import { Request, Response, NextFunction } from 'express';
import { normalizePath, validateGitRepo } from '../services/pathService';

export function validateRepoPath(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const repoPath = (req.query.repo as string) || (req.body?.repo as string);

  if (!repoPath) {
    res.status(400).json({
      success: false,
      error: 'Missing required parameter: repo',
    });
    return;
  }

  const normalized = normalizePath(repoPath);
  const validation = validateGitRepo(normalized);

  if (!validation.valid) {
    res.status(400).json({
      success: false,
      error: validation.error,
    });
    return;
  }

  // Attach normalized path to request
  (req as any).repoPath = normalized;
  next();
}
