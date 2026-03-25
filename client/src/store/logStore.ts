import { create } from 'zustand';
import type { GraphCommit } from '@sikagit/shared';
import { api } from '../lib/api';

export interface CommitFile {
  path: string;
  status: string;
}

interface LogState {
  commits: GraphCommit[];
  totalLanes: number;
  loading: boolean;
  error: string | null;
  selectedCommit: string | null;
  commitFiles: CommitFile[];
  commitFilesLoading: boolean;
  selectedCommitFile: string | null;
  hasMore: boolean;
  fetchLog: (repo: string, reset?: boolean) => Promise<void>;
  loadMore: (repo: string) => Promise<void>;
  selectCommit: (hash: string | null) => void;
  fetchCommitFiles: (repo: string, commit: string) => Promise<void>;
  selectCommitFile: (path: string | null) => void;
}

export const useLogStore = create<LogState>()((set, get) => ({
  commits: [],
  totalLanes: 0,
  loading: false,
  error: null,
  selectedCommit: null,
  commitFiles: [],
  commitFilesLoading: false,
  selectedCommitFile: null,
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

  selectCommit: (hash: string | null) => set({
    selectedCommit: hash,
    commitFiles: [],
    selectedCommitFile: null,
  }),

  fetchCommitFiles: async (repo: string, commit: string) => {
    set({ commitFilesLoading: true });
    try {
      const files = await api.getCommitFiles(repo, commit);
      set({ commitFiles: files, commitFilesLoading: false });
    } catch {
      set({ commitFiles: [], commitFilesLoading: false });
    }
  },

  selectCommitFile: (path: string | null) => set({ selectedCommitFile: path }),
}));
