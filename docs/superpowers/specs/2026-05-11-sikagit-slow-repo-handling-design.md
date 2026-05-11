# SikaGit — slow-repo handling: design

**Date:** 2026-05-11
**Status:** Draft (awaiting user review)
**Repos affected:** `sikagit` (server + client)

## Overview

Stop a single slow repository from wedging the SikaGit server when its automatic status-summary call hangs (typically large game/asset repos on WSL+NTFS mounts where `git status` can take minutes). Add a per-call timeout on the auto-refresh path; on timeout, persist a "slow" flag in SQLite and stop the background sweep from re-entering that repo. The user can still open and use slow repos fully — only the *background* status refresh is skipped. The flag clears automatically when a user-initiated force refresh succeeds.

## Motivation

SikaGit's server became unresponsive on 2026-05-11 because a `git -c core.quotepath=false status --porcelain -b -u --null` call against `/host/mnt/d/Games/COPS/GameClient` ran for over three minutes. The cached + visible-only sidebar refresh we shipped earlier reduces *frequency* of status calls but doesn't bound their *duration*. When one call hangs:

- The git subprocess sits indefinitely.
- Adjacent node `fs` reads on the same WSL mount can put the main thread into kernel `D` state.
- The Express event loop stops responding.
- Every subsequent API request times out.

The user observed this manifests as "SikaGit didn't respond" — UI completely stuck until a container restart.

## Goals

- A single slow repo never affects the responsiveness of others or of the API as a whole (background path).
- Auto-detection — the system learns which repos are slow without user input.
- Persistence — once a repo is known slow, it stays out of the auto path across server restarts.
- Manual recovery — the user can force a one-off refresh; if it succeeds, the repo rejoins the auto path.
- No change to user-driven operations on slow repos: opening, history, diffs, commit, push all still work.

## Non-goals

- True process-level isolation of git operations (worker thread / child process refactor). See **Limitations** below.
- Eliminating *every* possible hang. User-initiated deep operations on slow repos (force refresh, full diff of a huge tree) may still wedge the loop and require a container restart. This design protects the *automatic* sweep only.
- Detecting slow repos before they trip a timeout (proactive sampling at registration).
- Migrating in-flight cached summaries — buckets reset on schema change is acceptable.

## Architecture

Two coordinated pieces.

**Backend.** A new `withTimeout` helper wraps the body of `getStatusSummary` with an env-configurable timeout (default 8s). On timeout it throws a typed `GitTimeoutError`. The refresh routes catch this error and call `db.markRepoSlow(id, now)` instead of `upsertRepoStatusSummary`. On success against a previously-slow repo, the route also calls `db.clearRepoSlow(id)`. The refresh routes accept a `force` boolean: when absent or false, repos with `slow_mode = 1` are filtered out of the batch before queueing. A new route `POST /git/status-summary/refresh-one` handles single-repo force refreshes from the UI.

**Frontend.** The repo list state already carries DB-backed repo metadata; we add `slowMode` to that shape. The visible-only refresh queue and active-repo refresh both consult `slowMode` and skip enqueueing for slow repos (unless `force: true`). The sidebar row renders a small paused-icon indicator next to the badge when the flag is set; right-click menu gains "Refresh status (force)" which calls the new single-repo route. On success, the store mutates `slowMode` to false locally.

```
┌──────────────────┐
│ visibility tick  │       (existing IntersectionObserver path)
└───────┬──────────┘
        │ enqueueRepoRefresh(repo)
        ▼
┌──────────────────┐    skip if slowMode=true (unless force)
│ refreshSubset    │  ────────────────────────────────────────►  no-op
└───────┬──────────┘
        │ POST /status-summary/refresh
        ▼
┌──────────────────────────────────┐
│ git.ts route                     │   filter slow_mode=1 (unless force)
│  → for each:                     │
│     withTimeout(getStatusSummary)│ ───► success: upsertRepoStatusSummary + clearRepoSlow
│                                  │      timeout: markRepoSlow(id, now)
└──────────────────────────────────┘
```

## Backend changes

### Schema migration — `server/src/services/db.ts`

Additive, using the existing `PRAGMA table_info` check pattern:

```sql
ALTER TABLE repos ADD COLUMN slow_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repos ADD COLUMN last_timed_out_at TEXT;
```

New helpers alongside the existing repo helpers:

```ts
export function markRepoSlow(repoId: string, at: string): void {
  stmtMarkRepoSlow.run({ id: repoId, at });
}

export function clearRepoSlow(repoId: string): void {
  stmtClearRepoSlow.run({ id: repoId });
}
```

