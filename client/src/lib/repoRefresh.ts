import { useRepoStore } from '../store/repoStore';
import { useLogStore } from '../store/logStore';
import { useStatusStore } from '../store/statusStore';
import { useRepoStatusStore } from '../store/repoStatusStore';

/**
 * Single entry point for (re)loading the OPEN repo's local state — commit graph,
 * branches/tags and working-tree status — straight from the server, which runs
 * git for every call (nothing is cached for the open repo, on either side).
 *
 * Triggers (`reason`):
 *   - 'open'     the active repo changed: sidebar click, deep link, browser
 *                refresh, back/forward — all of them flow through
 *                repoStore.activeRepoId, so MainContent's effect is the one caller
 *   - 'reopen'   the already-active repo was clicked again in the sidebar
 *   - 'visible'  the tab became visible again (document visibilitychange)
 *   - 'focus'    the window regained focus
 *   - 'manual'   any other explicit caller
 *
 * Dedupe: at most one in-flight load per repo path — concurrent triggers for the
 * same repo (e.g. the URL hook and the repo view on boot) share one promise, so
 * one open = one load. Passive triggers (visible/focus) are also rate-limited to
 * once per PASSIVE_MIN_INTERVAL_MS per repo so alt-tabbing can't stampede git.
 *
 * Nothing here contacts a remote: `git fetch` stays behind the Fetch button and
 * the opt-in auto-fetch in MainContent (which now waits for this load first).
 */
export type RefreshReason = 'open' | 'reopen' | 'visible' | 'focus' | 'manual';

const PASSIVE_MIN_INTERVAL_MS = 2000;

const inFlight = new Map<string, Promise<void>>();
const lastStartedAt = new Map<string, number>();

export function refreshRepo(repoPath: string, reason: RefreshReason): Promise<void> {
  const existing = inFlight.get(repoPath);
  if (existing) return existing;

  const passive = reason === 'visible' || reason === 'focus';
  if (passive) {
    const last = lastStartedAt.get(repoPath) ?? 0;
    if (Date.now() - last < PASSIVE_MIN_INTERVAL_MS) return Promise.resolve();
  }

  lastStartedAt.set(repoPath, Date.now());
  const run: Promise<void> = Promise.all([
    useLogStore.getState().fetchLog(repoPath),
    useStatusStore.getState().fetchAll(repoPath),
  ])
    .then(() => { syncLastCommitFromLog(repoPath); })
    .finally(() => { if (inFlight.get(repoPath) === run) inFlight.delete(repoPath); });
  inFlight.set(repoPath, run);
  return run;
}

/** Reload whatever repo is currently open (no-op when none is). */
export function refreshOpenRepo(reason: RefreshReason): Promise<void> {
  const repo = useRepoStore.getState().activeRepo();
  return repo ? refreshRepo(repo.path, reason) : Promise.resolve();
}

/** Resolves once no load is in flight for this repo (immediately when idle). */
export function whenRepoIdle(repoPath: string): Promise<void> {
  return inFlight.get(repoPath) ?? Promise.resolve();
}

// After a fresh log, move the sidebar's "last commit" chip forward from HEAD when
// it is newer, so a commit made outside SikaGit shows in the sidebar on the same
// refresh without a separate status-summary round-trip. Never moves it backwards.
function syncLastCommitFromLog(repoPath: string) {
  const { commits, loadedRepo } = useLogStore.getState();
  if (loadedRepo !== repoPath) return;
  const head = commits.find(c => c.isHead);
  if (!head?.authorDate) return;
  const repo = useRepoStore.getState().repos.find(r => r.path === repoPath);
  if (!repo) return;
  const at = new Date(head.authorDate).toISOString();
  useRepoStatusStore.setState(state => {
    const cur = state.summaries[repo.id];
    if (!cur || (cur.lastCommitAt && cur.lastCommitAt >= at)) return state;
    return { summaries: { ...state.summaries, [repo.id]: { ...cur, lastCommitAt: at } } };
  });
}

/**
 * Reload the open repo whenever the tab becomes visible or the window regains
 * focus (both fire when switching back from a terminal where commits were made).
 * Mount once, in AppShell. Returns the teardown.
 */
export function installOpenRepoRefreshListeners(): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void refreshOpenRepo('visible');
  };
  const onFocus = () => { void refreshOpenRepo('focus'); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
  };
}
