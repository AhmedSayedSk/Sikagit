import { Router, Request, Response, NextFunction } from 'express';
import { validateRepoPath } from '../middleware/validatePath';
import * as gitService from '../services/gitService';
import { withRepoLock } from '../services/gitService';
import { computeGraph } from '../services/graphService';
import * as db from '../services/db';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Batch status summary — before validateRepoPath since it takes multiple repos.
// Uses a small concurrency cap so 20+ repos don't all spawn `git status`
// simultaneously (which thrashes disk I/O on WSL/Docker).
const STATUS_SUMMARY_CONCURRENCY = 3;

// Read last-known summaries from SQLite. No git ops — instant.
router.get('/status-summary/cached', (req: Request, res: Response) => {
  const raw = String(req.query.ids || '').trim();
  const ids = raw ? raw.split(',').filter(Boolean) : [];
  const entries = db.getRepoStatusSummaries(ids);
  // Shape the response to match the legacy summary type (drop computedAt for now).
  const out: Record<string, { ahead: number; behind: number; hasChanges: boolean; hasStaged: boolean; hasUnstaged: boolean; hasRemote: boolean; computedAt: string; lastCommitAt: string | null }> = {};
  for (const id of Object.keys(entries)) {
    const e = entries[id];
    out[id] = { ahead: e.ahead, behind: e.behind, hasChanges: e.hasChanges, hasStaged: e.hasStaged, hasUnstaged: e.hasUnstaged, hasRemote: e.hasRemote, computedAt: e.computedAt, lastCommitAt: e.lastCommitAt };
  }
  res.json({ success: true, data: out });
});

type SummaryEntry =
  | {
      ahead: number; behind: number; hasChanges: boolean; hasStaged: boolean; hasUnstaged: boolean; hasRemote: boolean;
      computedAt: string;
      lastCommitAt: string | null;
      slowMode: boolean;
    }
  | { skipped: true; reason: 'slow'; slowMode: true; lastTimedOutAt: string };

/**
 * Compute one repo's summary with slow-mode handling:
 *
 * - normal repo: full scan; a timeout puts it in slow mode and falls through
 *   to the fast scan so the badge still refreshes.
 * - slow-mode repo: fast scan (untracked files skipped), except when its retry
 *   window has elapsed (or `probe` is set by a user-initiated refresh): then the
 *   full scan is attempted first, and success clears the flag. Every timeout
 *   bumps the backoff (1, 2, 4 … 30 min).
 *
 * Non-timeout errors (deleted repo, not a git repo…) propagate to the caller.
 */
async function summarizeRepo(id: string, repoPath: string, probe: boolean): Promise<SummaryEntry> {
  const info = db.getSlowInfoById(id);
  const slow = !!info?.slowMode;
  const tryFull = !slow || probe || (info !== undefined && db.isSlowProbeDue(info));

  if (tryFull) {
    try {
      const summary = await gitService.getStatusSummary(repoPath, 'full');
      if (slow) db.clearRepoSlow(id);
      db.upsertRepoStatusSummary(id, summary);
      return { ...summary, computedAt: new Date().toISOString(), slowMode: false };
    } catch (err) {
      if (!(err instanceof gitService.GitTimeoutError)) throw err;
      db.markRepoSlow(id, new Date().toISOString());
    }
  }

  try {
    const summary = await gitService.getStatusSummary(repoPath, 'none');
    db.upsertRepoStatusSummary(id, summary);
    return { ...summary, computedAt: new Date().toISOString(), slowMode: true };
  } catch (err) {
    if (!(err instanceof gitService.GitTimeoutError)) throw err;
    const at = new Date().toISOString();
    db.markRepoSlow(id, at);
    return { skipped: true, reason: 'slow', slowMode: true, lastTimedOutAt: at };
  }
}

// Compute fresh summaries for a subset of repos and write them through to the
// cache. Slow-mode repos are included (fast scan) and retried in full on their
// own schedule — see summarizeRepo.
router.post('/status-summary/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { repos } = req.body as { repos: { id: string; path: string }[] };
  if (!Array.isArray(repos)) {
    res.status(400).json({ success: false, error: 'repos array required' });
    return;
  }

  const { normalizePath } = await import('../services/pathService');
  const results: Record<string, SummaryEntry> = {};

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= repos.length) return;
      const { id, path: repoPath } = repos[idx];
      try {
        results[id] = await summarizeRepo(id, normalizePath(repoPath), false);
      } catch {
        // Error contract: this route is called by the background auto-refresh
        // sweep, so non-timeout errors (deleted repo, not a git repo, etc.) are
        // silently dropped from results — the client falls back to its cached
        // value. For user-initiated single-repo refreshes, see /refresh-one
        // which surfaces failures via HTTP 500 instead.
      }
    }
  };
  const workers = Array.from(
    { length: Math.min(STATUS_SUMMARY_CONCURRENCY, repos.length) },
    () => worker()
  );
  await Promise.all(workers);
  res.json({ success: true, data: results });
}));

