import { create } from 'zustand';
import type { GitStatus, GitBranch, GitTag, GitFileStatus } from '@sikagit/shared';
import { api } from '../lib/api';
import { useRepoStatusStore } from './repoStatusStore';
import { useRepoStore } from './repoStore';

// Keep the left sidebar's status dot (changes color + ahead/behind) in sync with
// the active repo's freshly-loaded status, so it updates right after any action
// instead of staying stale until the repo is reopened. Derived from the same
// GitStatus the panels already show — no extra git round-trip.
function syncSidebarFromStatus(repoPath: string, status: GitStatus) {
  const repo = useRepoStore.getState().repos.find(r => r.path === repoPath);
  if (!repo) return;
  useRepoStatusStore.getState().setSummary(repo.id, {
    ahead: status.ahead,
    behind: status.behind,
    hasChanges: status.files.length > 0,
    hasStaged: status.staged.length > 0,
    hasUnstaged: status.unstaged.length > 0 || status.untracked.length > 0,
    hasRemote: !!(status.tracking || status.remoteUrl),
    computedAt: new Date().toISOString(),
  });
}

type SelectedFileSource = 'staged' | 'unstaged';

interface StatusState {
  status: GitStatus | null;
  branches: GitBranch[];
  tags: GitTag[];
  loading: boolean;
  error: string | null;
  selectedFile: string | null;
  selectedFileSource: SelectedFileSource | null;
  checkedFiles: Set<string>;
  // Paths the user has optimistically moved to staged/unstaged but the server
  // may not have caught up to yet. Held until a fetchStatus response confirms
  // the new state (or the caller explicitly clears them on error).
  pendingStaged: Set<string>;
  pendingUnstaged: Set<string>;
  fetchStatus: (repo: string) => Promise<void>;
  fetchBranches: (repo: string) => Promise<void>;
  fetchTags: (repo: string) => Promise<void>;
  fetchAll: (repo: string) => Promise<void>;
  selectFile: (path: string | null, source?: SelectedFileSource) => void;
  toggleFileCheck: (path: string) => void;
  setCheckedFiles: (paths: string[]) => void;
  clearChecked: () => void;
  applyOptimisticStage: (paths: string[]) => void;
  applyOptimisticUnstage: (paths: string[]) => void;
  clearPendingForPaths: (paths: string[]) => void;
}

// Must match server's partition in gitService.getStatus — a file with both
// staged AND working-tree changes (e.g. index='M' & workingDir='M') belongs in
// BOTH staged and unstaged, so the panels stay in sync with the server view.
function repartition(files: GitFileStatus[]): Pick<GitStatus, 'staged' | 'unstaged' | 'untracked'> {
  return {
    staged: files.filter(f => f.isStaged),
    unstaged: files.filter(f => f.workingDir !== ' ' && f.workingDir !== '?' && f.workingDir !== '!'),
    untracked: files.filter(f => f.index === '?' && f.workingDir === '?'),
  };
}

function stageFileShape(f: GitFileStatus): GitFileStatus {
  // Untracked (??) → "A"dded. Otherwise the working-tree letter becomes the index letter.
  const indexLetter = f.index === '?' ? 'A' : (f.workingDir !== ' ' ? f.workingDir : f.index);
  return { ...f, isStaged: true, index: indexLetter, workingDir: ' ' };
}

function unstageFileShape(f: GitFileStatus): GitFileStatus {
  // Newly-added staged file → goes back to untracked. Otherwise working letter = prior index letter.
  if (f.index === 'A') return { ...f, isStaged: false, index: '?', workingDir: '?' };
  return { ...f, isStaged: false, workingDir: f.index, index: ' ' };
}

