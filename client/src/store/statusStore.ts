import { create } from 'zustand';
import type { GitStatus, GitBranch, GitTag } from '@sikagit/shared';
import { api } from '../lib/api';

type SelectedFileSource = 'staged' | 'unstaged';

interface StatusState {
  status: GitStatus | null;
  branches: GitBranch[];
  tags: GitTag[];
  loading: boolean;
  error: string | null;
  selectedFile: string | null;
  selectedFileSource: SelectedFileSource | null;
  fetchStatus: (repo: string) => Promise<void>;
  fetchBranches: (repo: string) => Promise<void>;
  fetchTags: (repo: string) => Promise<void>;
  fetchAll: (repo: string) => Promise<void>;
  selectFile: (path: string | null, source?: SelectedFileSource) => void;
}

export const useStatusStore = create<StatusState>()((set) => ({
  status: null,
  branches: [],
  tags: [],
  loading: false,
  error: null,
  selectedFile: null,
  selectedFileSource: null,

  fetchStatus: async (repo: string) => {
    try {
      const status = await api.getStatus(repo);
      set({ status });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchBranches: async (repo: string) => {
    try {
      const branches = await api.getBranches(repo);
      set({ branches });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchTags: async (repo: string) => {
    try {
      const tags = await api.getTags(repo);
      set({ tags });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  fetchAll: async (repo: string) => {
    set({ loading: true, error: null });
    try {
      const [status, branches, tags] = await Promise.all([
        api.getStatus(repo),
        api.getBranches(repo),
        api.getTags(repo),
      ]);
      set({ status, branches, tags, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  selectFile: (path, source) => set({
    selectedFile: path,
    selectedFileSource: source ?? null,
  }),
}));
