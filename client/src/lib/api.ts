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
  updateRepo: (id: string, data: { name?: string; group?: string; avatar?: string }) =>
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

  // Git
  getStatus: (repo: string) => request<import('@sikagit/shared').GitStatus>(`/git/status?repo=${encodeURIComponent(repo)}`),
  getLog: (repo: string, limit = 200, skip = 0) =>
    request<import('@sikagit/shared').GitCommit[]>(`/git/log?repo=${encodeURIComponent(repo)}&limit=${limit}&skip=${skip}`),
  getGraph: (repo: string, limit = 200, skip = 0) =>
    request<{ commits: import('@sikagit/shared').GraphCommit[]; totalLanes: number }>(
      `/git/graph?repo=${encodeURIComponent(repo)}&limit=${limit}&skip=${skip}`
    ),
  getBranches: (repo: string) => request<import('@sikagit/shared').GitBranch[]>(`/git/branches?repo=${encodeURIComponent(repo)}`),
  getTags: (repo: string) => request<import('@sikagit/shared').GitTag[]>(`/git/tags?repo=${encodeURIComponent(repo)}`),
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
  discardChanges: (repo: string, files: string[]) => request<void>('/git/discard', {
    method: 'POST',
    body: JSON.stringify({ repo, files }),
  }),
  deleteUntrackedFiles: (repo: string, files: string[]) => request<void>('/git/delete-untracked', {
    method: 'POST',
    body: JSON.stringify({ repo, files }),
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
  gitPull: (repo: string, strategy?: 'merge' | 'rebase') => request<{ message: string }>('/git/pull', {
    method: 'POST',
    body: JSON.stringify({ repo, strategy }),
  }),
  gitPush: (repo: string, setUpstream?: boolean, upToCommit?: string) => request<{ message: string }>('/git/push', {
    method: 'POST',
    body: JSON.stringify({ repo, setUpstream, upToCommit }),
  }),

  // AI
  aiSuggest: (repo: string, apiKey: string, model: string) =>
    request<{ title: string; description: string }>('/ai/suggest', {
      method: 'POST',
      body: JSON.stringify({ repo, apiKey, model }),
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