The repo-listing query (`getRepos`) is updated to include `slow_mode` and `last_timed_out_at` in the returned `RepoBookmark` shape. The `RepoBookmark` shared type gains `slowMode: boolean` and `lastTimedOutAt: string | null`.

### Timeout helper — `server/src/services/gitService.ts`

```ts
export class GitTimeoutError extends Error {
  constructor(public readonly label: string, public readonly ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'GitTimeoutError';
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

**Applied at `getStatusSummary`:**

```ts
const STATUS_TIMEOUT_MS = parseInt(process.env.STATUS_TIMEOUT_MS || '8000', 10);

export async function getStatusSummary(repoPath: string) {
  return withTimeout(async () => {
    const git = getGit(repoPath);
    const status = await git.status();
    let hasRemote = false;
    try {
      const url = (await git.raw(['config', '--local', 'remote.origin.url'])).trim();
      hasRemote = url.length > 0;
    } catch {}
    return {
      ahead: status.ahead,
      behind: status.behind,
      hasChanges: status.files.length > 0,
      hasRemote,
    };
  }, STATUS_TIMEOUT_MS, 'getStatusSummary');
}
```

**Defense in depth:** update the existing `getGit` helper to pass `{ timeout: { block: STATUS_TIMEOUT_MS } }` into `simpleGit(...)` so the spawned git subprocess gets a SIGKILL from simple-git when it overruns. Without this, `withTimeout` rejects the promise but the child process keeps running until OS reaper time — wasting one of the three slots in the existing concurrency pool. (`getGit` is currently constructed without the timeout option — see `gitService.ts:77`.)

### Route changes — `server/src/routes/git.ts`

`POST /git/status-summary/refresh` accepts `{ repos: [{id, path}], force?: boolean }`:

```ts
router.post('/status-summary/refresh', asyncHandler(async (req, res) => {
  const { repos: incoming, force } = req.body as { repos: { id: string; path: string }[]; force?: boolean };
  let list = incoming;
  if (!force) {
    const slowIds = new Set(db.getSlowRepoIds());
    list = incoming.filter(r => !slowIds.has(r.id));
  }
  const results: Record<string, RepoStatusResponse> = {};
  // existing worker pool, then per-repo:
  try {
    const summary = await gitService.getStatusSummary(repo.path);
    db.upsertRepoStatusSummary(repo.id, summary);
    db.clearRepoSlow(repo.id); // safe even when already cleared
    results[repo.id] = { ...summary, computedAt: new Date().toISOString(), slowMode: false };
  } catch (err) {
    if (err instanceof gitService.GitTimeoutError) {
      const at = new Date().toISOString();
      db.markRepoSlow(repo.id, at);
      results[repo.id] = { skipped: true, reason: 'slow', slowMode: true, lastTimedOutAt: at };
    } else {
      results[repo.id] = { error: (err as Error).message };
    }
  }
  res.json({ success: true, data: results });
}));
```

New route for the per-row force refresh:

```ts
router.post('/status-summary/refresh-one', asyncHandler(async (req, res) => {
  const { id, path } = req.body as { id: string; path: string };
  // Same body as the inner per-repo block above, with force semantics (no slow_mode pre-filter).
  // Returns the single-repo result.
}));
```

`getSlowRepoIds()` is a new helper in `db.ts`: `SELECT id FROM repos WHERE slow_mode = 1`.

## Frontend changes

### `client/src/store/repoStatusStore.ts`

Add a parameter to `refreshSubset` to receive the current repo-list slow flags (read from the existing repo list state in the Sidebar effect, no new fetch). `enqueueRepoRefresh` adds the same check before pushing into the pending queue:

```ts
export function enqueueRepoRefresh(
  repo: { id: string; path: string; slowMode?: boolean },
  opts?: { force?: boolean }
) {
  if (repo.slowMode && !opts?.force) return;
  // ... existing staleness check + queue
}
```

The visible-only path calls `enqueueRepoRefresh(repo)` per row — the slow check happens there. The active-repo effect already passes `force: true`, so opening a slow repo still attempts one fresh refresh.

### `client/src/lib/api.ts`

```ts
refreshStatusSummaryOne: (id: string, path: string) =>
  request<...>('/git/status-summary/refresh-one', {
    method: 'POST',
    body: JSON.stringify({ id, path }),
  }),
