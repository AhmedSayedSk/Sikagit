import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { RepoBookmark, Project } from '@sikagit/shared';

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'sikagit.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    display_path TEXT NOT NULL,
    name TEXT NOT NULL,
    is_wsl INTEGER NOT NULL DEFAULT 0,
    last_opened TEXT,
    "group" TEXT,
    avatar TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#7ba4f7',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_repos (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, repo_id)
  );
`);

// One-time migration from JSON files
const reposJsonPath = path.join(DATA_DIR, 'repos.json');
const projectsJsonPath = path.join(DATA_DIR, 'projects.json');

if (fs.existsSync(reposJsonPath) || fs.existsSync(projectsJsonPath)) {
  const migrate = db.transaction(() => {
    if (fs.existsSync(reposJsonPath)) {
      const repos: RepoBookmark[] = JSON.parse(fs.readFileSync(reposJsonPath, 'utf-8'));
      const insertRepo = db.prepare(
        `INSERT OR IGNORE INTO repos (id, path, display_path, name, is_wsl, last_opened, "group", avatar)
         VALUES (@id, @path, @displayPath, @name, @isWSL, @lastOpened, @group, @avatar)`
      );
      for (const r of repos) {
        insertRepo.run({
          id: r.id,
          path: r.path,
          displayPath: r.displayPath,
          name: r.name,
          isWSL: r.isWSL ? 1 : 0,
          lastOpened: r.lastOpened ?? null,
          group: r.group ?? null,
          avatar: r.avatar ?? null,
        });
      }
      fs.renameSync(reposJsonPath, reposJsonPath + '.migrated');
    }

    if (fs.existsSync(projectsJsonPath)) {
      const projects: Project[] = JSON.parse(fs.readFileSync(projectsJsonPath, 'utf-8'));
      const insertProject = db.prepare(
        `INSERT OR IGNORE INTO projects (id, name, color, created_at) VALUES (@id, @name, @color, @createdAt)`
      );
      const insertProjectRepo = db.prepare(
        `INSERT OR IGNORE INTO project_repos (project_id, repo_id) VALUES (@projectId, @repoId)`
      );
      for (const p of projects) {
        insertProject.run({ id: p.id, name: p.name, color: p.color, createdAt: p.createdAt });
        for (const repoId of p.repoIds) {
          insertProjectRepo.run({ projectId: p.id, repoId });
        }
      }
      fs.renameSync(projectsJsonPath, projectsJsonPath + '.migrated');
    }
  });
  migrate();
  console.log('[db] Migrated JSON data to SQLite');
}

// --- Repo CRUD ---

function rowToRepo(row: any): RepoBookmark {
  return {
    id: row.id,
    path: row.path,
    displayPath: row.display_path,
    name: row.name,
    isWSL: !!row.is_wsl,
    lastOpened: row.last_opened ?? undefined,
    group: row.group ?? undefined,
    avatar: row.avatar ?? undefined,
  };
}

const stmtAllRepos = db.prepare('SELECT * FROM repos');
const stmtRepoById = db.prepare('SELECT * FROM repos WHERE id = ?');
const stmtInsertRepo = db.prepare(
  `INSERT INTO repos (id, path, display_path, name, is_wsl, last_opened, "group", avatar)
   VALUES (@id, @path, @displayPath, @name, @isWSL, @lastOpened, @group, @avatar)`
);
const stmtDeleteRepo = db.prepare('DELETE FROM repos WHERE id = ?');

export function getAllRepos(): RepoBookmark[] {
  return stmtAllRepos.all().map(rowToRepo);
}

export function getRepoById(id: string): RepoBookmark | undefined {
  const row = stmtRepoById.get(id);
  return row ? rowToRepo(row) : undefined;
}

export function insertRepo(repo: RepoBookmark): void {
  stmtInsertRepo.run({
    id: repo.id,
    path: repo.path,
    displayPath: repo.displayPath,
    name: repo.name,
    isWSL: repo.isWSL ? 1 : 0,
    lastOpened: repo.lastOpened ?? null,
    group: repo.group ?? null,
    avatar: repo.avatar ?? null,
  });
}

export function updateRepo(id: string, data: Partial<RepoBookmark>): RepoBookmark | undefined {
  const existing = stmtRepoById.get(id) as any;
  if (!existing) return undefined;

  const sets: string[] = [];
  const params: any = { id };

  if (data.name !== undefined) { sets.push('name = @name'); params.name = data.name; }
  if (data.group !== undefined) { sets.push('"group" = @group'); params.group = data.group; }
  if (data.avatar !== undefined) { sets.push('avatar = @avatar'); params.avatar = data.avatar; }
  if (data.lastOpened !== undefined) { sets.push('last_opened = @lastOpened'); params.lastOpened = data.lastOpened; }

  if (sets.length === 0) return rowToRepo(existing);

  db.prepare(`UPDATE repos SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return rowToRepo(stmtRepoById.get(id));
}

