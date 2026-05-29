// Per-repo cooldown for the "auto background-fetch on open" feature.
//
// Tracks the last time we auto-fetched each repo so opening the same repo
// repeatedly (e.g. clicking back and forth in the sidebar) doesn't hammer the
// network. State is intentionally in-memory and session-scoped: a full page
// reload clears it, which is the desired behaviour — a fresh session should
// re-check remotes on first open.

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

const lastFetchedAt = new Map<string, number>();

/** True if this repo has never been auto-fetched this session, or the last
 *  auto-fetch was longer ago than the cooldown window. */
export function shouldAutoFetch(repoId: string, cooldownMs: number = COOLDOWN_MS): boolean {
  const last = lastFetchedAt.get(repoId);
  if (last === undefined) return true;
  return Date.now() - last >= cooldownMs;
}

/** Record that we just auto-fetched this repo, starting its cooldown window.
 *  Only call on a *successful* fetch so failures retry on the next open. */
export function markAutoFetched(repoId: string): void {
  lastFetchedAt.set(repoId, Date.now());
}
