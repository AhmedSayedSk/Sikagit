import { create } from 'zustand';
import { api } from '../lib/api';

interface RepoStatusSummary {
  ahead: number;
  behind: number;
  hasChanges: boolean;
  hasRemote: boolean;
}

interface RepoStatusState {
  summaries: Record<string, RepoStatusSummary>;
  fetchAll: (repos: { id: string; path: string }[]) => Promise<void>;
}

export const useRepoStatusStore = create<RepoStatusState>()((set) => ({
  summaries: {},
  fetchAll: async (repos) => {
    if (repos.length === 0) return;
    try {
      const data = await api.getStatusSummary(repos);
      set({ summaries: data });
    } catch {
      // Silently fail — sidebar indicators are non-critical
    }
  },
}));
