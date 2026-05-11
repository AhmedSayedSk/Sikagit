# SikaGit slow-repo handling — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a single slow repo from wedging the SikaGit server's background status sweep by adding an 8s per-call timeout and a persistent `slow_mode` flag, so timed-out repos drop out of the auto-refresh path until the user explicitly retries.

**Architecture:** Wrap `getStatusSummary` with a `Promise.race` timeout helper. On timeout, write a `slow_mode` flag to the `repos` table in SQLite. Both refresh routes (batch + single) consult this flag — the batch route filters slow repos out, the new single-repo route bypasses the filter so the user can force-retry. Sidebar shows a `⏸` indicator on slow repos with a right-click "Refresh status (force)" affordance.

**Tech Stack:** Node 22 + TypeScript + Express + simple-git + better-sqlite3 (server); Vite + React 19 + Zustand (client). No test framework installed — verification is manual per the spec.

**Spec:** `docs/superpowers/specs/2026-05-11-sikagit-slow-repo-handling-design.md`

**Working directory for all commands:** `/mnt/d/programming/Sikasio/sikagit`

---

## File map

**Files modified:**
- `shared/types/git.ts` — extend `RepoBookmark` with `slowMode` + `lastTimedOutAt`
- `server/src/services/db.ts` — schema migration, prepared statements, `markRepoSlow` / `clearRepoSlow` / `getSlowRepoIds`, extend `rowToRepo` + `stmtAllRepos`
- `server/src/services/gitService.ts` — `GitTimeoutError`, `withTimeout` helper, wrap `getStatusSummary`, pass `timeout.block` to `getGit`'s simple-git instance
- `server/src/routes/git.ts` — refactor `/status-summary/refresh` (filter + mark-slow + clear-slow on success); add `/status-summary/refresh-one`
- `client/src/lib/api.ts` — add `refreshStatusSummaryOne`
- `client/src/store/repoStatusStore.ts` — accept `slowMode` on enqueued repos; skip when slow unless `force: true`
- `client/src/components/layout/Sidebar.tsx` — render `⏸` indicator on slow rows; add right-click menu item that calls the new API and updates store

**No new files.**

---

## Task 1: Extend `RepoBookmark` shared type

**Files:**
- Modify: `shared/types/git.ts:73-82`

- [ ] **Step 1: Add the two fields to the interface**

Open `shared/types/git.ts` and update `RepoBookmark`:

```ts
export interface RepoBookmark {
  id: string;
  path: string;
  displayPath: string;
  name: string;
  isWSL: boolean;
  lastOpened?: string;
  group?: string;
  avatar?: string; // base64 data URL for repo logo
  slowMode: boolean;          // true when getStatusSummary last timed out
  lastTimedOutAt: string | null; // ISO timestamp of the last timeout, or null
}
```

- [ ] **Step 2: Type-check shared package compiles**

Run from repo root:
```bash
docker exec sikagit-server-1 sh -c "cd /app/shared && npx tsc --noEmit"
```
Expected: zero output (success). If the container isn't running, run `cd shared && npx tsc --noEmit` from the host instead.

(Type errors in downstream consumers — db.ts, repoStatusStore.ts, Sidebar.tsx — are expected at this stage and will be fixed in later tasks. The check above scopes to the shared package only.)

- [ ] **Step 3: Commit**

```bash
git add shared/types/git.ts
git commit -m "feat(shared): Add slowMode + lastTimedOutAt to RepoBookmark"
```

---

## Task 2: DB schema migration + slow-flag helpers

**Files:**
- Modify: `server/src/services/db.ts` — schema block, rowToRepo, stmtAllRepos / stmtRepoById, add helpers
- Manual check: `server/data/sikagit.db` columns

- [ ] **Step 1: Add columns to the schema block + write the additive migration**

Find the `CREATE TABLE IF NOT EXISTS repos (...)` block in `server/src/services/db.ts` (around line 18). After the `db.exec(...)` block that contains it, add an additive migration *before* any prepared-statement declarations. Look for the existing `PRAGMA table_info(project_repos)` pattern (around line 54) — match that style:

```ts
// --- Additive migration: repos.slow_mode / repos.last_timed_out_at ---
const repoCols = db.prepare("PRAGMA table_info(repos)").all() as { name: string }[];
const repoColNames = new Set(repoCols.map(c => c.name));
if (!repoColNames.has('slow_mode')) {
  db.exec('ALTER TABLE repos ADD COLUMN slow_mode INTEGER NOT NULL DEFAULT 0');
}
if (!repoColNames.has('last_timed_out_at')) {
  db.exec('ALTER TABLE repos ADD COLUMN last_timed_out_at TEXT');
}
```

