import { useEffect, useCallback, useState } from 'react';
import { useRepoStore } from '../../store/repoStore';
import { useLogStore } from '../../store/logStore';
import { useStatusStore } from '../../store/statusStore';
import { useUIStore } from '../../store/uiStore';
import { CommitList } from '../log/CommitList';
import { CommitDetail } from '../log/CommitDetail';
import { FileDiffPanel } from '../diff/FileDiffPanel';
import { FileStatusPanel } from '../files/FileStatusPanel';
import { ResizeHandle } from '../ui/ResizeHandle';
import { GitBranch, FolderKanban, ChevronRight, ArrowUp, ArrowDown, RefreshCw, Loader2 } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import { useToastStore } from '../../store/toastStore';
import { useConfirmStore } from '../../store/confirmStore';

export function MainContent() {
  const repos = useRepoStore(s => s.repos);
  const activeRepoId = useRepoStore(s => s.activeRepoId);
  const repo = repos.find(r => r.id === activeRepoId);
  const { fetchLog, selectedCommit, selectCommit } = useLogStore();
  const { fetchAll, selectedFile, selectFile, status } = useStatusStore();
  const { commitListWidth, setCommitListWidth, bottomPanelHeight, setBottomPanelHeight } = useUIStore();
  const projects = useProjectStore(s => s.projects);
  const confirm = useConfirmStore(s => s.confirm);
  const repoProject = activeRepoId ? projects.find(p => p.repoIds.includes(activeRepoId)) : undefined;

  const [remoteAction, setRemoteAction] = useState<'fetch' | 'pull' | 'push' | null>(null);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    if (repo) {
      fetchLog(repo.path);
      fetchAll(repo.path);
    }
  }, [repo?.id, fetchLog, fetchAll]);

  const handleCommitListResize = useCallback((delta: number) => {
    setCommitListWidth(commitListWidth + delta);
  }, [commitListWidth, setCommitListWidth]);

  const handleBottomResize = useCallback((delta: number) => {
    setBottomPanelHeight(bottomPanelHeight - delta);
  }, [bottomPanelHeight, setBottomPanelHeight]);

  const refreshAfterRemote = useCallback(() => {
    if (!repo) return;
    fetchAll(repo.path);
    fetchLog(repo.path);
  }, [repo, fetchAll, fetchLog]);

  const handleFetch = useCallback(async () => {
    if (!repo || remoteAction) return;
    setRemoteAction('fetch');
    try {
      await api.gitFetch(repo.path);
      refreshAfterRemote();
      addToast('success', 'Fetched from remote');
    } catch (err: any) {
      addToast('error', err.message || 'Fetch failed');
    }
    setRemoteAction(null);
  }, [repo, remoteAction, refreshAfterRemote, addToast]);

  const doPull = useCallback(async (repoPath: string, strategy?: 'merge' | 'rebase') => {
    setRemoteAction('pull');
    try {
      const result = await api.gitPull(repoPath, strategy);
      refreshAfterRemote();
      addToast('success', result.message || 'Pulled from remote');
    } catch (err: any) {
      if (err.message === 'DIVERGED') {
        setRemoteAction(null);
        const wantsMerge = await confirm({
          title: 'Divergent Branches',
          message: 'Your local and remote branches have diverged. Would you like to merge?\n\nThis creates a merge commit combining both histories.',
          confirmLabel: 'Merge',
          cancelLabel: 'Other options...',
          variant: 'warning',
        });
        if (wantsMerge) {
          return doPull(repoPath, 'merge');
        }
        const wantsRebase = await confirm({
          title: 'Rebase Instead?',
          message: 'Would you like to rebase your local commits on top of remote?\n\nThis replays your commits on top of the remote branch for a cleaner history.',
          confirmLabel: 'Rebase',
          cancelLabel: 'Cancel',
          variant: 'warning',
        });
        if (wantsRebase) {
          return doPull(repoPath, 'rebase');
        }
        return;
      }
      addToast('error', err.message || 'Pull failed');
    }
    setRemoteAction(null);
  }, [refreshAfterRemote, addToast, confirm]);

  const handlePull = useCallback(() => {
    if (!repo || remoteAction) return;
    doPull(repo.path);
  }, [repo, remoteAction, doPull]);

  const handlePush = useCallback(async () => {
    if (!repo || remoteAction) return;
    const ahead = status?.ahead ?? 0;
    const confirmed = await confirm({
      title: 'Push to Remote',
      message: ahead > 0
        ? `Push ${ahead} commit${ahead !== 1 ? 's' : ''} to remote?`
        : 'Push to remote?',
      confirmLabel: 'Push',
      variant: 'info',
    });
    if (!confirmed) return;
    setRemoteAction('push');
    try {
      const setUpstream = !status?.tracking;
      const result = await api.gitPush(repo.path, setUpstream);
      refreshAfterRemote();
      addToast('success', result.message || 'Pushed to remote');
    } catch (err: any) {
      addToast('error', err.message || 'Push failed');
    }
    setRemoteAction(null);
  }, [repo, remoteAction, status?.tracking, status?.ahead, refreshAfterRemote, addToast, confirm]);

  if (!repo) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <GitBranch size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg">No repository selected</p>
          <p className="text-sm mt-1">Add a repository from the sidebar to get started</p>
        </div>
      </div>
    );
  }

  const hasRemote = status?.tracking || status?.remoteUrl;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 bg-bg-secondary border-b border-border flex items-center px-3 gap-2">
        {repoProject && (
          <div className="flex items-center gap-1.5">
            {repoProject.avatar ? (
              <img src={repoProject.avatar} alt="" className="h-4 max-w-[32px] rounded-sm object-contain" />
            ) : (
              <FolderKanban size={13} className="text-accent" />
            )}
            <span className="text-sm font-semibold text-text-primary">{repoProject.name}</span>
            <ChevronRight size={14} className="text-text-muted" />
          </div>
        )}
        <span className="text-sm font-semibold text-text-primary">{repo.name}</span>
        <span className="text-xs text-text-secondary flex-1">{repo.displayPath}</span>

        {/* Remote actions */}
        {status && hasRemote && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleFetch}
              disabled={!!remoteAction}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-40 text-[0.7rem]"
            >
              {remoteAction === 'fetch' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              <span>Fetch</span>
            </button>
            <button
              onClick={handlePull}
              disabled={!!remoteAction}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors disabled:opacity-40 text-[0.7rem]',
                status.behind > 0
                  ? 'text-warning hover:bg-warning/15'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
            >
              {remoteAction === 'pull' ? <Loader2 size={12} className="animate-spin" /> : <ArrowDown size={12} />}
              <span>Pull</span>
              {status.behind > 0 && (
                <span className="ml-0.5 px-1.5 py-px rounded-full bg-warning/15 text-warning text-[0.6rem] font-semibold font-mono leading-none">{status.behind}</span>
              )}
            </button>
            <button
              onClick={handlePush}
              disabled={!!remoteAction}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors disabled:opacity-40 text-[0.7rem]',
                status.ahead > 0
                  ? 'text-accent hover:bg-accent/15'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
            >
              {remoteAction === 'push' ? <Loader2 size={12} className="animate-spin" /> : <ArrowUp size={12} />}
              <span>{status.tracking ? 'Push' : 'Push'}</span>
              {status.ahead > 0 && (
                <span className="ml-0.5 px-1.5 py-px rounded-full bg-accent/15 text-accent text-[0.6rem] font-semibold font-mono leading-none">{status.ahead}</span>
              )}
            </button>
          </div>
        )}

        {/* Remote status text */}
        {status && (
          <>
            {hasRemote && <div className="w-px h-4 bg-border mx-1" />}
            {hasRemote ? (
              <span className="text-[0.65rem] text-text-secondary cursor-default">
                {status.tracking ? (
                  <>
                    {status.ahead > 0 && status.behind > 0 ? (
                      <>{status.ahead} {status.ahead === 1 ? 'commit' : 'commits'} to push, {status.behind} to pull</>
                    ) : status.ahead > 0 ? (
                      <span className="text-accent">{status.ahead} {status.ahead === 1 ? 'commit' : 'commits'} to push</span>
                    ) : status.behind > 0 ? (
                      <span className="text-warning">{status.behind} {status.behind === 1 ? 'commit' : 'commits'} to pull</span>
                    ) : (
                      <span className="text-text-muted">Synced with remote</span>
                    )}
                  </>
                ) : (
                  <span className="text-text-muted">No upstream — push to set</span>
                )}
              </span>
            ) : (
              <span className="text-[0.65rem] text-text-muted cursor-default">Local — no remote configured</span>
            )}
          </>
        )}
      </div>

      {/* Main area: left column (list + staging) | right column (changes full height) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left column */}
        <div
          style={{ width: (selectedCommit || selectedFile) ? commitListWidth : undefined }}
          className={cn(
            'flex-shrink-0 flex flex-col overflow-hidden',
            !(selectedCommit || selectedFile) && 'flex-1'
          )}
        >
          {/* Commit list */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <CommitList repoPath={repo.path} />
          </div>

          {/* Resize handle between list and staging */}
          <ResizeHandle direction="vertical" onResize={handleBottomResize} />

          {/* Staging panels */}
          <div style={{ height: bottomPanelHeight }} className="flex-shrink-0 overflow-hidden">
            <FileStatusPanel repoPath={repo.path} />
          </div>
        </div>

        {/* Right column: changes panel full height */}
        {(selectedCommit || selectedFile) && (
          <>
            <ResizeHandle direction="horizontal" onResize={handleCommitListResize} />
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedCommit ? (
                <CommitDetail repoPath={repo.path} />
              ) : (
                <FileDiffPanel repoPath={repo.path} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
