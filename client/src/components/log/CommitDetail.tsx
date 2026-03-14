import { useEffect, useState, useRef, useCallback } from 'react';
import { X, Copy, Check, GitCommitHorizontal, User, Calendar, GitFork, Undo2, Loader2 } from 'lucide-react';
import { useLogStore } from '../../store/logStore';
import { useStatusStore } from '../../store/statusStore';
import { useToastStore } from '../../store/toastStore';
import { api } from '../../lib/api';
import { truncateHash } from '../../lib/utils';
import { DiffView } from '../diff/DiffView';

interface CommitDetailProps {
  repoPath: string;
}

export function CommitDetail({ repoPath }: CommitDetailProps) {
  const { commits, selectedCommit, selectCommit, fetchLog } = useLogStore();
  const fetchStatus = useStatusStore(s => s.fetchStatus);
  const addToast = useToastStore(s => s.addToast);
  const commit = commits.find(c => c.hash === selectedCommit);
  const [diff, setDiff] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [uncommitting, setUncommitting] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const collapseRef = useRef<HTMLDivElement>(null);
  const [collapseHeight, setCollapseHeight] = useState<number | null>(null);
  const diffWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (commit) {
      api.getDiff(repoPath, commit.hash).then(setDiff).catch(() => setDiff(''));
      setScrollY(0);
    }
  }, [commit?.hash, repoPath]);

  // Measure the collapsible section height
  useEffect(() => {
    if (collapseRef.current) {
      setCollapseHeight(collapseRef.current.scrollHeight);
    }
  }, [commit?.hash, commit?.body]);

  // Listen to scroll on the first scrollable child inside the diff wrapper
  useEffect(() => {
    const wrapper = diffWrapRef.current;
    if (!wrapper) return;

    const findScrollable = (): HTMLElement | null => {
      // DiffView renders an overflow-auto div
      const el = wrapper.querySelector('[class*="overflow-auto"]') as HTMLElement;
      return el || wrapper;
    };

    let scrollEl: HTMLElement | null = null;

    const onScroll = () => {
      if (scrollEl) setScrollY(scrollEl.scrollTop);
    };

    // Use MutationObserver to wait for DiffView to render
    const attach = () => {
      scrollEl = findScrollable();
      if (scrollEl) {
        scrollEl.addEventListener('scroll', onScroll, { passive: true });
      }
    };

    // Try immediately
    attach();

    // Also observe for children being added
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

  if (!commit) return null;

  const copyHash = () => {
    navigator.clipboard.writeText(commit.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHead = commits.length > 0 && commits[0].hash === commit.hash;

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

  const hasBody = commit.body && commit.body.trim();

  // Collapse progress: 0 = fully expanded, 1 = fully collapsed
  const maxCollapse = collapseHeight || 60;
  const collapseProgress = Math.min(1, scrollY / maxCollapse);
  const visibleHeight = maxCollapse * (1 - collapseProgress);

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
          {/* Show collapsed metadata inline when collapsed */}
          {collapseProgress > 0.8 && (
            <span className="text-[0.6rem] text-text-muted flex-shrink-0" style={{ opacity: Math.min(1, (collapseProgress - 0.8) / 0.2) }}>
              {truncateHash(commit.hash)} · {commit.authorName}
            </span>
          )}
          <button
            onClick={() => selectCommit(null)}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Collapsible: description + metadata */}
        <div
          ref={collapseRef}
          style={{
            height: visibleHeight,
            opacity: 1 - collapseProgress * 0.6,
            overflow: 'hidden',
          }}
        >
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
            {isHead && (
              <button
                onClick={handleUncommit}
                disabled={uncommitting}
                className="inline-flex items-center gap-1 text-[0.65rem] text-warning hover:text-warning/80 disabled:opacity-40 ml-auto"
              >
                {uncommitting ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />}
                <span>Uncommit</span>
              </button>
            )}
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
    </div>
  );
}
