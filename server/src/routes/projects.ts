import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import type { Project } from '@sikagit/shared';
import * as db from '../services/db';

const router = Router();

// List all projects
router.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: db.getAllProjects() });
});

// Create project
router.post('/', (req: Request, res: Response) => {
  const { name, avatar, repoIds } = req.body;

  if (!name) {
    res.status(400).json({ success: false, error: 'Missing required field: name' });
    return;
  }

  const project: Project = {
    id: uuid(),
    name,
    avatar: avatar || undefined,
    repoIds: repoIds || [],
    createdAt: new Date().toISOString(),
  };

  db.insertProject(project);
  res.status(201).json({ success: true, data: project });
});

// Reorder projects (must be defined before /:id)
router.post('/reorder', (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.some(x => typeof x !== 'string')) {
    res.status(400).json({ success: false, error: 'ids must be an array of strings' });
    return;
  }
  res.json({ success: true, data: db.reorderProjects(ids) });
});

// Update project
router.patch('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, avatar, repoIds } = req.body;

  const updated = db.updateProject(id, { name, avatar, repoIds });
  if (!updated) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }

  res.json({ success: true, data: updated });
});

// Delete project
router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (!db.deleteProject(id)) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }

  res.json({ success: true });
});

export default router;