export function deleteRepo(id: string): boolean {
  return stmtDeleteRepo.run(id).changes > 0;
}

export function repoExistsByPath(repoPath: string): boolean {
  return !!db.prepare('SELECT 1 FROM repos WHERE path = ?').get(repoPath);
}

// --- Project CRUD ---

const stmtAllProjects = db.prepare('SELECT * FROM projects');
const stmtProjectById = db.prepare('SELECT * FROM projects WHERE id = ?');
const stmtInsertProject = db.prepare(
  `INSERT INTO projects (id, name, color, created_at) VALUES (@id, @name, @color, @createdAt)`
);
const stmtDeleteProject = db.prepare('DELETE FROM projects WHERE id = ?');
const stmtProjectRepos = db.prepare('SELECT repo_id FROM project_repos WHERE project_id = ?');
const stmtDeleteProjectRepos = db.prepare('DELETE FROM project_repos WHERE project_id = ?');
const stmtInsertProjectRepo = db.prepare(
  'INSERT INTO project_repos (project_id, repo_id) VALUES (@projectId, @repoId)'
);

function rowToProject(row: any, repoIds: string[]): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    repoIds,
    createdAt: row.created_at,
  };
}

function getRepoIdsForProject(projectId: string): string[] {
  return (stmtProjectRepos.all(projectId) as any[]).map(r => r.repo_id);
}

export function getAllProjects(): Project[] {
  return stmtAllProjects.all().map((row: any) =>
    rowToProject(row, getRepoIdsForProject(row.id))
  );
}

export function getProjectById(id: string): Project | undefined {
  const row = stmtProjectById.get(id);
  if (!row) return undefined;
  return rowToProject(row, getRepoIdsForProject(id));
}

export function insertProject(project: Project): void {
  const insert = db.transaction(() => {
    stmtInsertProject.run({
      id: project.id,
      name: project.name,
      color: project.color,
      createdAt: project.createdAt,
    });
    for (const repoId of project.repoIds) {
      stmtInsertProjectRepo.run({ projectId: project.id, repoId });
    }
  });
  insert();
}

export function updateProject(
  id: string,
  data: { name?: string; color?: string; repoIds?: string[] }
): Project | undefined {
  const existing = stmtProjectById.get(id) as any;
  if (!existing) return undefined;

  const update = db.transaction(() => {
    const sets: string[] = [];
    const params: any = { id };

    if (data.name !== undefined) { sets.push('name = @name'); params.name = data.name; }
    if (data.color !== undefined) { sets.push('color = @color'); params.color = data.color; }

    if (sets.length > 0) {
      db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = @id`).run(params);
    }

    if (data.repoIds !== undefined) {
      stmtDeleteProjectRepos.run(id);
      for (const repoId of data.repoIds) {
        stmtInsertProjectRepo.run({ projectId: id, repoId });
      }
    }
  });
  update();

  return getProjectById(id);
}

export function deleteProject(id: string): boolean {
  return stmtDeleteProject.run(id).changes > 0;
}
