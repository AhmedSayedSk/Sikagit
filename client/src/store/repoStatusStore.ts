import { create } from 'zustand';
import { api } from '../lib/api';

interface RepoStatusSummary {
  ahead: number;
  behind: number;
  hasChanges: boolean;
  hasStaged: boolean;
  hasUnstaged: boolean;
  hasRemote: boolean;
  computedAt?: string;
  lastCommitAt?: string | null;   // ISO date of the most recent commit; null if none
}

interface RepoStatusState {
  summaries: Record<string, RepoStatusSummary>;
  slowMode: Set<string>;            // ids currently in slow mode on the server (fast scan, auto-retried)
  inFlight: Set<string>;
  loadCached: (ids: string[]) => Promise<void>;
  refreshSubset: (repos: { id: string; path: string; slowMode?: boolean }[]) => Promise<void>;
  forceRefreshOne: (repo: { id: string; path: string }) => Promise<void>;
  // Write a freshly-derived summary directly (e.g. from a full status load),
  // bypassing a separate git round-trip.
  setSummary: (id: string, summary: RepoStatusSummary) => void;
  // Seed the slow-mode set from the bookmarks list (server-side flag) so the
  // badge is right before the first refresh response arrives.
  seedSlow: (ids: string[]) => void;
}

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
    const { inFlight } = get();
    // Slow-mode repos are refreshed too: the server runs a fast scan for them
    // and retries the full scan on its own backoff schedule.
    const filtered = repos.filter(r => !inFlight.has(r.id));
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
        const entry = data[id];
        if (entry.slowMode) slow.add(id); else slow.delete(id);
        if (entry.skipped !== true) {
          // Refresh-response fields are all optional on the wire; a non-skipped
          // entry always carries them, but normalize so the required-field
          // RepoStatusSummary stays sound (esp. the staged/unstaged flags).
          summaries[id] = {
            ahead: entry.ahead ?? 0,
            behind: entry.behind ?? 0,
            hasChanges: entry.hasChanges ?? false,
            hasStaged: entry.hasStaged ?? false,
            hasUnstaged: entry.hasUnstaged ?? false,
            hasRemote: entry.hasRemote ?? true,
            computedAt: entry.computedAt,
            lastCommitAt: entry.lastCommitAt ?? null,
          };
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
      if (data.slowMode) slow.add(repo.id); else slow.delete(repo.id);
      if (data.skipped !== true) {
        summaries[repo.id] = {
          ahead: data.ahead ?? 0,
          behind: data.behind ?? 0,
          hasChanges: data.hasChanges ?? false,
          hasStaged: data.hasStaged ?? false,
          hasUnstaged: data.hasUnstaged ?? false,
          hasRemote: data.hasRemote ?? true,
          computedAt: data.computedAt,
          lastCommitAt: data.lastCommitAt ?? null,
        };
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

  setSummary: (id, summary) =>
    set(state => ({ summaries: { ...state.summaries, [id]: summary } })),

  seedSlow: (ids) =>
    set({ slowMode: new Set(ids) }),
}));

// --- Refresh queue (visible-row debouncer) ---
//
// Sidebar rows enqueue their {id, path} when they enter the viewport.
// We batch arrivals over a short window before firing one /refresh call.

const QUEUE_FLUSH_MS = 250;
const STALE_MS = 30_000;

const pending = new Map<string, string>(); // id → path
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  if (pending.size === 0) return;
  const repos = Array.from(pending.entries()).map(([id, path]) => ({ id, path }));
  pending.clear();
  useRepoStatusStore.getState().refreshSubset(repos);
}

export function enqueueRepoRefresh(
  repo: { id: string; path: string; slowMode?: boolean },
  opts?: { force?: boolean }
) {
  if (!opts?.force) {
    const cached = useRepoStatusStore.getState().summaries[repo.id];
    if (cached?.computedAt) {
      const age = Date.now() - new Date(cached.computedAt).getTime();
      if (age < STALE_MS) return; // fresh enough, skip
    }
  }
  pending.set(repo.id, repo.path);
  if (flushTimer === null) flushTimer = setTimeout(flush, QUEUE_FLUSH_MS);
}

// --- Visibility tracking (driven by Sidebar's IntersectionObserver) ---

const visible = new Map<string, string>(); // id → path

export function markRepoVisible(repo: { id: string; path: string; slowMode?: boolean }) {
  visible.set(repo.id, repo.path);
  enqueueRepoRefresh(repo);
}

export function markRepoHidden(id: string) {
  visible.delete(id);
}

export function refreshAllVisible() {
  for (const [id, path] of visible.entries()) {
    enqueueRepoRefresh({ id, path }, { force: true });
  }
}
