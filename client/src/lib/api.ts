import type { ApiResponse } from '@sikagit/shared';

const BASE_URL = '/api/v1';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const json: ApiResponse<T> = await res.json();

  if (!json.success) {
    throw new Error(json.error || 'Request failed');
  }

  return json.data as T;
}

export const api = {
  // Repos
  getRepos: () => request<import('@sikagit/shared').RepoBookmark[]>('/repos'),
  addRepo: (path: string) => request<import('@sikagit/shared').RepoBookmark>('/repos', {
    method: 'POST',
    body: JSON.stringify({ path }),
  }),
  deleteRepo: (id: string) => request<void>(`/repos/${id}`, { method: 'DELETE' }),
  updateRepo: (id: string, data: { name?: string; group?: string; avatar?: string; path?: string }) =>
    request<import('@sikagit/shared').RepoBookmark>(`/repos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  openRepo: (id: string) => request<import('@sikagit/shared').RepoBookmark>(`/repos/${id}/open`, { method: 'PATCH' }),

  // Projects
  getProjects: () => request<import('@sikagit/shared').Project[]>('/projects'),
  createProject: (name: string, repoIds: string[], avatar?: string) =>
    request<import('@sikagit/shared').Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, avatar, repoIds }),
    }),
  updateProject: (id: string, data: { name?: string; avatar?: string; repoIds?: string[] }) =>
    request<import('@sikagit/shared').Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  reorderProjects: (ids: string[]) =>
    request<import('@sikagit/shared').Project[]>('/projects/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  // Git
  getStatus: (repo: string) => request<import('@sikagit/shared').GitStatus>(`/git/status?repo=${encodeURIComponent(repo)}`),
  getStatusSummary: (repos: { id: string; path: string }[]) =>
    request<Record<string, { ahead: number; behind: number; hasChanges: boolean; hasRemote: boolean }>>('/git/status-summary', {
      method: 'POST',
      body: JSON.stringify({ repos }),
    }),
  getLog: (repo: string, limit = 200, skip = 0) =>
    request<import('@sikagit/shared').GitCommit[]>(`/git/log?repo=${encodeURIComponent(repo)}&limit=${limit}&skip=${skip}`),
  getGraph: (repo: string, limit = 200, skip = 0) =>
    request<{ commits: import('@sikagit/shared').GraphCommit[]; totalLanes: number }>(
      `/git/graph?repo=${encodeURIComponent(repo)}&limit=${limit}&skip=${skip}`
    ),
  getBranches: (repo: string) => request<import('@sikagit/shared').GitBranch[]>(`/git/branches?repo=${encodeURIComponent(repo)}`),
  mergeBranch: (repo: string, sourceBranch: string) =>
    request<{ message: string; merged: boolean; conflicts?: string[] }>('/git/merge', {
      method: 'POST',
      body: JSON.stringify({ repo, sourceBranch }),
    }),
  mergeAbort: (repo: string) =>
    request<void>('/git/merge/abort', {
      method: 'POST',
      body: JSON.stringify({ repo }),
    }),
  deleteBranch: (repo: string, branch: string, force?: boolean) =>
    request<void>('/git/branch/delete', {
      method: 'POST',
      body: JSON.stringify({ repo, branch, force }),
    }),
  getTags: (repo: string) => request<import('@sikagit/shared').GitTag[]>(`/git/tags?repo=${encodeURIComponent(repo)}`),
  getCommitFiles: (repo: string, commit: string) =>
    request<{ path: string; status: string }[]>(`/git/commit-files?repo=${encodeURIComponent(repo)}&commit=${encodeURIComponent(commit)}`),
  getDiff: (repo: string, commit?: string, file?: string) => {
    const params = new URLSearchParams({ repo });
    if (commit) params.set('commit', commit);
    if (file) params.set('file', file);
    return request<string>(`/git/diff?${params}`);
  },
  getStagedDiff: (repo: string, file?: string) => {
    const params = new URLSearchParams({ repo });
    if (file) params.set('file', file);
    return request<string>(`/git/diff/staged?${params}`);
  },

  // Hunk operations
  stageHunk: (repo: string, patch: string) => request<void>('/git/stage-hunk', {
    method: 'POST',
    body: JSON.stringify({ repo, patch }),
  }),
  discardHunk: (repo: string, patch: string) => request<void>('/git/discard-hunk', {
    method: 'POST',
    body: JSON.stringify({ repo, patch }),
  }),

  // Operations
  removeLock: (repo: string) => request<{ removed: boolean }>(`/git/lock?repo=${encodeURIComponent(repo)}`, {
    method: 'DELETE',
  }),
  stageFiles: (repo: string, files: string[]) => request<void>('/git/stage', {
    method: 'POST',
    body: JSON.stringify({ repo, files }),
  }),
  unstageFiles: (repo: string, files: string[]) => request<void>('/git/unstage', {
    method: 'POST',
    body: JSON.stringify({ repo, files }),
  }),
  commit: (repo: string, message: string, amend = false) => request<{ hash: string }>('/git/commit', {
    method: 'POST',
    body: JSON.stringify({ repo, message, amend }),
  }),
  uncommit: (repo: string, hash: string) => request<void>('/git/uncommit', {
    method: 'POST',
    body: JSON.stringify({ repo, hash }),
  }),
  checkout: (repo: string, hash: string) => request<{ branch: string }>('/git/checkout', {
    method: 'POST',
    body: JSON.stringify({ repo, hash }),
  }),
  discardChanges: (repo: string, files: string[]) => request<void>('/git/discard', {
    method: 'POST',
    body: JSON.stringify({ repo, files }),
  }),
  deleteUntrackedFiles: (repo: string, files: string[]) => request<void>('/git/delete-untracked', {
    method: 'POST',
    body: JSON.stringify({ repo, files }),
  }),
  saveForLater: (repo: string, files: string[], branchName: string, message: string) =>
    request<{ branch: string; commitHash: string }>('/git/save-for-later', {
      method: 'POST',
      body: JSON.stringify({ repo, files, branchName, message }),
    }),

  // Git config
  getGitConfig: (repo: string) => request<import('@sikagit/shared').RepoConfig>(`/git/config?repo=${encodeURIComponent(repo)}`),
  setGitConfig: (repo: string, key: string, value: string) => request<void>('/git/config', {
    method: 'POST',
    body: JSON.stringify({ repo, key, value }),
  }),
  setRemoteUrl: (repo: string, url: string) => request<void>('/git/remote-url', {
    method: 'POST',
    body: JSON.stringify({ repo, url }),
  }),
  testRemote: (repo: string, url?: string) => request<{ ok: boolean; error?: string }>('/git/test-remote', {
    method: 'POST',
    body: JSON.stringify({ repo, url }),
  }),
  gitFetch: (repo: string) => request<void>('/git/fetch', {
    method: 'POST',
    body: JSON.stringify({ repo }),
  }),
  gitPull: (repo: string, strategy?: 'merge' | 'rebase', allowUnrelatedHistories?: boolean) => request<{ message: string }>('/git/pull', {
    method: 'POST',
    body: JSON.stringify({ repo, strategy, allowUnrelatedHistories }),
  }),
  gitPush: (repo: string, setUpstream?: boolean, upToCommit?: string, force?: boolean) => request<{ message: string }>('/git/push', {
    method: 'POST',
    body: JSON.stringify({ repo, setUpstream, upToCommit, force }),
  }),

  // AI
  aiSuggest: (repo: string, apiKey: string, model: string) =>
    request<{ title: string; description: string }>('/ai/suggest', {
      method: 'POST',
      body: JSON.stringify({ repo, apiKey, model }),
    }),
  aiSuggestSaveForLater: (repo: string, apiKey: string, model: string, files: string[]) =>
    request<{ branchName: string; message: string }>('/ai/suggest-save-for-later', {
      method: 'POST',
      body: JSON.stringify({ repo, apiKey, model, files }),
    }),
  aiSmartCommitPreview: (repo: string, apiKey: string, model: string) =>
    request<{ groups: { files: string[]; title: string; description: string }[] }>('/ai/smart-commit/preview', {
      method: 'POST',
      body: JSON.stringify({ repo, apiKey, model }),
    }),
  aiSmartCommitExecute: (repo: string, groups: { files: string[]; title: string; description: string }[]) =>
    request<{ commits: { hash: string; message: string }[] }>('/ai/smart-commit/execute', {
      method: 'POST',
      body: JSON.stringify({ repo, groups }),
    }),

  // Browse — resolve a folder name + file fingerprint to an absolute server path
  resolveFolder: (folderName: string, files: string[]) =>
    request<{ path: string; allMatches: string[] }>('/browse/resolve', {
      method: 'POST',
      body: JSON.stringify({ folderName, files }),
    }),
};
