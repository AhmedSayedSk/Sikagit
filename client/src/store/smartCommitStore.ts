import { create } from 'zustand';

/**
 * Tracks which repositories currently have an in-flight background Smart Commit.
 * Keyed by repo path so the Smart Commit button reflects only its own repo and
 * multiple repos can run in parallel. Progress for the bottom status bar is
 * handled separately via the activity store (withActivity).
 */
interface SmartCommitState {
  running: Set<string>;
  isRunning: (repoPath: string) => boolean;
  start: (repoPath: string) => void;
  finish: (repoPath: string) => void;
}

export const useSmartCommitStore = create<SmartCommitState>()((set, get) => ({
  running: new Set<string>(),
  isRunning: (repoPath) => get().running.has(repoPath),
  start: (repoPath) =>
    set((s) => {
      if (s.running.has(repoPath)) return s;
      const running = new Set(s.running);
      running.add(repoPath);
      return { running };
    }),
  finish: (repoPath) =>
    set((s) => {
      if (!s.running.has(repoPath)) return s;
      const running = new Set(s.running);
      running.delete(repoPath);
      return { running };
    }),
}));
