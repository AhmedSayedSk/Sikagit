import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import type { RepoBookmark } from '@sikagit/shared';
import { normalizePath, validateGitRepo, getDisplayPath, getRepoName, isWSLPath } from '../services/pathService';
import * as db from '../services/db';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: db.getAllRepos() });
});

router.post('/', (req: Request, res: Response) => {
  const { path: inputPath, group } = req.body;

  if (!inputPath) {
    res.status(400).json({ success: false, error: 'Missing required field: path' });
    return;
  }

  const normalized = normalizePath(inputPath);
  const validation = validateGitRepo(normalized);

  if (!validation.valid) {
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  if (db.repoExistsByPath(normalized)) {
    res.status(409).json({ success: false, error: 'Repository already added' });
    return;
  }

  const bookmark: RepoBookmark = {
    id: uuid(),
    path: normalized,
    displayPath: getDisplayPath(normalized),
    name: getRepoName(normalized),
    isWSL: isWSLPath(normalized),
    lastOpened: new Date().toISOString(),
    group,
  };

  db.insertRepo(bookmark);
  res.status(201).json({ success: true, data: bookmark });
});

router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (!db.deleteRepo(id)) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return;
  }

  res.json({ success: true });
});

router.patch('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, group, avatar, path: inputPath } = req.body;

  const patch: Partial<RepoBookmark> = { name, group, avatar };

  // If a new path is provided, validate it, check for conflicts, and derive related fields
  if (inputPath !== undefined) {
    const existing = db.getRepoById(id);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Repository not found' });
      return;
    }

    const normalized = normalizePath(inputPath);

    if (normalized !== existing.path) {
      const validation = validateGitRepo(normalized);
      if (!validation.valid) {
        res.status(400).json({ success: false, error: validation.error });
        return;
      }

      if (db.repoExistsByPath(normalized)) {
        res.status(409).json({ success: false, error: 'Another repository is already registered at this path' });
        return;
      }

      patch.path = normalized;
      patch.displayPath = getDisplayPath(normalized);
      patch.isWSL = isWSLPath(normalized);

      // Only auto-rename the display name if the user never customized it (i.e. it still matches the old folder name)
      const oldFolderName = getRepoName(existing.path);
      if (existing.name === oldFolderName && name === undefined) {
        patch.name = getRepoName(normalized);
      }
    }
  }

  const updated = db.updateRepo(id, patch);
  if (!updated) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return;
  }

  res.json({ success: true, data: updated });
});

router.patch('/:id/open', (req: Request, res: Response) => {
  const id = req.params.id as string;

  const updated = db.updateRepo(id, { lastOpened: new Date().toISOString() });
  if (!updated) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return;
  }

  res.json({ success: true, data: updated });
});

export default router;