Also add the columns to the inline `CREATE TABLE IF NOT EXISTS repos` body so a fresh install gets them without needing the migration:

```sql
CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  display_path TEXT,
  name TEXT NOT NULL,
  is_wsl INTEGER NOT NULL DEFAULT 0,
  last_opened TEXT,
  "group" TEXT,
  avatar TEXT,
  slow_mode INTEGER NOT NULL DEFAULT 0,
  last_timed_out_at TEXT
)
```

- [ ] **Step 2: Extend `rowToRepo` to surface the new fields**

Replace the existing `rowToRepo` function (around line 139):

```ts
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
```

- [ ] **Step 3: Update the SELECT lists in `stmtAllRepos` and `stmtRepoById`**

Replace lines 152-153:

```ts
const stmtAllRepos = db.prepare('SELECT id, path, display_path, name, is_wsl, last_opened, "group", avatar, slow_mode, last_timed_out_at FROM repos');
const stmtRepoById = db.prepare('SELECT id, path, display_path, name, is_wsl, last_opened, "group", avatar, slow_mode, last_timed_out_at FROM repos WHERE id = ?');
```

`stmtInsertRepo` does NOT need updating — the columns have safe defaults (`0` / `NULL`).

- [ ] **Step 4: Add the slow-flag helpers**

After the `repoExistsByPath` function (around line 207), before the `// --- Repo status cache ---` section:

```ts
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
```

- [ ] **Step 5: Rebuild the server container so the schema migration runs**

Per the project's "rebuild on server-side changes" rule:

```bash
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml up -d --build server
```

Wait for the server to start (~10-20s).

- [ ] **Step 6: Verify migration ran cleanly**

```bash
docker exec sikagit-server-1 sh -c "sqlite3 /app/server/data/sikagit.db 'PRAGMA table_info(repos)'"
```

Expected output includes both new columns at the bottom:
```
8|slow_mode|INTEGER|1|0|0
9|last_timed_out_at|TEXT|0||0
```

If the database file path is different (check `docker exec sikagit-server-1 ls /app/server/data/`), adjust the path. If sqlite3 isn't installed in the container, run inside the container `apk add sqlite || apt-get install -y sqlite3` or use `node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); console.log(db.prepare('PRAGMA table_info(repos)').all())"`.

- [ ] **Step 7: Verify the API still returns repos and the new fields are surfaced**

```bash
curl -s http://localhost:3001/api/v1/repos | head -c 400
```

Expected: JSON with `"success":true,"data":[...]` and each repo object includes `"slowMode":false,"lastTimedOutAt":null`.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/db.ts
git commit -m "feat(db): Add slow_mode column + markRepoSlow/clearRepoSlow helpers"
```

---

## Task 3: `withTimeout` helper + apply to `getStatusSummary`

**Files:**
- Modify: `server/src/services/gitService.ts` — add helper near top, update `getGit` (line 71), wrap `getStatusSummary` (line 146)

- [ ] **Step 1: Add the timeout helper and error class**

Open `server/src/services/gitService.ts`. After the imports block (around line 4, before the existing `getGit` function), insert:

```ts
const STATUS_TIMEOUT_MS = parseInt(process.env.STATUS_TIMEOUT_MS || '8000', 10);

export class GitTimeoutError extends Error {
  public readonly label: string;
  public readonly ms: number;
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'GitTimeoutError';
    this.label = label;
    this.ms = ms;
  }
}

async function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GitTimeoutError(label, ms)), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Update `getGit` to pass the timeout to simple-git**

Replace the body of `getGit` (around line 71-80):

```ts
function getGit(repoPath: string): SimpleGit {
  const normalized = normalizePath(repoPath);
  // core.quotepath=false makes git emit non-ASCII paths (Arabic, CJK, accents…)
  // as raw UTF-8 instead of octal escapes like "\330\261\331\210...". Simple-git
  // forwards this to every command as `-c core.quotepath=false`, so status,
  // diff, log, etc. all return human-readable paths.
  //
  // timeout.block: kill the spawned git subprocess if it overruns. Belt-and-braces
  // alongside withTimeout() — without this, a hung git child keeps running until
  // OS reaper time even after our promise rejects, wasting a concurrency slot.
  return simpleGit(normalized, {
    config: ['core.quotepath=false'],
    timeout: { block: STATUS_TIMEOUT_MS },
  });
}
```

- [ ] **Step 3: Wrap `getStatusSummary` in `withTimeout`**

Replace `getStatusSummary` (around line 146-167):