// Overlay pending optimistic state on a fresh server status, and prune any
// pending entries the server has already caught up with.
function reconcileWithPending(
  fetched: GitStatus,
  pendingStaged: Set<string>,
  pendingUnstaged: Set<string>
): { status: GitStatus; pendingStaged: Set<string>; pendingUnstaged: Set<string> } {
  const fileMap = new Map(fetched.files.map(f => [f.path, f]));
  const nextPendingStaged = new Set<string>();
  const nextPendingUnstaged = new Set<string>();

  for (const p of pendingStaged) {
    const f = fileMap.get(p);
    if (!f) continue;          // file vanished server-side — drop pending too
    // "Fully staged" requires both: file shows in the index AND has no further
    // working-tree changes. For an MM file (already in index, also dirty), the
    // server already reports isStaged=true pre-click — we must wait for the
    // working tree to be consolidated (workingDir === ' ') before trusting it.
    if (!f.isStaged || f.workingDir !== ' ') nextPendingStaged.add(p);
  }
  for (const p of pendingUnstaged) {
    const f = fileMap.get(p);
    if (!f) continue;
    if (f.isStaged) nextPendingUnstaged.add(p);
  }

  let mutated = false;
  const updatedFiles = fetched.files.map(f => {
    if (nextPendingStaged.has(f.path)) { mutated = true; return stageFileShape(f); }
    if (nextPendingUnstaged.has(f.path)) { mutated = true; return unstageFileShape(f); }
    return f;
  });

  if (!mutated) {
    return { status: fetched, pendingStaged: nextPendingStaged, pendingUnstaged: nextPendingUnstaged };
  }
  return {
    status: { ...fetched, files: updatedFiles, ...repartition(updatedFiles) },
    pendingStaged: nextPendingStaged,
    pendingUnstaged: nextPendingUnstaged,
  };
}

export const useStatusStore = create<StatusState>()((set) => ({
  status: null,
  branches: [],
  tags: [],
  loading: false,
  error: null,
  selectedFile: null,
  selectedFileSource: null,
  checkedFiles: new Set<string>(),
  pendingStaged: new Set<string>(),
  pendingUnstaged: new Set<string>(),

  fetchStatus: async (repo: string) => {
    try {
      const fetched = await api.getStatus(repo);
      set((state) => {
        const r = reconcileWithPending(fetched, state.pendingStaged, state.pendingUnstaged);
        return {
          status: r.status,
          pendingStaged: r.pendingStaged,
          pendingUnstaged: r.pendingUnstaged,
        };
      });
      syncSidebarFromStatus(repo, fetched);
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
      const [fetched, branches, tags] = await Promise.all([
        api.getStatus(repo),
        api.getBranches(repo),
        api.getTags(repo),
      ]);
      set((state) => {
        const r = reconcileWithPending(fetched, state.pendingStaged, state.pendingUnstaged);
        return {
          status: r.status,
          branches,
          tags,
          loading: false,
          pendingStaged: r.pendingStaged,
          pendingUnstaged: r.pendingUnstaged,
        };
      });
      syncSidebarFromStatus(repo, fetched);
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  selectFile: (path, source) => set({
    selectedFile: path,
    selectedFileSource: source ?? null,
  }),

  toggleFileCheck: (path) => set((state) => {
    const next = new Set(state.checkedFiles);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return { checkedFiles: next };
  }),

  setCheckedFiles: (paths) => set({ checkedFiles: new Set(paths) }),

  clearChecked: () => set({ checkedFiles: new Set<string>() }),

  applyOptimisticStage: (paths) => set((state) => {
    if (!state.status) return state;
    const pathSet = new Set(paths);
    const updatedFiles = state.status.files.map(f => pathSet.has(f.path) ? stageFileShape(f) : f);
    const nextPendingStaged = new Set(state.pendingStaged);
    const nextPendingUnstaged = new Set(state.pendingUnstaged);
    for (const p of paths) {
      nextPendingStaged.add(p);
      nextPendingUnstaged.delete(p);
    }
    return {
      status: { ...state.status, files: updatedFiles, ...repartition(updatedFiles) },
      pendingStaged: nextPendingStaged,
      pendingUnstaged: nextPendingUnstaged,
    };
  }),

  applyOptimisticUnstage: (paths) => set((state) => {
    if (!state.status) return state;
    const pathSet = new Set(paths);
    const updatedFiles = state.status.files.map(f => pathSet.has(f.path) ? unstageFileShape(f) : f);
    const nextPendingStaged = new Set(state.pendingStaged);
    const nextPendingUnstaged = new Set(state.pendingUnstaged);
    for (const p of paths) {
      nextPendingUnstaged.add(p);
      nextPendingStaged.delete(p);
    }
    return {
      status: { ...state.status, files: updatedFiles, ...repartition(updatedFiles) },
      pendingStaged: nextPendingStaged,
      pendingUnstaged: nextPendingUnstaged,
    };
  }),

  clearPendingForPaths: (paths) => set((state) => {
    const nextPendingStaged = new Set(state.pendingStaged);
    const nextPendingUnstaged = new Set(state.pendingUnstaged);
    for (const p of paths) {
      nextPendingStaged.delete(p);
      nextPendingUnstaged.delete(p);
    }
    return { pendingStaged: nextPendingStaged, pendingUnstaged: nextPendingUnstaged };
  }),
}));
