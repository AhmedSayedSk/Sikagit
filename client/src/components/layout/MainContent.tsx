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
import { GitBranch, FolderKanban, ChevronRight, Cloud, CloudOff, ArrowUp, ArrowDown, RefreshCw, Loader2 } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';

export function MainContent() {
  const repos = useRepoStore(s => s.repos);
  const activeRepoId = useRepoStore(s => s.activeRepoId);
  const repo = repos.find(r => r.id === activeRepoId);
  const { fetchLog, selectedCommit, selectCommit } = useLogStore();
  const { fetchAll, selectedFile, selectFile, status } = useStatusStore();
  const { commitListWidth, setCommitListWidth, bottomPanelHeight, setBottomPanelHeight } = useUIStore();
  const projects = useProjectStore(s => s.projects);
  const repoProject = activeRepoId ? projects.find(p => p.repoIds.includes(activeRepoId)) : undefined;

  const [remoteAction, setRemoteAction] = useState<'fetch' | 'pull' | 'push' | null>(null);

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
    } catch { /* status polling will catch up */ }
    setRemoteAction(null);
  }, [repo, remoteAction, refreshAfterRemote]);

  const handlePull = useCallback(async () => {
    if (!repo || remoteAction) return;
    setRemoteAction('pull');
    try {
      await api.gitPull(repo.path);
      refreshAfterRemote();
    } catch { /* */ }
    setRemoteAction(null);
  }, [repo, remoteAction, refreshAfterRemote]);

  const handlePush = useCallback(async () => {
    if (!repo || remoteAction) return;
    setRemoteAction('push');
    try {
      const setUpstream = !status?.tracking;
      await api.gitPush(repo.path, setUpstream);
      refreshAfterRemote();
    } catch { /* */ }
    setRemoteAction(null);
  }, [repo, remoteAction, status?.tracking, refreshAfterRemote]);

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

        {/* Remote status badge */}
        {status && (
          hasRemote ? (
            <Tooltip content={
              <>
                <span className="font-semibold text-accent">Remote: </span>
                <span className="text-text-primary">{status.tracking || status.remoteUrl}</span>
                {status.tracking ? (
                  <>
                    {status.ahead > 0 && (
                      <div className="mt-1 text-success">{status.ahead} commit{status.ahead > 1 ? 's' : ''} ahead — ready to push</div>
                    )}
                    {status.behind > 0 && (
                      <div className="mt-1 text-warning">{status.behind} commit{status.behind > 1 ? 's' : ''} behind — pull to update</div>
                    )}
                    {status.ahead === 0 && status.behind === 0 && (
                      <div className="mt-1 text-text-secondary">Up to date with remote</div>
                    )}
                  </>
                ) : (
                  <div className="mt-1 text-text-muted">No upstream set — push to set upstream</div>
                )}
              </>
            }>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent/10 border border-accent/20 cursor-default">
                <Cloud size={12} className="text-accent" />
                {status.tracking ? (
                  <>
                    {status.ahead > 0 && (
                      <span className="text-[0.65rem] font-semibold font-mono text-accent">↑{status.ahead}</span>
                    )}
                    {status.behind > 0 && (
                      <span className="text-[0.65rem] font-semibold font-mono text-warning">↓{status.behind}</span>
                    )}
                    {status.ahead === 0 && status.behind === 0 && (
                      <span className="text-[0.65rem] font-medium text-accent/80 tracking-wide">Synced</span>
                    )}
                  </>
                ) : (
                  <span className="text-[0.65rem] font-medium text-accent/80 tracking-wide">Remote</span>
                )}
              </div>
            </Tooltip>
          ) : (
            <Tooltip content={
              <>
                <div className="font-semibold text-text-primary">Local repository</div>
                <div className="mt-1 text-text-secondary">No remote configured.</div>
                <div className="mt-1 text-text-muted">Add a remote in repository settings.</div>
              </>
            }>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-tertiary/50 border border-border/40 cursor-default">
                <CloudOff size={12} className="text-text-secondary" />
                <span className="text-[0.65rem] font-medium text-text-secondary tracking-wide">Local</span>
              </div>
            </Tooltip>
          )
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
