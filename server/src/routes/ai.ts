import { Router, Request, Response, NextFunction } from 'express';
import { validateRepoPath } from '../middleware/validatePath';
import * as gitService from '../services/gitService';
import { withRepoLock } from '../services/gitService';
import * as aiService from '../services/aiService';

const router = Router();
router.use(validateRepoPath);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Suggest commit message from staged changes
router.post('/suggest', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { apiKey, model } = req.body;

  if (!apiKey) {
    res.status(400).json({ success: false, error: 'AI API key not configured' });
    return;
  }

  const diff = await withRepoLock(repoPath, () => gitService.getStagedDiff(repoPath));
  if (!diff.trim()) {
    res.status(400).json({ success: false, error: 'No staged changes to analyze' });
    return;
  }

  const result = await aiService.suggestCommitMessage(apiKey, model || 'gemini-2.5-pro', diff);
  res.json({ success: true, data: result });
}));

// Suggest branch name and message for save-for-later
router.post('/suggest-save-for-later', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { apiKey, model, files } = req.body;

  if (!apiKey) {
    res.status(400).json({ success: false, error: 'AI API key not configured' });
    return;
  }
  if (!files || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ success: false, error: 'No files provided' });
    return;
  }

  const diff = await withRepoLock(repoPath, () => gitService.getDiff(repoPath));
  const result = await aiService.suggestSaveForLater(apiKey, model || 'gemini-2.5-pro', files, diff || '');
  res.json({ success: true, data: result });
}));

// Smart commit: analyze staged changes into groups (preview)
router.post('/smart-commit/preview', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { apiKey, model } = req.body;

  if (!apiKey) {
    res.status(400).json({ success: false, error: 'AI API key not configured' });
    return;
  }

  const [diff, status] = await withRepoLock(repoPath, async () => {
    const d = await gitService.getStagedDiff(repoPath);
    const s = await gitService.getStatus(repoPath);
    return [d, s] as const;
  });

  if (!diff.trim() || status.staged.length === 0) {
    res.status(400).json({ success: false, error: 'No staged changes to analyze' });
    return;
  }

  const stagedFiles = status.staged.map(f => f.path);
  const groups = await aiService.suggestSmartCommitGroups(apiKey, model || 'gemini-2.5-pro', diff, stagedFiles);

  res.json({ success: true, data: { groups } });
}));

// Smart commit: execute with pre-defined groups (no AI call)
router.post('/smart-commit/execute', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { groups } = req.body;

  if (!groups || !Array.isArray(groups) || groups.length === 0) {
    res.status(400).json({ success: false, error: 'No commit groups provided' });
    return;
  }

  const commits: { hash: string; message: string }[] = [];

  await withRepoLock(repoPath, async () => {
    // Unstage ALL staged files first to ensure only group files get committed
    await gitService.unstageAll(repoPath);

    for (const group of groups) {
      // Stage only this group's files
      await gitService.stageFiles(repoPath, group.files);

      // Commit with the user-reviewed title/description
      const message = group.description
        ? `${group.title}\n\n${group.description}`
        : group.title;
      const hash = await gitService.commit(repoPath, message);
      commits.push({ hash, message: group.title });
    }
  });

  res.json({ success: true, data: { commits } });
}));

export default router;
