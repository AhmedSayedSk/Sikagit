import { create } from 'zustand';
import type { GraphCommit } from '@sikagit/shared';
import { api } from '../lib/api';

interface LogState {
  commits: GraphCommit[];
  totalLanes: number;
  loading: boolean;
  error: string | null;
  selectedCommit: string | null;
  hasMore: boolean;
  fetchLog: (repo: string, reset?: boolean) => Promise<void>;
  loadMore: (repo: string) => Promise<void>;
  selectCommit: (hash: string | null) => void;
}

export const useLogStore = create<LogState>()((set, get) => ({
  commits: [],
  totalLanes: 0,
  loading: false,
  error: null,
  selectedCommit: null,
  hasMore: true,

  fetchLog: async (repo: string, reset = true) => {
    set({ loading: true, error: null });
    if (reset) set({ commits: [], hasMore: true, totalLanes: 0 });
    try {
      const graph = await api.getGraph(repo, 200, 0);
      set({
        commits: graph.commits,
        totalLanes: graph.totalLanes,
        loading: false,
        hasMore: graph.commits.length === 200,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  loadMore: async (repo: string) => {
    const { commits, loading, hasMore } = get();
    if (loading || !hasMore) return;
    set({ loading: true });
    try {
      const graph = await api.getGraph(repo, 200, commits.length);
      set(state => ({
        commits: [...state.commits, ...graph.commits],
        totalLanes: Math.max(state.totalLanes, graph.totalLanes),
        loading: false,
        hasMore: graph.commits.length === 200,
      }));
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  selectCommit: (hash: string | null) => set({ selectedCommit: hash }),
}));