```ts
export async function getStatusSummary(repoPath: string): Promise<{
  ahead: number;
  behind: number;
  hasChanges: boolean;
  hasRemote: boolean;
}> {
  return withTimeout(async () => {
    const git = getGit(repoPath);
    const status = await git.status();
    let hasRemote = false;
    try {
      const url = (await git.raw(['config', '--local', 'remote.origin.url'])).trim();
      hasRemote = url.length > 0;
    } catch {
      // No remote.origin.url configured
    }
    return {
      ahead: status.ahead,
      behind: status.behind,
      hasChanges: status.files.length > 0,
      hasRemote,
    };
  }, STATUS_TIMEOUT_MS, 'getStatusSummary');
}
```

- [ ] **Step 4: Rebuild server**

```bash
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml up -d --build server
```

- [ ] **Step 5: Verify the wrapper fires by tripping a cheap timeout**

Temporarily set the timeout very low on an existing fast repo:

```bash
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml down server
STATUS_TIMEOUT_MS=10 docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml up -d server
sleep 5
curl -s -X POST http://localhost:3001/api/v1/git/status-summary/refresh \
  -H 'Content-Type: application/json' \
  -d "$(curl -s http://localhost:3001/api/v1/repos | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{const d=JSON.parse(s).data; console.log(JSON.stringify({repos: d.slice(0,3).map(r=>({id:r.id,path:r.path}))}))})')"
```

Expected: response is still 200 OK but the body should contain (in server logs) the `GitTimeoutError` being thrown for each repo. Look at logs:

```bash
docker logs sikagit-server-1 --tail 30 2>&1 | grep -i "timeout\|GitTimeoutError"
```

Expected: at least one mention of `GitTimeoutError: getStatusSummary timed out after 10ms`.

Restore normal timeout for the rest of the work:

```bash
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml down server
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml up -d server
```

- [ ] **Step 6: Commit**

```bash
git add server/src/services/gitService.ts
git commit -m "feat(server): Add withTimeout wrapper around getStatusSummary"
```

---

## Task 4: Refactor `/status-summary/refresh` route to filter + mark/clear slow

**Files:**
- Modify: `server/src/routes/git.ts:36-66`

- [ ] **Step 1: Update the route to filter slow repos and handle timeouts**

Replace the body of `router.post('/status-summary/refresh', ...)` (lines 36-66):

```ts
// Compute fresh summaries for a subset of repos and write them through to the cache.
// Skips repos flagged as slow_mode=1 unless force=true. On timeout, marks the
// repo slow. On success against a previously-slow repo, clears the flag.
router.post('/status-summary/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { repos: incoming, force } = req.body as {
    repos: { id: string; path: string }[];
    force?: boolean;
  };
  if (!Array.isArray(incoming)) {
    res.status(400).json({ success: false, error: 'repos array required' });
    return;
  }

  // Filter out slow repos unless caller explicitly forces.
  const slowIds = force ? new Set<string>() : new Set(db.getSlowRepoIds());
  const repos = incoming.filter(r => !slowIds.has(r.id));

  const { normalizePath } = await import('../services/pathService');
  const results: Record<string, {
    ahead?: number; behind?: number; hasChanges?: boolean; hasRemote?: boolean;
    computedAt?: string;
    skipped?: boolean;
    reason?: string;
    slowMode?: boolean;
    lastTimedOutAt?: string;
  }> = {};

  // Surface filtered repos in the response so the client can update its local state.
  for (const id of slowIds) {
    results[id] = { skipped: true, reason: 'slow', slowMode: true };
  }

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= repos.length) return;
      const { id, path: repoPath } = repos[idx];
      try {
        const normalized = normalizePath(repoPath);
        const summary = await gitService.getStatusSummary(normalized);
        db.upsertRepoStatusSummary(id, summary);
        db.clearRepoSlow(id); // no-op if already 0
        results[id] = { ...summary, computedAt: new Date().toISOString(), slowMode: false };
      } catch (err) {
        if (err instanceof gitService.GitTimeoutError) {
          const at = new Date().toISOString();
          db.markRepoSlow(id, at);
          results[id] = { skipped: true, reason: 'slow', slowMode: true, lastTimedOutAt: at };
        } else {
          // Non-timeout failure (deleted repo, not a git repo, etc.) — leave entry absent
          // so client falls back to its cached value silently. Matches prior behavior.
        }
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
```

- [ ] **Step 2: Rebuild server**

```bash
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml up -d --build server
```

- [ ] **Step 3: Verify the route accepts `force` and round-trips correctly**

