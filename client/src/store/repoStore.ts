import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RepoBookmark } from '@sikagit/shared';
import { api } from '../lib/api';

interface RepoState {
  repos: RepoBookmark[];
  activeRepoId: string | null;
  loading: boolean;
  error: string | null;
  activeRepo: () => RepoBookmark | undefined;
  fetchRepos: () => Promise<void>;
  addRepo: (path: string) => Promise<void>;
  removeRepo: (id: string) => Promise<void>;
  updateRepo: (id: string, data: { name?: string; group?: string; avatar?: string }) => Promise<void>;
  setActiveRepo: (id: string) => void;
}

export const useRepoStore = create<RepoState>()(
  persist(
    (set, get) => ({
      repos: [],
      activeRepoId: null,
      loading: false,
      error: null,

      activeRepo: () => {
        const { repos, activeRepoId } = get();
        return repos.find(r => r.id === activeRepoId);
      },

      fetchRepos: async () => {
        set({ loading: true, error: null });
        try {
          const repos = await api.getRepos();
          set({ repos, loading: false });
        } catch (err: any) {
          set({ error: err.message, loading: false });
        }
      },

      addRepo: async (path: string) => {
        set({ loading: true, error: null });
        try {
          const repo = await api.addRepo(path);
          set(state => ({
            repos: [...state.repos, repo],
            activeRepoId: repo.id,
            loading: false,
          }));
        } catch (err: any) {
          set({ error: err.message, loading: false });
          throw err;
        }
      },

      updateRepo: async (id: string, data: { name?: string; group?: string; avatar?: string }) => {
        try {
          const updated = await api.updateRepo(id, data);
          set(state => ({
            repos: state.repos.map(r => r.id === id ? updated : r),
          }));
        } catch (err: any) {
          set({ error: err.message });
          throw err;
        }
      },

      removeRepo: async (id: string) => {
        try {
          await api.deleteRepo(id);
          set(state => ({
            repos: state.repos.filter(r => r.id !== id),
            activeRepoId: state.activeRepoId === id ? null : state.activeRepoId,
          }));
        } catch (err: any) {
          set({ error: err.message });
        }
      },

      setActiveRepo: (id: string) => {
        set({ activeRepoId: id });
        api.openRepo(id).catch(() => {});
      },
    }),
    {
      name: 'sikagit-repos',
      partialize: (state) => ({ activeRepoId: state.activeRepoId }),
    }
  )
);
