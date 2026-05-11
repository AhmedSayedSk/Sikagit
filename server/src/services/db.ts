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
    avatar TEXT,
    slow_mode INTEGER NOT NULL DEFAULT 0,
    last_timed_out_at TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_repos (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, repo_id)
  );

  CREATE TABLE IF NOT EXISTS repo_status_cache (
    repo_id TEXT PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
    ahead INTEGER NOT NULL DEFAULT 0,
    behind INTEGER NOT NULL DEFAULT 0,
    has_changes INTEGER NOT NULL DEFAULT 0,
    has_remote INTEGER NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL
  );
`);

// --- Additive migration: repos.slow_mode / repos.last_timed_out_at ---
const repoCols = db.prepare("PRAGMA table_info(repos)").all() as { name: string }[];
const repoColNames = new Set(repoCols.map(c => c.name));
if (!repoColNames.has('slow_mode')) {
  db.exec('ALTER TABLE repos ADD COLUMN slow_mode INTEGER NOT NULL DEFAULT 0');
}
if (!repoColNames.has('last_timed_out_at')) {
  db.exec('ALTER TABLE repos ADD COLUMN last_timed_out_at TEXT');
}

// Migrate: add position column to project_repos if missing
const prCols = db.prepare("PRAGMA table_info(project_repos)").all() as { name: string }[];
if (!prCols.some(c => c.name === 'position')) {
  db.exec(`ALTER TABLE project_repos ADD COLUMN position INTEGER NOT NULL DEFAULT 0`);
  // Back-fill positions based on rowid order
  const rows = db.prepare('SELECT rowid, project_id, repo_id FROM project_repos ORDER BY project_id, rowid').all() as any[];
  let prevProject = '';
  let pos = 0;
  const updatePos = db.prepare('UPDATE project_repos SET position = ? WHERE project_id = ? AND repo_id = ?');
  for (const r of rows) {
    if (r.project_id !== prevProject) { pos = 0; prevProject = r.project_id; }
    updatePos.run(pos, r.project_id, r.repo_id);
    pos++;
  }
}

// Migrate existing databases: add avatar column, drop color/icon if present
const columns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
const colNames = columns.map(c => c.name);
if (!colNames.includes('avatar')) {
  db.exec(`ALTER TABLE projects ADD COLUMN avatar TEXT`);
}
if (colNames.includes('color')) {
  db.exec(`ALTER TABLE projects DROP COLUMN color`);
}
if (colNames.includes('icon')) {
  db.exec(`ALTER TABLE projects DROP COLUMN icon`);
}
// Migrate: add position column to projects, back-fill from rowid
if (!colNames.includes('position')) {
  db.exec(`ALTER TABLE projects ADD COLUMN position INTEGER NOT NULL DEFAULT 0`);
  const projRows = db.prepare('SELECT rowid, id FROM projects ORDER BY rowid').all() as any[];
  const updateProjPos = db.prepare('UPDATE projects SET position = ? WHERE id = ?');
  projRows.forEach((row, idx) => updateProjPos.run(idx, row.id));
}

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
        `INSERT OR IGNORE INTO projects (id, name, avatar, created_at) VALUES (@id, @name, @avatar, @createdAt)`
      );
      const insertProjectRepo = db.prepare(
        `INSERT OR IGNORE INTO project_repos (project_id, repo_id, position) VALUES (@projectId, @repoId, @position)`
      );
      for (const p of projects) {
        insertProject.run({ id: p.id, name: p.name, avatar: (p as any).avatar ?? null, createdAt: p.createdAt });
        p.repoIds.forEach((repoId, position) => {
          insertProjectRepo.run({ projectId: p.id, repoId, position });
        });
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
    avatar: row.avatar || undefined,
    slowMode: !!row.slow_mode,
    lastTimedOutAt: row.last_timed_out_at ?? null,
  };
}

const stmtAllRepos = db.prepare('SELECT id, path, display_path, name, is_wsl, last_opened, "group", avatar, slow_mode, last_timed_out_at FROM repos');
const stmtRepoById = db.prepare('SELECT id, path, display_path, name, is_wsl, last_opened, "group", avatar, slow_mode, last_timed_out_at FROM repos WHERE id = ?');
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

  if (data.path !== undefined) { sets.push('path = @path'); params.path = data.path; }
  if (data.displayPath !== undefined) { sets.push('display_path = @displayPath'); params.displayPath = data.displayPath; }
  if (data.isWSL !== undefined) { sets.push('is_wsl = @isWSL'); params.isWSL = data.isWSL ? 1 : 0; }
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

// --- Slow-repo flag ---

const stmtMarkRepoSlow = db.prepare(
  'UPDATE repos SET slow_mode = 1, last_timed_out_at = @at WHERE id = @id'
);
const stmtClearRepoSlow = db.prepare(
  'UPDATE repos SET slow_mode = 0 WHERE id = ?'
);
const stmtSlowRepoIds = db.prepare(
  'SELECT id FROM repos WHERE slow_mode = 1'
);

export function markRepoSlow(repoId: string, at: string): void {
  stmtMarkRepoSlow.run({ id: repoId, at });
}

export function clearRepoSlow(repoId: string): void {
  stmtClearRepoSlow.run(repoId);
}

export function getSlowRepoIds(): string[] {
  return (stmtSlowRepoIds.all() as { id: string }[]).map(r => r.id);
}

// --- Repo status cache ---

export interface RepoStatusCacheEntry {
  ahead: number;
  behind: number;
  hasChanges: boolean;
  hasRemote: boolean;
  computedAt: string;
}

const stmtUpsertRepoStatus = db.prepare(
  `INSERT INTO repo_status_cache (repo_id, ahead, behind, has_changes, has_remote, computed_at)
   VALUES (@repoId, @ahead, @behind, @hasChanges, @hasRemote, @computedAt)
   ON CONFLICT(repo_id) DO UPDATE SET
     ahead = excluded.ahead,
     behind = excluded.behind,
     has_changes = excluded.has_changes,
     has_remote = excluded.has_remote,
     computed_at = excluded.computed_at`
);

export function getRepoStatusSummaries(ids: string[]): Record<string, RepoStatusCacheEntry> {
  if (ids.length === 0) return {};
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT repo_id, ahead, behind, has_changes, has_remote, computed_at FROM repo_status_cache WHERE repo_id IN (${placeholders})`)
    .all(...ids) as any[];
  const out: Record<string, RepoStatusCacheEntry> = {};
  for (const r of rows) {
    out[r.repo_id] = {
      ahead: r.ahead,
      behind: r.behind,
      hasChanges: !!r.has_changes,
      hasRemote: !!r.has_remote,
      computedAt: r.computed_at,
    };
  }
  return out;
}

