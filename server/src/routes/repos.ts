import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import type { RepoBookmark } from '@sikagit/shared';
import { normalizePath, validateGitRepo, getDisplayPath, getRepoName, isWSLPath } from '../services/pathService';
import { load, save } from '../services/storageService';

const router = Router();
const REPOS_FILE = 'repos.json';

function getRepos(): RepoBookmark[] {
  return load<RepoBookmark[]>(REPOS_FILE, []);
}

function saveRepos(repos: RepoBookmark[]): void {
  save(REPOS_FILE, repos);
}

router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: getRepos() });
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

  const repos = getRepos();

  if (repos.some(r => r.path === normalized)) {
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

  repos.push(bookmark);
  saveRepos(repos);
  res.status(201).json({ success: true, data: bookmark });
});

router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const repos = getRepos();
  const index = repos.findIndex(r => r.id === id);

  if (index === -1) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return;
  }

  repos.splice(index, 1);
  saveRepos(repos);
  res.json({ success: true });
});

router.patch('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, group, avatar } = req.body;
  const repos = getRepos();
  const repo = repos.find(r => r.id === id);

  if (!repo) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return;
  }

  if (name !== undefined) repo.name = name;
  if (group !== undefined) repo.group = group;
  if (avatar !== undefined) repo.avatar = avatar;

  saveRepos(repos);
  res.json({ success: true, data: repo });
});

router.patch('/:id/open', (req: Request, res: Response) => {
  const { id } = req.params;
  const repos = getRepos();
  const repo = repos.find(r => r.id === id);

  if (!repo) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return;
  }

  repo.lastOpened = new Date().toISOString();
  saveRepos(repos);
  res.json({ success: true, data: repo });
});

export default router;
