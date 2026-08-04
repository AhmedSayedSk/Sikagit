# SikaGit — "Last worked on" date per repo & project

**Date:** 2026-08-04
**Status:** Design approved (UI decisions confirmed); pending spec review

## Goal

Show, for every repository and every project in the sidebar, **when it was last
worked on** — defined as the **date of the most recent commit** (committer date).
Per project, the value is the **newest** last-commit across that project's repos.
Rendered as a compact relative time ("2h", "3d", "1w") inline on each row, left
of the existing status dot. Display only — no sorting/reordering.

## Why this approach

SikaGit already has the exact machinery this needs: the **status-summary cache**
that powers the ahead/behind/dirty dots. It computes a cheap per-repo summary on
the server, caches it in SQLite keyed by `repo_id`, serves it via
`/git/status-summary/cached`, refreshes visible rows via
`/git/status-summary/refresh`, holds it in `repoStatusStore`, and renders it in
`RepoStatusDot` / `ProjectStatusDot`. We piggyback `lastCommitAt` onto that same
pipeline — **no new endpoints, no new store, one new SQLite column**.

Rejected alternatives:
- **Separate activity cache + endpoints + store** — duplicates the whole pipeline
  for no benefit.
- **Compute on every `GET /repos`** — N synchronous `git log` calls on every
  sidebar load; the cache pipeline exists specifically to avoid this.

## Data model

Add one nullable column to the existing cache; extend the two summary types.

- **SQLite** `repo_status_cache` (`server/src/services/db.ts:45`): add
  `last_commit_at TEXT` (ISO 8601 string, `NULL` for repos with no commits).
  Migrate additively with the existing `PRAGMA table_info` idiom
  (`db.ts:70-77`).
- **`RepoStatusCacheEntry`** (server, `db.ts:277-285`): add
  `lastCommitAt: string | null`.
- **`RepoStatusSummary`** (client type used by `repoStatusStore`): add
  `lastCommitAt: string | null`.

No change to `repos`, `projects`, or `project_repos`. The existing
`repos.last_opened` field is unrelated (it means "last selected in the UI") and
is left untouched.

## Server

- **`gitService.getStatusSummary(repoPath)`** (`gitService.ts:201-236`): after the
  existing summary is built, compute the last commit date with the cheapest
  plumbing call:
  ```
  git.raw(['log', '-1', '--format=%ct'])   // committer date, unix seconds
  ```
  - Guard with the existing `hasCommits(repoPath)` helper (`gitService.ts:120`)
    or catch the "unborn HEAD" error → `lastCommitAt = null`.
  - Convert: `new Date(parseInt(ct, 10) * 1000).toISOString()`.
  - Return it as a new field on the summary object. Reuses the same
    `getGit(repoPath)` timeout-configured instance, so slow/WSL repos already
    get slow-mode + timeout handling for free.
- **`db.upsertRepoStatusSummary`** (`db.ts:321-335`) and
  **`db.getRepoStatusSummaries`** (`db.ts:300-319`): write/read the new column.
- **Refresh routes** (`routes/git.ts` `/git/status-summary/refresh` `:38`,
  `/refresh-one` `:118`): they map `getStatusSummary` results into the cache —
  include `lastCommitAt` in that mapping. No new routes.

## Client

Data flows through the existing calls unchanged (`api.getStatusSummaryCached`,
`api.refreshStatusSummary*`) — the field simply rides along on the summary
objects into `repoStatusStore.summaries[id]`.

- **Compact formatter** — add `formatDateCompact(dateStr): string` to
  `client/src/lib/utils.ts` (next to the existing `formatDate` at `:8`). Output:
  `< 1m → "now"`, minutes → `"5m"`, hours → `"2h"`, days → `"3d"`, weeks →
  `"2w"`, months → `"3mo"`, years → `"2y"`. (The existing `formatDate` stays for
  the verbose "…ago" uses elsewhere.)
- **Repo activity chip** — a small isolated component
  `RepoActivityChip({ repoId })` that reads
  `useRepoStatusStore(s => s.summaries[repoId]?.lastCommitAt)` and renders a muted
  span (Tailwind `text-text-muted`, `fontSize: fontSize - 6`, `tabular-nums`,
  `whitespace-nowrap`) or nothing when null. Placed **between the name `div` and
  the status dot** in both repo rows:
  - `RepoItem` row (`Sidebar.tsx:538-555`, chip before `RepoStatusDot` at `:554`)
  - `DraggableRepoList` row (`Sidebar.tsx:400-417`, chip before its status dot)
- **Project activity chip** — `ProjectActivityChip({ repoIds })` reads the
  summaries for all `repoIds`, takes `max(lastCommitAt)` (ignoring nulls), renders
  the same muted span. Placed in the `ProjectSection` header
  (`Sidebar.tsx:447-480`) before `ProjectStatusDot` at `:479`. Mirrors how
  `ProjectStatusDot` already aggregates over `project.repoIds`.

Resulting row shape (single line): `[icon] [name (flex-1, truncate)] [time chip] [status dot]`.

## Data flow (end to end)

```
git log -1 --format=%ct
  → getStatusSummary() adds lastCommitAt (ISO | null)
  → refresh route upserts into repo_status_cache.last_commit_at
  → GET /status-summary/cached returns it on the summary
  → repoStatusStore.summaries[id].lastCommitAt
  → RepoActivityChip (per repo)  /  ProjectActivityChip (max over repoIds)
  → formatDateCompact() → "2h"
```

## Edge cases

- **Empty repo (unborn HEAD):** `lastCommitAt = null` → chip renders nothing.
- **Project with no committed repos:** all-null → header chip renders nothing.
- **Slow / WSL / timed-out repos:** reuse existing slow-mode + timeout handling;
  a timed-out refresh leaves the previously cached value in place.
- **Off-screen repos:** refreshed only when scrolled into view (same
  IntersectionObserver tradeoff as the status dots); `loadCached` still shows the
  last cached date instantly on load.
- **Long names:** the name keeps `flex-1 truncate`; the chip is
  `whitespace-nowrap` and sits to its right, so the name truncates first.

## Testing

- **Server:** `getStatusSummary` returns a valid ISO `lastCommitAt` for a repo
  with commits, and `null` for an empty repo (unborn HEAD). Follow existing
  gitService test patterns if present.
- **Client:** `formatDateCompact` unit tests across each boundary
  (now/m/h/d/w/mo/y); `ProjectActivityChip` max-aggregation picks the newest
  non-null and renders nothing when all null.

## Out of scope

Sorting/reordering by activity; a dedicated "overview" page; surfacing the date
anywhere outside the sidebar; author-date vs committer-date toggle (committer
date is used).

## Implementation notes

- Server-side changes (gitService, db, routes) require a **server rebuild** to
  take effect; the client chip is picked up by Vite HMR.
- Commits on this repo must **not** carry a `Co-Authored-By: Claude` trailer
  (per the repo owner's standing request).