export function upsertRepoStatusSummary(
  repoId: string,
  summary: { ahead: number; behind: number; hasChanges: boolean; hasRemote: boolean }
): void {
  stmtUpsertRepoStatus.run({
    repoId,
    ahead: summary.ahead,
    behind: summary.behind,
    hasChanges: summary.hasChanges ? 1 : 0,
    hasRemote: summary.hasRemote ? 1 : 0,
    computedAt: new Date().toISOString(),
  });
}

// --- Project CRUD ---

const stmtAllProjects = db.prepare('SELECT * FROM projects ORDER BY position, rowid');
const stmtMaxProjectPosition = db.prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM projects');
const stmtUpdateProjectPosition = db.prepare('UPDATE projects SET position = ? WHERE id = ?');
const stmtProjectById = db.prepare('SELECT * FROM projects WHERE id = ?');
const stmtInsertProject = db.prepare(
  `INSERT INTO projects (id, name, avatar, created_at, position) VALUES (@id, @name, @avatar, @createdAt, @position)`
);
const stmtDeleteProject = db.prepare('DELETE FROM projects WHERE id = ?');
const stmtProjectRepos = db.prepare('SELECT repo_id FROM project_repos WHERE project_id = ? ORDER BY position');
const stmtDeleteProjectRepos = db.prepare('DELETE FROM project_repos WHERE project_id = ?');
const stmtInsertProjectRepo = db.prepare(
  'INSERT INTO project_repos (project_id, repo_id, position) VALUES (@projectId, @repoId, @position)'
);

function rowToProject(row: any, repoIds: string[]): Project {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || undefined,
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
    const { maxPos } = stmtMaxProjectPosition.get() as { maxPos: number };
    stmtInsertProject.run({
      id: project.id,
      name: project.name,
      avatar: project.avatar ?? null,
      createdAt: project.createdAt,
      position: maxPos + 1,
    });
    project.repoIds.forEach((repoId, position) => {
      stmtInsertProjectRepo.run({ projectId: project.id, repoId, position });
    });
  });
  insert();
}

export function reorderProjects(ids: string[]): Project[] {
  const reorder = db.transaction(() => {
    ids.forEach((id, idx) => stmtUpdateProjectPosition.run(idx, id));
  });
  reorder();
  return getAllProjects();
}

export function updateProject(
  id: string,
  data: { name?: string; avatar?: string; repoIds?: string[] }
): Project | undefined {
  const existing = stmtProjectById.get(id) as any;
  if (!existing) return undefined;

  const update = db.transaction(() => {
    const sets: string[] = [];
    const params: any = { id };

    if (data.name !== undefined) { sets.push('name = @name'); params.name = data.name; }
    if (data.avatar !== undefined) { sets.push('avatar = @avatar'); params.avatar = data.avatar || null; }

    if (sets.length > 0) {
      db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = @id`).run(params);
    }

    if (data.repoIds !== undefined) {
      stmtDeleteProjectRepos.run(id);
      data.repoIds.forEach((repoId, position) => {
        stmtInsertProjectRepo.run({ projectId: id, repoId, position });
      });
    }
  });
  update();

  return getProjectById(id);
}

export function deleteProject(id: string): boolean {
  return stmtDeleteProject.run(id).changes > 0;
}