// Single-repo refresh — used by the sidebar's right-click "Refresh status".
// Always attempts the full scan (ignoring the retry backoff), so a repo that is
// fast again leaves slow mode immediately. Same per-call timeout applies, so at
// worst it stays in slow mode with a longer backoff.
router.post('/status-summary/refresh-one', asyncHandler(async (req: Request, res: Response) => {
  // Error contract: non-timeout failures bubble up as HTTP 500 so the UI can
  // surface a toast. Timeout failures are reported as
  // {success:true, data:{skipped:true,...}} to match the batch route shape.
  const { id, path: repoPath } = req.body as { id: string; path: string };
  if (!id || !repoPath) {
    res.status(400).json({ success: false, error: 'id and path required' });
    return;
  }
  const { normalizePath } = await import('../services/pathService');
  try {
    const data = await summarizeRepo(id, normalizePath(repoPath), true);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}));

// All other git routes require a repo query param
router.use(validateRepoPath);

router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const status = await withRepoLock(repoPath, () => gitService.getStatus(repoPath));
  res.json({ success: true, data: status });
}));

router.get('/log', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const limit = parseInt(req.query.limit as string) || 200;
  const skip = parseInt(req.query.skip as string) || 0;
  const commits = await withRepoLock(repoPath, () => gitService.getLogWithParents(repoPath, limit, skip));
  res.json({ success: true, data: commits });
}));

router.get('/graph', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const limit = parseInt(req.query.limit as string) || 200;
  const skip = parseInt(req.query.skip as string) || 0;
  const commits = await withRepoLock(repoPath, () => gitService.getLogWithParents(repoPath, limit, skip));
  const graph = computeGraph(commits);
  res.json({ success: true, data: graph });
}));

router.get('/commit-files', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const commit = req.query.commit as string;
  if (!commit) {
    res.status(400).json({ success: false, error: 'Missing commit hash' });
    return;
  }
  const files = await withRepoLock(repoPath, () => gitService.getCommitFiles(repoPath, commit));
  res.json({ success: true, data: files });
}));

router.get('/branches', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const branches = await withRepoLock(repoPath, () => gitService.getBranches(repoPath));
  res.json({ success: true, data: branches });
}));

router.get('/tags', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const tags = await withRepoLock(repoPath, () => gitService.getTags(repoPath));
  res.json({ success: true, data: tags });
}));

// `ws` selects the whitespace filter (none | eol | all). It defaults to none
// here so the raw diff stays the API default; the client sends its own setting.
router.get('/diff', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { commit, file, ws } = req.query;
  const payload = await withRepoLock(repoPath, () => gitService.getDiffWithMeta(repoPath, {
    commitHash: commit as string,
    filePath: file as string,
    whitespace: gitService.parseWhitespaceMode(ws),
  }));
  res.json({ success: true, data: payload });
}));

router.get('/diff/staged', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { file, ws } = req.query;
  const payload = await withRepoLock(repoPath, () => gitService.getDiffWithMeta(repoPath, {
    filePath: file as string,
    staged: true,
    whitespace: gitService.parseWhitespaceMode(ws),
  }));
  res.json({ success: true, data: payload });
}));

router.post('/stage-hunk', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { patch } = req.body;
  if (!patch) {
    res.status(400).json({ success: false, error: 'Missing required field: patch' });
    return;
  }
  await withRepoLock(repoPath, () => gitService.stageHunk(repoPath, patch));
  res.json({ success: true });
}));

router.post('/discard-hunk', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { patch } = req.body;
  if (!patch) {
    res.status(400).json({ success: false, error: 'Missing required field: patch' });
    return;
  }
  await withRepoLock(repoPath, () => gitService.discardHunk(repoPath, patch));
  res.json({ success: true });
}));

router.post('/stage', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    res.status(400).json({ success: false, error: 'Missing required field: files (array)' });
    return;
  }
  await withRepoLock(repoPath, () => gitService.stageFiles(repoPath, files));
  res.json({ success: true });
}));

router.post('/unstage', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    res.status(400).json({ success: false, error: 'Missing required field: files (array)' });
    return;
  }
  await withRepoLock(repoPath, () => gitService.unstageFiles(repoPath, files));
  res.json({ success: true });
}));

router.post('/commit', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { message, amend } = req.body;
  if (!message) {
    res.status(400).json({ success: false, error: 'Missing required field: message' });
    return;
  }
  const commitHash = await withRepoLock(repoPath, () => gitService.commit(repoPath, message, amend));
  res.json({ success: true, data: { hash: commitHash } });
}));

