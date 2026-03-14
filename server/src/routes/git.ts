import { Router, Request, Response, NextFunction } from 'express';
import { validateRepoPath } from '../middleware/validatePath';
import * as gitService from '../services/gitService';
import { computeGraph } from '../services/graphService';

const router = Router();

// All git routes require a repo query param
router.use(validateRepoPath);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const status = await gitService.getStatus(repoPath);
  res.json({ success: true, data: status });
}));

router.get('/log', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const limit = parseInt(req.query.limit as string) || 200;
  const skip = parseInt(req.query.skip as string) || 0;
  const commits = await gitService.getLogWithParents(repoPath, limit, skip);
  res.json({ success: true, data: commits });
}));

router.get('/graph', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const limit = parseInt(req.query.limit as string) || 200;
  const skip = parseInt(req.query.skip as string) || 0;
  const commits = await gitService.getLogWithParents(repoPath, limit, skip);
  const graph = computeGraph(commits);
  res.json({ success: true, data: graph });
}));

router.get('/branches', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const branches = await gitService.getBranches(repoPath);
  res.json({ success: true, data: branches });
}));

router.get('/tags', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const tags = await gitService.getTags(repoPath);
  res.json({ success: true, data: tags });
}));

router.get('/diff', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { commit, file } = req.query;
  const diff = await gitService.getDiff(repoPath, commit as string, file as string);
  res.json({ success: true, data: diff });
}));

router.get('/diff/staged', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { file } = req.query;
  const diff = await gitService.getStagedDiff(repoPath, file as string);
  res.json({ success: true, data: diff });
}));

router.post('/stage-hunk', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { patch } = req.body;
  if (!patch) {
    res.status(400).json({ success: false, error: 'Missing required field: patch' });
    return;
  }
  await gitService.stageHunk(repoPath, patch);
  res.json({ success: true });
}));

router.post('/discard-hunk', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { patch } = req.body;
  if (!patch) {
    res.status(400).json({ success: false, error: 'Missing required field: patch' });
    return;
  }
  await gitService.discardHunk(repoPath, patch);
  res.json({ success: true });
}));

router.post('/stage', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    res.status(400).json({ success: false, error: 'Missing required field: files (array)' });
    return;
  }
  await gitService.stageFiles(repoPath, files);
  res.json({ success: true });
}));

router.post('/unstage', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    res.status(400).json({ success: false, error: 'Missing required field: files (array)' });
    return;
  }
  await gitService.unstageFiles(repoPath, files);
  res.json({ success: true });
}));

router.post('/commit', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { message, amend } = req.body;
  if (!message) {
    res.status(400).json({ success: false, error: 'Missing required field: message' });
    return;
  }
  const commitHash = await gitService.commit(repoPath, message, amend);
  res.json({ success: true, data: { hash: commitHash } });
}));

router.post('/discard', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    res.status(400).json({ success: false, error: 'Missing required field: files (array)' });
    return;
  }
  await gitService.discardChanges(repoPath, files);
  res.json({ success: true });
}));

router.post('/delete-untracked', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    res.status(400).json({ success: false, error: 'Missing required field: files (array)' });
    return;
  }
  await gitService.deleteUntrackedFiles(repoPath, files);
  res.json({ success: true });
}));

router.get('/config', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const config = await gitService.getConfig(repoPath);
  res.json({ success: true, data: config });
}));

router.post('/config', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { key, value } = req.body;
  if (!key) {
    res.status(400).json({ success: false, error: 'Missing required field: key' });
    return;
  }
  if (value) {
    await gitService.setConfig(repoPath, key, value);
  } else {
    await gitService.unsetConfig(repoPath, key);
  }
  res.json({ success: true });
}));

router.post('/remote-url', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { url } = req.body;
  if (url === undefined) {
    res.status(400).json({ success: false, error: 'Missing required field: url' });
    return;
  }
  await gitService.setRemoteUrl(repoPath, url);
  res.json({ success: true });
}));

router.post('/test-remote', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const result = await gitService.testRemoteConnection(repoPath);
  res.json({ success: true, data: result });
}));

router.post('/fetch', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  await gitService.gitFetch(repoPath);
  res.json({ success: true });
}));

router.post('/pull', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const message = await gitService.gitPull(repoPath);
  res.json({ success: true, data: { message } });
}));

router.post('/push', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { setUpstream } = req.body;
  const message = await gitService.gitPush(repoPath, setUpstream);
  res.json({ success: true, data: { message } });
}));

export default router;
