import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { X, Copy, Check, GitCommitHorizontal, GitMerge, User, Calendar, GitFork, Undo2, Loader2, Upload, RotateCcw } from 'lucide-react';
import { MergeDialog } from '../operations/MergeDialog';
import { useLogStore } from '../../store/logStore';
import { useStatusStore } from '../../store/statusStore';
import { useToastStore } from '../../store/toastStore';
import { useConfirmStore } from '../../store/confirmStore';
import { api } from '../../lib/api';
import { truncateHash } from '../../lib/utils';
import { DiffView } from '../diff/DiffView';

interface CommitDetailProps {
  repoPath: string;
}

export function CommitDetail({ repoPath }: CommitDetailProps) {
  const { commits, selectedCommit, selectCommit, fetchLog, selectedCommitFile } = useLogStore();
  const fetchStatus = useStatusStore(s => s.fetchStatus);
  const addToast = useToastStore(s => s.addToast);
  const confirm = useConfirmStore(s => s.confirm);
  const isUncommitted = selectedCommit === '__uncommitted__';
  const commit = isUncommitted ? null : commits.find(c => c.hash === selectedCommit);
  const [diff, setDiff] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [uncommitting, setUncommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const status = useStatusStore(s => s.status);
  const [scrollY, setScrollY] = useState(0);
  const measureRef = useRef<HTMLDivElement>(null);
  const diffWrapRef = useRef<HTMLDivElement>(null);
  const [collapseHeight, setCollapseHeight] = useState<number | null>(null);

  // Fetch diff for uncommitted changes (staged + unstaged combined)
  useEffect(() => {
    if (isUncommitted) {
      Promise.all([
        api.getStagedDiff(repoPath).catch(() => ''),
        api.getDiff(repoPath).catch(() => ''),
      ]).then(([staged, unstaged]) => {
        setDiff([staged, unstaged].filter(Boolean).join('\n'));
      });
      setScrollY(0);
      return;
    }
    if (commit) {
      api.getDiff(repoPath, commit.hash, selectedCommitFile || undefined).then(setDiff).catch(() => setDiff(''));
      setScrollY(0);
    }
  }, [isUncommitted, commit?.hash, repoPath, selectedCommitFile]);

  // Measure natural height of description+metadata via inner wrapper.
  // Stays at auto height regardless of outer's controlled height.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const measure = () => {
      if (measureRef.current) setCollapseHeight(measureRef.current.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [commit?.hash]);

  // Track diff scroll to drive the collapse
  useEffect(() => {
    const wrapper = diffWrapRef.current;
    if (!wrapper) return;
    let scrollEl: HTMLElement | null = null;
    const onScroll = () => { if (scrollEl) setScrollY(scrollEl.scrollTop); };
    const attach = () => {
      scrollEl = wrapper.querySelector('[class*="overflow-auto"]') as HTMLElement | null;
      if (scrollEl) scrollEl.addEventListener('scroll', onScroll, { passive: true });
    };
    attach();
    const observer = new MutationObserver(() => {
      if (scrollEl) scrollEl.removeEventListener('scroll', onScroll);
      attach();
    });
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => {
      if (scrollEl) scrollEl.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [diff]);

  if (!commit && !isUncommitted) return null;

  // Render simplified view for uncommitted changes
  if (isUncommitted) {
    const stagedCount = status?.staged.length || 0;
    const unstagedCount = (status?.unstaged.length || 0) + (status?.untracked.length || 0);
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-shrink-0 border-b border-border bg-bg-secondary">
          <div className="flex items-center justify-between px-3.5 py-1.5 gap-3">
            <div className="min-w-0 flex-1 flex items-center gap-2">
              <GitCommitHorizontal size={13} className="text-warning flex-shrink-0" />
              <p className="text-xs font-semibold text-warning leading-snug">Uncommitted changes</p>
              <span className="text-[0.65rem] text-text-muted">
                {stagedCount} staged, {unstagedCount} unstaged
              </span>
            </div>
            <button
              onClick={() => selectCommit(null)}
              className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {diff ? (
            <DiffView diff={diff} repoPath={repoPath} />
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted text-sm">
              Loading diff...
            </div>
          )}
        </div>
      </div>
    );
  }

  const copyHash = () => {
    navigator.clipboard.writeText(commit.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHead = commits.length > 0 && commits[0].hash === commit.hash;
  const commitIndex = commits.findIndex(c => c.hash === commit.hash);

  // Find unpushed commits: everything above the first commit that has a remote branch (origin/*)
  const remoteIndex = commits.findIndex(c => c.branches.some(b => b.includes('/')));
  const hasRemote = !!(status?.tracking || status?.remoteUrl);
  // If remote exists: commits before the remote branch marker are unpushed
  // If no remote branch found in list but remote is configured, all commits are pushable
  const isUnpushed = hasRemote && commitIndex >= 0 && (
    remoteIndex === -1 || commitIndex < remoteIndex
  );

  const handlePushToHere = async () => {
    const count = commitIndex >= 0 ? (remoteIndex === -1 ? commitIndex + 1 : remoteIndex - commitIndex) : 1;
    const confirmed = await confirm({
      title: 'Push to Here',
      message: `Push ${count} commit${count !== 1 ? 's' : ''} up to ${truncateHash(commit.hash)}?`,
      confirmLabel: 'Push',
      variant: 'info',
    });
    if (!confirmed) return;
    setPushing(true);
    try {
      const result = await api.gitPush(repoPath, false, commit.hash);
      addToast('success', result.message);
      fetchStatus(repoPath);
      fetchLog(repoPath);
    } catch (err: any) {
      addToast('error', err.message || 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  const handleUncommit = async () => {
    setUncommitting(true);
    try {
      await api.uncommit(repoPath, commit.hash);
      addToast('success', 'Commit undone — files moved to unstaged');
      selectCommit(null);
      fetchLog(repoPath);
      fetchStatus(repoPath);
    } catch (err: any) {
      addToast('error', err.message || 'Failed to uncommit');
    } finally {
      setUncommitting(false);
    }
  };

  const handleCheckout = async () => {
    const confirmed = await confirm({
      title: 'Checkout Commit',
      message: `Move the current branch to commit ${truncateHash(commit.hash)}?\n\n"${commit.message}"\n\nThis will reset your branch to this commit. You can then force push to update the remote.`,
      confirmLabel: 'Checkout',
      variant: 'warning',
    });
    if (!confirmed) return;
    setCheckingOut(true);
    try {
      const { branch } = await api.checkout(repoPath, commit.hash);
      addToast('success', `Switched to ${branch} at ${truncateHash(commit.hash)}`);
      await fetchStatus(repoPath);
      await fetchLog(repoPath);
    } catch (err: any) {
      addToast('error', err.message);
    } finally {
      setCheckingOut(false);
    }
  };

  const hasBody = commit.body && commit.body.trim();

  // Cap natural height at 40vh so very long descriptions don't dominate the panel.
  // Once measured, drive a smooth shrink based on diff scroll position.
  const naturalHeight = collapseHeight ?? 0;
  const maxHeight = Math.min(naturalHeight, Math.round(window.innerHeight * 0.4));
  const collapseProgress = maxHeight > 0 ? Math.min(1, scrollY / maxHeight) : 0;
  const visibleHeight = maxHeight * (1 - collapseProgress);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Commit info card */}
      <div className="flex-shrink-0 border-b border-border bg-bg-secondary">
        {/* Title row + close — always visible */}
        <div className="flex items-center justify-between px-3.5 py-1.5 gap-3">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <GitCommitHorizontal size={13} className="text-accent flex-shrink-0" />
            <p className="text-xs font-semibold text-text-primary leading-snug truncate">{commit.message}</p>
          </div>
          <button
            onClick={() => selectCommit(null)}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Outer = controlled height + clip. Inner measureRef = natural height for measurement. */}
        <div
          style={{
            height: collapseHeight === null ? undefined : visibleHeight,
            opacity: 1 - collapseProgress * 0.6,
            overflow: 'hidden',
          }}
        >
        <div ref={measureRef}>
          {/* Description */}
          {hasBody && (
            <div className="px-3.5 pb-1.5">
              <p className="text-[0.7rem] text-text-secondary whitespace-pre-wrap leading-relaxed">{commit.body.trim()}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 px-3.5 pb-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[0.65rem]">
              <GitCommitHorizontal size={10} className="text-accent" />
              <span className="font-mono text-text-secondary">{truncateHash(commit.hash)}</span>
              <button onClick={copyHash} className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary">
                {copied ? <Check size={9} className="text-success" /> : <Copy size={9} />}
              </button>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[0.65rem]">
              <User size={10} className="text-text-muted" />
              <span className="text-text-secondary">{commit.authorName}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[0.65rem]">
              <Calendar size={10} className="text-text-muted" />
              <span className="text-text-secondary">{new Date(commit.authorDate).toLocaleString()}</span>
            </span>
            {commit.parentHashes.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[0.65rem]">
                <GitFork size={10} className="text-text-muted" />
                <span className="font-mono text-text-muted">{commit.parentHashes.map(h => truncateHash(h)).join(', ')}</span>
              </span>
            )}
            {(() => {
              // Find non-current local branches on this commit that can be merged
              // Local branches may contain '/' (e.g. feature/xyz) — remote ones start with 'origin/' or 'remotes/'
              const mergeable = commit.branches.filter(b => !b.startsWith('origin/') && !b.startsWith('remotes/') && b !== status?.current);
              const showActions = isHead || isUnpushed || !commit.isHead || mergeable.length > 0;
              if (!showActions) return null;
              return (
                <span className="inline-flex items-center gap-1.5 ml-auto flex-wrap">
                  {mergeable.length > 0 && (
                    <button
                      onClick={() => setShowMergeDialog(true)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.65rem] font-medium bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 transition-colors"
                    >
                      <GitMerge size={11} />
                      Merge {mergeable[0]} into {status?.current}
                    </button>
                  )}
                  {!commit.isHead && (
                    <button
                      onClick={handleCheckout}
                      disabled={checkingOut}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.65rem] font-medium bg-bg-tertiary text-text-secondary border border-border hover:bg-bg-tertiary/80 hover:text-text-primary disabled:opacity-40 transition-colors"
                    >
                      {checkingOut ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      Checkout
                    </button>
                  )}
                  {isUnpushed && (
                    <button
                      onClick={handlePushToHere}
                      disabled={pushing}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.65rem] font-medium bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 disabled:opacity-40 transition-colors"
                    >
                      {pushing ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                      Push to here
                    </button>
                  )}
                  {isHead && (
                    <button
                      onClick={handleUncommit}
                      disabled={uncommitting}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.65rem] font-medium bg-warning/15 text-warning border border-warning/25 hover:bg-warning/25 disabled:opacity-40 transition-colors"
                    >
                      {uncommitting ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
                      Uncommit
                    </button>
                  )}
                </span>
              );
            })()}
          </div>
        </div>
        </div>
      </div>

      {/* Diff takes remaining space */}
      <div ref={diffWrapRef} className="flex-1 overflow-hidden">
        {diff ? (
          <DiffView diff={diff} repoPath={repoPath} commit={commit.hash} />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Loading diff...
          </div>
        )}
      </div>

      {showMergeDialog && (
        <MergeDialog
          repoPath={repoPath}
          preselectedBranch={commit.branches.find(b => !b.startsWith('origin/') && !b.startsWith('remotes/') && b !== status?.current)}
          onClose={() => setShowMergeDialog(false)}
        />
      )}
    </div>
  );
}