router.post('/uncommit', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { hash } = req.body;
  if (!hash) {
    res.status(400).json({ success: false, error: 'Missing required field: hash' });
    return;
  }
  await withRepoLock(repoPath, () => gitService.uncommit(repoPath, hash));
  res.json({ success: true });
}));

router.post('/checkout', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { hash } = req.body;
  if (!hash) {
    res.status(400).json({ success: false, error: 'Missing required field: hash' });
    return;
  }
  const result = await withRepoLock(repoPath, () => gitService.checkoutCommit(repoPath, hash));
  res.json({ success: true, data: result });
}));

router.post('/switch-branch', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { branch } = req.body;
  if (!branch) {
    res.status(400).json({ success: false, error: 'Missing required field: branch' });
    return;
  }
  const result = await withRepoLock(repoPath, () => gitService.switchBranch(repoPath, branch));
  res.json({ success: true, data: result });
}));

router.post('/merge', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { sourceBranch } = req.body;
  if (!sourceBranch) {
    res.status(400).json({ success: false, error: 'Missing required field: sourceBranch' });
    return;
  }
  const result = await withRepoLock(repoPath, () => gitService.mergeBranch(repoPath, sourceBranch));
  res.json({ success: true, data: result });
}));

router.post('/merge/abort', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  await withRepoLock(repoPath, () => gitService.abortMerge(repoPath));
  res.json({ success: true });
}));

router.post('/branch/delete', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { branch, force } = req.body;
  if (!branch) {
    res.status(400).json({ success: false, error: 'Missing required field: branch' });
    return;
  }
  await withRepoLock(repoPath, () => gitService.deleteBranch(repoPath, branch, force));
  res.json({ success: true });
}));

router.post('/discard', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    res.status(400).json({ success: false, error: 'Missing required field: files (array)' });
    return;
  }
  await withRepoLock(repoPath, () => gitService.discardChanges(repoPath, files));
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

router.post('/save-for-later', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { files, branchName, message } = req.body;
  if (!files || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ success: false, error: 'Missing required field: files (non-empty array)' });
    return;
  }
  if (!branchName || typeof branchName !== 'string') {
    res.status(400).json({ success: false, error: 'Missing required field: branchName (string)' });
    return;
  }
  if (!message || typeof message !== 'string') {
    res.status(400).json({ success: false, error: 'Missing required field: message (string)' });
    return;
  }
  const result = await withRepoLock(repoPath, () =>
    gitService.saveForLater(repoPath, files, branchName, message)
  );
  res.json({ success: true, data: result });
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
  const { url } = req.body;
  const result = await gitService.testRemoteConnection(repoPath, url);
  res.json({ success: true, data: result });
}));

router.post('/fetch', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  // Deliberately NOT under withRepoLock. Fetch only updates remote-tracking refs
  // (git takes its own per-ref locks; it never touches the index/working tree)
  // but can sit idle for up to GIT_NETWORK_TIMEOUT_MS on a stalled remote.
  // Holding the per-repo mutex that long queued every local read for the open
  // repo (status/log/graph/branches) behind it, which is how the commit list
  // could look frozen or stale while a background fetch was hanging. Pull and
  // push still take the lock — they modify the working tree / index.
  await gitService.gitFetch(repoPath);
  res.json({ success: true });
}));

router.post('/pull', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { strategy, allowUnrelatedHistories } = req.body || {};
  const message = await withRepoLock(repoPath, () => gitService.gitPull(repoPath, strategy, allowUnrelatedHistories));
  res.json({ success: true, data: { message } });
}));

router.post('/push', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { setUpstream, upToCommit, force } = req.body;
  const message = await withRepoLock(repoPath, () => gitService.gitPush(repoPath, setUpstream, upToCommit, force));
  res.json({ success: true, data: { message } });
}));

router.get('/file', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const { file, commit } = req.query;
  if (!file) {
    res.status(400).json({ success: false, error: 'Missing required parameter: file' });
    return;
  }
  const content = await gitService.getFileContent(repoPath, file as string, commit as string | undefined);
  const ext = (file as string).split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  res.set('Content-Type', mime);
  res.set('Cache-Control', 'no-cache');
  res.send(content);
}));

// Remove stale .git/index.lock
router.delete('/lock', asyncHandler(async (req: Request, res: Response) => {
  const repoPath = (req as any).repoPath;
  const fs = await import('fs');
  const path = await import('path');
  const lockFile = path.join(repoPath, '.git', 'index.lock');
  if (fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
    res.json({ success: true, data: { removed: true } });
  } else {
    res.json({ success: true, data: { removed: false } });
  }
}));

export default router;