```bash
# Pick the first repo from the list
REPO=$(curl -s http://localhost:3001/api/v1/repos | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{const r=JSON.parse(s).data[0]; console.log(JSON.stringify([{id:r.id, path:r.path}]))})')
# Refresh without force
curl -s -X POST http://localhost:3001/api/v1/git/status-summary/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"repos\": $REPO}"
```

Expected: `{"success":true,"data":{"<repoId>":{"ahead":...,"behind":...,"hasChanges":...,"hasRemote":...,"computedAt":"...","slowMode":false}}}`

- [ ] **Step 4: Verify the auto-skip behavior using the DB directly**

```bash
# Manually mark a repo slow
REPO_ID=$(curl -s http://localhost:3001/api/v1/repos | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{console.log(JSON.parse(s).data[0].id)})')
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); db.prepare('UPDATE repos SET slow_mode=1 WHERE id=?').run('$REPO_ID'); console.log('marked', db.prepare('SELECT id,slow_mode FROM repos WHERE id=?').get('$REPO_ID'))"

# Refresh without force — should be skipped
REPO=$(curl -s http://localhost:3001/api/v1/repos | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{const r=JSON.parse(s).data[0]; console.log(JSON.stringify([{id:r.id, path:r.path}]))})')
curl -s -X POST http://localhost:3001/api/v1/git/status-summary/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"repos\": $REPO}"
```

Expected: `{"<repoId>":{"skipped":true,"reason":"slow","slowMode":true}}` — the worker pool never ran for that repo.

- [ ] **Step 5: Verify force=true bypasses the filter and clears the flag**

```bash
curl -s -X POST http://localhost:3001/api/v1/git/status-summary/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"force\": true, \"repos\": $REPO}"

# Confirm slow_mode is now 0
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); console.log(db.prepare('SELECT id,slow_mode FROM repos').all())"
```

