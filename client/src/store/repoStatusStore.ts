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
  inFlight: Set<string>;
  loadCached: (ids: string[]) => Promise<void>;
  refreshSubset: (repos: { id: string; path: string }[]) => Promise<void>;
}

export const useRepoStatusStore = create<RepoStatusState>()((set, get) => ({
  summaries: {},
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
    const filtered = repos.filter(r => !inFlight.has(r.id));
    if (filtered.length === 0) return;

    const next = new Set(inFlight);
    for (const r of filtered) next.add(r.id);
    set({ inFlight: next });

    try {
      const data = await api.refreshStatusSummary(filtered);
      set(state => ({ summaries: { ...state.summaries, ...data } }));
    } catch {
      // Refresh failures are non-critical — cached values remain visible.
    } finally {
      const after = new Set(get().inFlight);
      for (const r of filtered) after.delete(r.id);
      set({ inFlight: after });
    }
  },
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

export function enqueueRepoRefresh(repo: { id: string; path: string }, opts?: { force?: boolean }) {
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

export function markRepoVisible(repo: { id: string; path: string }) {
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