```

### `client/src/components/layout/Sidebar.tsx`

`RepoStatusDot` (or the row wrapper) reads `repo.slowMode` and renders a small `⏸` glyph next to the badge when set, with `title="Auto-refresh paused after timeout. Right-click → Refresh status to retry."`. Right-click menu gains one item: "Refresh status (force)" → calls the API helper, on success mutates the repo's `slowMode` in the repo list store to `false` and updates the summaries cache; on second timeout, leaves `slowMode` at `true` and toasts "Still slow — try again later".

## Shared types — `shared/src/types.ts`

`RepoBookmark` (or whichever interface mirrors `repos` rows) gains:

```ts
slowMode: boolean;
lastTimedOutAt: string | null;
```

The status-summary response shape gains an optional `slowMode` and `skipped` for the case where the row is filtered out of the auto path.

## Limitations (documented, not solved)

**Event-loop hangs on adjacent `fs` reads.** This design uses `Promise.race` against `setTimeout` to detect overruns. That works perfectly when the awaited promise is a `simple-git` subprocess call. It does **not** work if the event loop itself is stuck in a kernel `fs` syscall on the slow mount (kernel `D` state) — because the timer callback can't fire while the loop is frozen mid-syscall. In practice this happens during code paths like untracked-file diff generation that call `fs.readFile` directly. The auto-refresh path doesn't touch those paths today, so the design covers the common failure mode (status-summary hang). Future work: move git ops to a worker thread for true isolation.

**No proactive detection.** A first call to a slow repo will still take up to `STATUS_TIMEOUT_MS` (8s default) before being marked. Acceptable: one bad refresh per repo lifetime is much better than wedging the API.

**Force refresh on a slow repo can still hang.** When the user clicks "Refresh status (force)", that call also runs through `withTimeout`, so it gets the same 8s ceiling — but it counts against the concurrency pool just like any other request. Recommend not flooding the queue with force-refreshes against a known-slow repo.

## Configuration

| Env var | Default | Notes |
|---------|---------|-------|
| `STATUS_TIMEOUT_MS` | `8000` | Per-call ceiling for `getStatusSummary`. Reasonable range 3000–15000. |

No new dependencies. No manifest / Docker config changes.

## Testing & verification

Manual test plan (no automated test infrastructure for the git service today):

1. **Trip a timeout cheaply** — `STATUS_TIMEOUT_MS=100 docker compose up`. Open SikaGit. Sidebar normal repos should all flip to `slow_mode=1` on their first refresh. Verify `⏸` indicator appears.
2. **DB persistence** — restart server container without changing `STATUS_TIMEOUT_MS`. Sidebar still shows `⏸` for previously-flagged repos. Confirm in SQLite: `sqlite3 data/sikagit.db 'SELECT id, slow_mode FROM repos'`.
3. **Auto-path isolation** — restore `STATUS_TIMEOUT_MS=8000`, restart. With several slow-flagged repos in the sidebar, scroll through them 10 times. `docker logs sikagit-server-1 -f` should show NO `getStatusSummary` calls for slow repos — only for fast ones.
4. **Force refresh clears flag** — pick a slow-flagged repo whose underlying slowness has cleared (e.g., repoint via Edit → path to a small repo, or restore `STATUS_TIMEOUT_MS` to 8000 after the 100ms test). Right-click → Refresh status (force). The call succeeds, the flag clears, the normal badge appears.
5. **Force refresh on still-slow repo** — `STATUS_TIMEOUT_MS=100` again, force-refresh. Toast appears, flag stays.
6. **Migration safety** — backup `data/sikagit.db`, replace with a copy missing the new columns. Restart server. Migration runs cleanly, all repos default to `slow_mode=0`.
7. **Existing flows still work on slow repos** — open a slow repo: history loads, diffs work, commit + push still function. Only the sidebar background refresh is paused.

## Future work (out of scope)

- **Worker-thread isolation** for git operations — addresses the documented event-loop hang limitation. Large refactor; defer until a force-refresh wedge is actually observed.
- **Proactive heavy-repo detection** at add-repo time (sample working-tree file count, set `slow_mode=1` if above threshold). Cheaper alternative to a real timeout, but inaccurate.
- **Per-op fine-grained timeouts** for other gitService calls (log fetch, diff, etc.) — currently they only run on explicit user action, but a future feature like a refresh-all-history button would benefit.
- **Telemetry** — count of slow events per repo over time, surfaced in repo details so the user can decide to relocate the repo off the slow mount.