Expected: response contains a full summary (not `skipped`), and `slow_mode` is `0` in the DB.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/git.ts
git commit -m "feat(server): Filter slow repos from auto refresh, mark on timeout, clear on success"
```

---

## Task 5: New `/status-summary/refresh-one` route

**Files:**
- Modify: `server/src/routes/git.ts` — add new route after the refactored `/status-summary/refresh`

- [ ] **Step 1: Add the single-repo force-refresh route**

Insert this AFTER the `router.post('/status-summary/refresh', ...)` block from Task 4, BEFORE the `router.use(validateRepoPath)` line:

```ts
// Single-repo force refresh — used by the sidebar's right-click "Refresh status (force)".
// Always bypasses the slow-mode filter. Same per-call timeout applies, so this is safe
// to call against a slow repo — at worst it re-marks slow.
router.post('/status-summary/refresh-one', asyncHandler(async (req: Request, res: Response) => {
  const { id, path: repoPath } = req.body as { id: string; path: string };
  if (!id || !repoPath) {
    res.status(400).json({ success: false, error: 'id and path required' });
    return;
  }
  const { normalizePath } = await import('../services/pathService');
  try {
    const normalized = normalizePath(repoPath);
    const summary = await gitService.getStatusSummary(normalized);
    db.upsertRepoStatusSummary(id, summary);
    db.clearRepoSlow(id);
    res.json({
      success: true,
      data: { ...summary, computedAt: new Date().toISOString(), slowMode: false },
    });
  } catch (err) {
    if (err instanceof gitService.GitTimeoutError) {
      const at = new Date().toISOString();
      db.markRepoSlow(id, at);
      res.json({
        success: true,
        data: { skipped: true, reason: 'slow', slowMode: true, lastTimedOutAt: at },
      });
    } else {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }
}));
```

- [ ] **Step 2: Rebuild server**

```bash
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml up -d --build server
```

- [ ] **Step 3: Verify the route works**

```bash
# Mark a repo slow first
REPO_ID=$(curl -s http://localhost:3001/api/v1/repos | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{console.log(JSON.parse(s).data[0].id)})')
REPO_PATH=$(curl -s http://localhost:3001/api/v1/repos | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{console.log(JSON.parse(s).data[0].path)})')
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); db.prepare('UPDATE repos SET slow_mode=1 WHERE id=?').run('$REPO_ID')"

# Force-refresh it
curl -s -X POST http://localhost:3001/api/v1/git/status-summary/refresh-one \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"$REPO_ID\",\"path\":\"$REPO_PATH\"}"

# Confirm flag cleared
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); console.log(db.prepare('SELECT id,slow_mode FROM repos WHERE id=?').get('$REPO_ID'))"
```

Expected: response contains a fresh summary; `slow_mode` is `0`.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/git.ts
git commit -m "feat(server): Add POST /git/status-summary/refresh-one for force refresh"
```

---

## Task 6: Add `refreshStatusSummaryOne` to API client

**Files:**
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Add the helper next to the existing refresh helper**

Find the `refreshStatusSummary` declaration in `client/src/lib/api.ts` (look for `refreshStatusSummary:`) and add the new helper right after its closing `),`:

```ts
  refreshStatusSummaryOne: (id: string, path: string) =>
    request<{
      ahead?: number; behind?: number; hasChanges?: boolean; hasRemote?: boolean;
      computedAt?: string;
      skipped?: boolean;
      reason?: string;
      slowMode?: boolean;
      lastTimedOutAt?: string;
    }>('/git/status-summary/refresh-one', {
      method: 'POST',
      body: JSON.stringify({ id, path }),
    }),
```

The return shape mirrors the per-repo entry from the batch route, so the store can treat both responses uniformly.

- [ ] **Step 2: Commit**

```bash
git add client/src/lib/api.ts
git commit -m "feat(client): Add refreshStatusSummaryOne API helper"
```

Vite HMR will pick this up automatically — no container rebuild needed (per the project's "don't rebuild Docker for client-side changes" rule).

---

## Task 7: Store changes — skip slow repos + add force-refresh-one action

**Files:**
- Modify: `client/src/store/repoStatusStore.ts`

- [ ] **Step 1: Extend store types + state**

Open `client/src/store/repoStatusStore.ts`. Update the imports / types block at the top:

```ts
import { create } from 'zustand';
import { api } from '../lib/api';

interface RepoStatusSummary {
  ahead: number;
  behind: number;
  hasChanges: boolean;
  hasRemote: boolean;
  computedAt?: string;
}

interface RepoStatusState {
  summaries: Record<string, RepoStatusSummary>;
  slowMode: Set<string>;            // ids currently flagged slow on the server
  inFlight: Set<string>;
  loadCached: (ids: string[]) => Promise<void>;
  refreshSubset: (repos: { id: string; path: string; slowMode?: boolean }[]) => Promise<void>;
  forceRefreshOne: (repo: { id: string; path: string }) => Promise<void>;
}
```

- [ ] **Step 2: Replace the store body to track `slowMode` and add `forceRefreshOne`**

Replace the `useRepoStatusStore` declaration (the existing `create<RepoStatusState>()(...)` block):

```ts
export const useRepoStatusStore = create<RepoStatusState>()((set, get) => ({
  summaries: {},
  slowMode: new Set<string>(),
  inFlight: new Set<string>(),

  loadCached: async (ids) => {
    if (ids.length === 0) return;
    try {
      const data = await api.getStatusSummaryCached(ids);
      set(state => ({ summaries: { ...state.summaries, ...data } }));
    } catch {
      // Cached read failures are non-critical — badges stay blank.
    }
  },

  refreshSubset: async (repos) => {
    if (repos.length === 0) return;
    const { inFlight, slowMode } = get();
    // Drop repos already in-flight OR already flagged slow on the client side.
    // (Server also filters slow repos, but doing it here saves the round-trip.)
    const filtered = repos.filter(r => !inFlight.has(r.id) && !slowMode.has(r.id));
    if (filtered.length === 0) return;

    const nextInFlight = new Set(inFlight);
    for (const r of filtered) nextInFlight.add(r.id);
    set({ inFlight: nextInFlight });

    try {
      const data = await api.refreshStatusSummary(filtered);
      // Merge in successful summaries; sync slow-mode set from server response.
      const summaries = { ...get().summaries };
      const slow = new Set(get().slowMode);
      for (const id of Object.keys(data)) {
        const entry = data[id] as any;
        if (entry.skipped) {
          slow.add(id);
        } else {
          slow.delete(id);
          summaries[id] = entry;
        }
      }
      set({ summaries, slowMode: slow });
    } catch {
      // Refresh failures are non-critical — cached values remain visible.
    } finally {
      const after = new Set(get().inFlight);
      for (const r of filtered) after.delete(r.id);
      set({ inFlight: after });
    }
  },

  forceRefreshOne: async (repo) => {
    const { inFlight } = get();
    if (inFlight.has(repo.id)) return;
    const nextInFlight = new Set(inFlight);
    nextInFlight.add(repo.id);
    set({ inFlight: nextInFlight });

    try {
      const data = await api.refreshStatusSummaryOne(repo.id, repo.path);
      const summaries = { ...get().summaries };
      const slow = new Set(get().slowMode);
      if ((data as any).skipped) {
        slow.add(repo.id);
      } else {
        slow.delete(repo.id);
        summaries[repo.id] = data as RepoStatusSummary;
      }
      set({ summaries, slowMode: slow });
    } catch {
      // Network error — leave state untouched.
    } finally {
      const after = new Set(get().inFlight);
      after.delete(repo.id);
      set({ inFlight: after });
    }
  },
}));
```

- [ ] **Step 3: Update `enqueueRepoRefresh` to honor `slowMode`**

Replace the existing `enqueueRepoRefresh` function (the one near the bottom of the file):

```ts
export function enqueueRepoRefresh(
  repo: { id: string; path: string; slowMode?: boolean },
  opts?: { force?: boolean }
) {
  if (!opts?.force) {
    // Skip server-flagged slow repos AND client-cached slow flag.
    const { slowMode } = useRepoStatusStore.getState();
    if (repo.slowMode || slowMode.has(repo.id)) return;

    const cached = useRepoStatusStore.getState().summaries[repo.id];
    if (cached?.computedAt) {
      const age = Date.now() - new Date(cached.computedAt).getTime();
      if (age < STALE_MS) return; // fresh enough, skip
    }
  }
  pending.set(repo.id, repo.path);
  if (flushTimer === null) flushTimer = setTimeout(flush, QUEUE_FLUSH_MS);
}
```

- [ ] **Step 4: Verify the client builds (Vite picks up HMR)**

```bash
docker logs sikagit-client-1 --tail 20 2>&1 | tail -10
```

Expected: no compile errors in the recent Vite output. If you see TS errors about `slowMode` missing on a passed object, the Sidebar Task 8 fix is what addresses them — that's expected at this point and will resolve in the next task.

- [ ] **Step 5: Commit**

```bash
git add client/src/store/repoStatusStore.ts
git commit -m "feat(client): Track slowMode in repoStatusStore; skip slow repos from auto refresh"
```

---

## Task 8: Sidebar UI — slow indicator + right-click force-refresh

**Files:**
- Modify: `client/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Inspect existing structure**

Open `client/src/components/layout/Sidebar.tsx` and locate:
- `RepoStatusDot` component (around line 16) — the dot we'll annotate with `⏸`
- `RepoItem` component (around line 428) — the standalone row
- The render call inside `DraggableRepoList` (around line 348) — the projects-list row

Both row variants render `<RepoStatusDot repoId={repo.id} />`. The simplest change is to pass the repo's `slowMode` flag down and tell the dot to render the indicator when set, and add the right-click handler on each row wrapper.

- [ ] **Step 2: Update `RepoStatusDot` to render the paused indicator**

Replace the `RepoStatusDot` function (start around line 16; preserve its existing rendering logic, just add the indicator):

```tsx
function RepoStatusDot({ repoId, slowMode }: { repoId: string; slowMode?: boolean }) {
  const summary = useRepoStatusStore(s => s.summaries[repoId]);
  const inFlight = useRepoStatusStore(s => s.inFlight.has(repoId));

  if (slowMode) {
    return (
      <span
        className="repo-status-dot repo-status-slow"
        title="Auto-refresh paused after timeout. Right-click → Refresh status to retry."
        aria-label="slow"
      >
        ⏸
      </span>
    );
  }

  // ... existing dot logic preserved below: hasChanges / ahead / behind / etc.
}
```

**Important:** the existing function body has rules for green/red/yellow dot rendering. Keep all of that — only add the `if (slowMode)` early-return at the top and the new `slowMode` prop in the signature.

- [ ] **Step 3: Add a small CSS rule for `.repo-status-slow`**

Find the CSS file the Sidebar imports (search for `repo-status-dot` in the codebase):

```bash
grep -rln "repo-status-dot" client/src --include='*.css'
```

In that file, add:

```css
.repo-status-slow {
  opacity: 0.7;
  font-size: 11px;
  line-height: 1;
  /* Keep the same circular footprint as the regular status dot so layout doesn't shift. */
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

If `RepoStatusDot` styles are inline rather than CSS-class-based, skip this step and use a `style={{ opacity: 0.7 }}` prop on the `<span>` above instead.

- [ ] **Step 4: Pass `slowMode` down + add right-click handler in `RepoItem`**

Find the `RepoItem` component (around line 428). Update its render block. Surface a toast via the existing `useToastStore` if the force-refresh still times out:

```tsx
function RepoItem({ repo, isActive, onSelect }: {
  repo: RepoBookmark;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  const forceRefreshOne = useRepoStatusStore(s => s.forceRefreshOne);
  const slowMode = useRepoStatusStore(s => s.slowMode);
  const addToast = useToastStore(s => s.addToast);

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    // Minimal context menu — for now just trigger the action directly.
    // (A proper menu UI is future polish; this satisfies the spec's
    // "right-click → refresh" affordance.)
    if (!confirm(`Force refresh status for "${repo.name}"?`)) return;
    await forceRefreshOne({ id: repo.id, path: repo.path });
    // If still slow after the force refresh, tell the user.
    if (useRepoStatusStore.getState().slowMode.has(repo.id)) {
      addToast('warning', `"${repo.name}" is still slow — try again later`);
    }
  };

  // ... existing JSX, with two changes:
  //   1. Add onContextMenu={handleContextMenu} on the outermost row element
  //   2. Replace <RepoStatusDot repoId={repo.id} /> with
  //      <RepoStatusDot repoId={repo.id} slowMode={repo.slowMode} />
}
```

**Replace** the existing `<RepoStatusDot repoId={repo.id} />` (line 468) with:
```tsx
<RepoStatusDot repoId={repo.id} slowMode={repo.slowMode} />
```

**Add** `onContextMenu={handleContextMenu}` to the row's outermost element (the `<div>` or `<button>` that wraps the row in `RepoItem`'s return JSX). Keep all existing event handlers.

- [ ] **Step 5: Same changes in the `DraggableRepoList` projects-mode rows**

Find the equivalent render call inside `DraggableRepoList` (around line 348). It currently has `<RepoStatusDot repoId={repo.id} />`. Replace with:
```tsx
<RepoStatusDot repoId={repo.id} slowMode={repo.slowMode} />
```

And add a context-menu handler on the same row-level wrapper that `DraggableRepoList` uses for each repo. The wrapper to attach it to is the one keyed by repo id — look for the outer element rendered inside the `projectRepos.map(...)` block (around lines 320-330).

Pull `forceRefreshOne` and `addToast` once inside `DraggableRepoList` (top-level of the component, not inside the map):

```tsx
const forceRefreshOne = useRepoStatusStore(s => s.forceRefreshOne);
const addToast = useToastStore(s => s.addToast);

const onRepoContextMenu = (repo: RepoBookmark) => async (e: React.MouseEvent) => {
  e.preventDefault();
  if (!confirm(`Force refresh status for "${repo.name}"?`)) return;
  await forceRefreshOne({ id: repo.id, path: repo.path });
  if (useRepoStatusStore.getState().slowMode.has(repo.id)) {
    addToast('warning', `"${repo.name}" is still slow — try again later`);
  }
};
```

Attach `onContextMenu={onRepoContextMenu(repo)}` on the outer row element. Make sure `useToastStore` is imported at the top of the file:

```ts
import { useToastStore } from '../../store/toastStore';
```

- [ ] **Step 6: Update the visible-only refresh effect to pass `slowMode`**

Find where the IntersectionObserver fires `enqueueRepoRefresh(...)` for a visible repo (search the file for `enqueueRepoRefresh` or `markRepoVisible`). Wherever the call site passes `{ id, path }`, update it to include `slowMode`:

```ts
enqueueRepoRefresh({ id: repo.id, path: repo.path, slowMode: repo.slowMode });
```

If the call site uses `markRepoVisible(repo)`, the helper signature in `repoStatusStore.ts` will need a small update too — find its declaration and:

```ts
export function markRepoVisible(repo: { id: string; path: string; slowMode?: boolean }) {
  visible.set(repo.id, repo.path);
  enqueueRepoRefresh(repo);
}
```

This change isn't strictly required (the store already double-filters by `slowMode` set), but passing the flag down makes the rule visible at the call site and avoids one round-trip to read the store on every visibility tick.

- [ ] **Step 7: Verify the client builds + sidebar renders**

```bash
docker logs sikagit-client-1 --tail 30 2>&1 | tail -15
```

Expected: no TypeScript errors. Reload `http://localhost:3200` in the browser; sidebar renders normally.

To trigger the slow indicator on a known-fast repo, manually mark one slow via the DB (same trick as Task 4 Step 4):

```bash
REPO_ID=$(curl -s http://localhost:3001/api/v1/repos | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{console.log(JSON.parse(s).data[0].id)})')
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); db.prepare('UPDATE repos SET slow_mode=1 WHERE id=?').run('$REPO_ID')"
```

Reload the sidebar. The first repo should now display `⏸` instead of the normal status dot. Right-click → confirm dialog → after OK, the indicator clears (because the repo is genuinely fast and the force refresh succeeded).

- [ ] **Step 8: Commit**

```bash
git add client/src/components/layout/Sidebar.tsx client/src/store/repoStatusStore.ts client/src/**/*.css
git commit -m "feat(client): Show slow indicator + right-click force refresh on sidebar rows"
```

(If no CSS file was changed, omit the `*.css` part.)

---

## Task 9: End-to-end manual verification

This task runs the test plan from the spec to confirm the system behaves as designed.

- [ ] **Step 1: Trip a real timeout cheaply**

Restart the server with an aggressive timeout so *any* repo trips it:

```bash
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml down server
STATUS_TIMEOUT_MS=100 docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml up -d server
sleep 5
```

Reload the sidebar in the browser, scroll through it so every visible repo triggers a refresh. After a few seconds, refresh the page (so the DB-backed `slowMode` is read fresh). Every repo should now show `⏸`.

Confirm via SQLite:
```bash
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); console.log(db.prepare('SELECT COUNT(*) AS c FROM repos WHERE slow_mode = 1').get())"
```

Expected: count matches the number of repos that were visible.

- [ ] **Step 2: Verify auto-path isolation**

Restore the normal timeout but keep the flags set:

```bash
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml down server
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml up -d server
sleep 5
```

Open `docker logs sikagit-server-1 -f` in one terminal. In the browser, scroll through the sidebar 10 times. The server log should NOT show `getStatusSummary` activity for the flagged repos.

- [ ] **Step 3: Force-refresh clears the flag**

Right-click a slow-flagged repo → confirm the dialog → wait a second. The `⏸` should clear, the normal status badge should appear.

Confirm in DB:
```bash
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); console.log(db.prepare('SELECT COUNT(*) AS c FROM repos WHERE slow_mode = 1').get())"
```

Expected: count decreased.

- [ ] **Step 4: DB persistence across restarts**

Manually flag a repo, restart, confirm the flag survives:

```bash
REPO_ID=$(curl -s http://localhost:3001/api/v1/repos | node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{console.log(JSON.parse(s).data[0].id)})')
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); db.prepare('UPDATE repos SET slow_mode=1 WHERE id=?').run('$REPO_ID')"
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml restart server
sleep 5
curl -s http://localhost:3001/api/v1/repos | node -e "let s=''; process.stdin.on('data',c=>s+=c); process.stdin.on('end',()=>{const r=JSON.parse(s).data.find(x=>x.id==='$REPO_ID'); console.log(r ? r.slowMode : 'not found')})"
```

Expected: prints `true`.

- [ ] **Step 5: Existing flows still work on slow repos**

Click the slow-flagged repo in the sidebar. Verify in the browser:
1. The repo opens (main panel shows its log/branches).
2. The commit history loads.
3. Clicking a commit shows the diff.
4. The status panel (working tree changes) computes — this hits the active-repo flow which uses `force: true`, so it should bypass the slow filter.

If step 4 itself hangs, that's the documented event-loop limitation from the spec — not a bug in this implementation.

- [ ] **Step 6: Migration safety on existing DB**

Confirm the additive migration is idempotent and safe. Already validated implicitly by Tasks 2 & 5, but explicit check:

```bash
docker exec sikagit-server-1 sh -c "sqlite3 /app/server/data/sikagit.db 'SELECT COUNT(*) FROM repos'"
# All your existing repos should still be there.
docker exec sikagit-server-1 sh -c "sqlite3 /app/server/data/sikagit.db 'PRAGMA table_info(repos)' | grep -E 'slow_mode|last_timed_out_at'"
# Both columns should appear.
docker compose -f /mnt/d/programming/Sikasio/sikagit/docker-compose.yml restart server
sleep 5
docker exec sikagit-server-1 sh -c "sqlite3 /app/server/data/sikagit.db 'PRAGMA table_info(repos)' | grep -E 'slow_mode|last_timed_out_at'"
# Still both there, no duplicates — confirms `IF NOT EXISTS`-style migration is safe on re-run.
```

- [ ] **Step 7: Force-refresh failure on a genuinely slow repo (optional)**

If you have access to the COPS GameClient repo or another known-slow path: force-refresh it, watch the toast appear with "still slow — try again later", and confirm `slow_mode` stays `1` in the DB. This validates the failure branch end-to-end. Skip if no slow repo is readily available.

- [ ] **Step 8: Unflag everything and commit cleanly**

```bash
docker exec sikagit-server-1 node -e "const db=require('better-sqlite3')('/app/server/data/sikagit.db'); console.log(db.prepare('UPDATE repos SET slow_mode=0').run())"
```

If any commits from earlier tasks need a final touch (e.g., a typo, a missed import), squash-fix here:

```bash
git status
# Address any uncommitted leftovers
```

---

## Done criteria

All boxes above checked, all 8 commits landed, manual test plan from Task 9 passing on the user's machine, and the sidebar shows `⏸` for a repo that has timed out — with right-click → confirm → clear working end to end.
