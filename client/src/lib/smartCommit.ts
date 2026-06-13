import { api } from './api';

export interface SmartCommitGroup {
  files: string[];
  title: string;
  description: string;
}

/**
 * Result of a smart-commit run. Pure data — callers decide how to surface it
 * (inline error in the dialog, toasts in the background path).
 */
export interface SmartCommitOutcome {
  /** Whether the commits were created. */
  ok: boolean;
  /** Number of commits created. */
  commitCount: number;
  /** Push was requested AND succeeded. */
  pushed: boolean;
  /** Push was requested but failed (commits still exist locally). */
  pushError?: string;
  /** Execute failed — nothing was committed. */
  error?: string;
  /** Preview/analysis failed or produced no groups (background path only). */
  previewError?: string;
}

/**
 * Execute a set of pre-grouped commits, optionally pushing afterwards.
 * Shared by the Smart Commit dialog (user-edited groups) and the background
 * path (freshly previewed groups). No UI side effects.
 */
export async function executeSmartCommit(
  repoPath: string,
  groups: SmartCommitGroup[],
  opts: { push: boolean; setUpstream: boolean },
): Promise<SmartCommitOutcome> {
  let commitCount = 0;
  try {
    const res = await api.aiSmartCommitExecute(repoPath, groups);
    commitCount = res.commits?.length ?? 0;
  } catch (err: any) {
    return { ok: false, commitCount: 0, pushed: false, error: err?.message || 'Smart commit failed' };
  }

  if (!opts.push) {
    return { ok: true, commitCount, pushed: false };
  }

  try {
    await api.gitPush(repoPath, opts.setUpstream);
    return { ok: true, commitCount, pushed: true };
  } catch (err: any) {
    return { ok: true, commitCount, pushed: false, pushError: err?.message || 'Commits created but push failed' };
  }
}

/**
 * Run Smart Commit fully in the background: analyze (preview) to group the
 * staged changes, then execute (and optionally push) without any dialog.
 */
export async function runBackgroundSmartCommit(
  repoPath: string,
  opts: { apiKey: string; model: string; push: boolean; setUpstream: boolean },
): Promise<SmartCommitOutcome> {
  let groups: SmartCommitGroup[];
  try {
    const preview = await api.aiSmartCommitPreview(repoPath, opts.apiKey, opts.model);
    groups = preview.groups;
  } catch (err: any) {
    return { ok: false, commitCount: 0, pushed: false, previewError: err?.message || 'Failed to analyze changes' };
  }

  if (!groups || groups.length === 0) {
    return { ok: false, commitCount: 0, pushed: false, previewError: 'No changes to commit' };
  }

  return executeSmartCommit(repoPath, groups, { push: opts.push, setUpstream: opts.setUpstream });
}

/** Human-readable summary of a successful run, e.g. "Created 3 commits and pushed". */
export function describeSmartCommitSuccess(outcome: SmartCommitOutcome): string {
  const plural = outcome.commitCount !== 1 ? 's' : '';
  return `Created ${outcome.commitCount} commit${plural}${outcome.pushed ? ' and pushed' : ''}`;
}
