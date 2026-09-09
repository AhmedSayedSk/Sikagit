import { useEffect, useState } from 'react';
import { useRepoStore } from '../store/repoStore';
import { useProjectStore } from '../store/projectStore';

/**
 * The browser URL is the single source of truth for which project/repo is open.
 * Only ids appear in it, never filesystem paths:
 *
 *   /                          nothing open
 *   /p/:projectId              project expanded, no active repo
 *   /r/:repoId                 repo active (not shown under a project)
 *   /p/:projectId/r/:repoId    repo active inside an expanded project
 *
 * Both Vite (appType 'spa') and the production Express server fall back to
 * index.html for unknown paths, so these deep links load directly.
 */
export interface Selection {
  projectId: string | null;
  repoId: string | null;
}

const PATH_RE = /^\/(?:p\/([^/]+))?(?:\/?r\/([^/]+))?\/?$/;

/** Read the selection out of the URL. Anything unrecognised means "nothing open". */
export function parseSelection(pathname: string = window.location.pathname): Selection {
  const m = PATH_RE.exec(pathname);
  return {
    projectId: m?.[1] ? decodeURIComponent(m[1]) : null,
    repoId: m?.[2] ? decodeURIComponent(m[2]) : null,
  };
}

export function formatSelection({ projectId, repoId }: Selection): string {
  let path = '';
  if (projectId) path += `/p/${encodeURIComponent(projectId)}`;
  if (repoId) path += `/r/${encodeURIComponent(repoId)}`;
  return path || '/';
}

/** Write the selection to the URL. No-op when it already matches (prevents echo pushes). */
function writeSelection(sel: Selection, mode: 'push' | 'replace') {
  const path = formatSelection(sel);
  if (path === window.location.pathname) return;
  const url = path + window.location.search + window.location.hash;
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

/**
 * Push a URL selection into the stores. `touch` marks the repo as opened on the
 * server (lastOpened) — true for user navigation (back/forward), false for the
 * initial page load, mirroring the old persisted-restore behaviour.
 */
function applySelection({ projectId, repoId }: Selection, touch: boolean) {
  useProjectStore.getState().setActiveProject(projectId);
  if (touch && repoId) useRepoStore.getState().setActiveRepo(repoId);
  else useRepoStore.setState({ activeRepoId: repoId });
}

/**
 * Keeps the URL and the active project/repo in sync, both directions.
 * Mount once, in AppShell. Also owns the initial repos/projects fetch because
 * URL ids can only be validated once the lists are in.
 */
export function useUrlSelection() {
  const fetchRepos = useRepoStore(s => s.fetchRepos);
  const fetchProjects = useProjectStore(s => s.fetchProjects);
  const activeRepoId = useRepoStore(s => s.activeRepoId);
  const activeProjectId = useProjectStore(s => s.activeProjectId);
  // Until the initial URL is resolved, store changes must not be pushed to history.
  const [ready, setReady] = useState(false);

  // Boot: the URL wins over the persisted last-opened repo. With no selection in
  // the URL, fall back to the persisted repo and reflect it in the URL (replace).
  useEffect(() => {
    let cancelled = false;
    const fromUrl = parseSelection();
    if (fromUrl.projectId || fromUrl.repoId) applySelection(fromUrl, false);

    Promise.all([
      fetchRepos(),
      fetchProjects().then(() => true, () => false),
    ]).then(([, projectsOk]) => {
      if (cancelled) return;
      const reposOk = !useRepoStore.getState().error;
      const { repos } = useRepoStore.getState();
      const { projects } = useProjectStore.getState();
      let { activeRepoId: repoId } = useRepoStore.getState();
      let { activeProjectId: projectId } = useProjectStore.getState();

      // Drop ids that don't exist (only when the list actually loaded, so a
      // failed fetch doesn't wipe a valid deep link).
      if (reposOk && repoId && !repos.some(r => r.id === repoId)) repoId = null;
      if (projectsOk && projectId && !projects.some(p => p.id === projectId)) projectId = null;
      // Canonical form: a repo that belongs to a project is shown under it.
      if (projectsOk && repoId && !projectId) {
        projectId = projects.find(p => p.repoIds.includes(repoId!))?.id ?? null;
      }

      applySelection({ projectId, repoId }, false);
      writeSelection({ projectId, repoId }, 'replace');
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [fetchRepos, fetchProjects]);

  // Back/forward: re-read the URL and apply it (no push — the browser moved us).
  useEffect(() => {
    const onPopState = () => applySelection(parseSelection(), true);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Any selection change in the stores becomes a new history entry.
  useEffect(() => {
    if (!ready) return;
    writeSelection({ projectId: activeProjectId, repoId: activeRepoId }, 'push');
  }, [ready, activeProjectId, activeRepoId]);
}
