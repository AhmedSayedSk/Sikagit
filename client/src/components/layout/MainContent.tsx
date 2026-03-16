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
import { RepoSettingsDialog } from '../operations/RepoSettingsDialog';
import { RunOutput } from '../terminal/RunOutput';
import { GitBranch, FolderKanban, ChevronRight, ArrowUp, ArrowDown, RefreshCw, Loader2, Settings, Trash2, Play, Square, Hammer, Terminal } from 'lucide-react';
import { useRunStore } from '../../store/runStore';
import { useProjectStore } from '../../store/projectStore';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import { useToastStore } from '../../store/toastStore';
import { useConfirmStore } from '../../store/confirmStore';

export function MainContent() {
  const repos = useRepoStore(s => s.repos);
  const activeRepoId = useRepoStore(s => s.activeRepoId);
  const removeRepo = useRepoStore(s => s.removeRepo);
  const repo = repos.find(r => r.id === activeRepoId);
  const { fetchLog, selectedCommit, selectCommit } = useLogStore();
  const { fetchAll, selectedFile, selectFile, status } = useStatusStore();
  const { commitListWidth, setCommitListWidth, bottomPanelHeight, setBottomPanelHeight } = useUIStore();
  const projects = useProjectStore(s => s.projects);
  const confirm = useConfirmStore(s => s.confirm);
  const repoProject = activeRepoId ? projects.find(p => p.repoIds.includes(activeRepoId)) : undefined;

  const [remoteAction, setRemoteAction] = useState<'fetch' | 'pull' | 'push' | null>(null);
  const [showRepoSettings, setShowRepoSettings] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showBuildTerminal, setShowBuildTerminal] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  const startRun = useRunStore(s => s.startRun);
  const stopRun = useRunStore(s => s.stopRun);
  const checkStatus = useRunStore(s => s.checkStatus);
  const isRunning = useRunStore(s => activeRepoId ? !!s.running[activeRepoId] : false);
  const hasRunOutput = useRunStore(s => {
    if (!activeRepoId) return false;
    const out = s.outputs[activeRepoId];
    return (out && out.length > 0) || !!s.running[activeRepoId];
  });
  const startBuild = useRunStore(s => s.startBuild);
  const stopBuild = useRunStore(s => s.stopBuild);
  const checkBuildStatus = useRunStore(s => s.checkBuildStatus);
  const isBuilding = useRunStore(s => activeRepoId ? !!s.running[`build:${activeRepoId}`] : false);
  const hasBuildOutput = useRunStore(s => {
    if (!activeRepoId) return false;
    const bk = `build:${activeRepoId}`;
    const out = s.outputs[bk];
    return (out && out.length > 0) || !!s.running[bk];
  });

  // Auto-show terminal when switching to a repo that's running
  useEffect(() => {
    if (isRunning) setShowTerminal(true);
    if (isBuilding) setShowBuildTerminal(true);
  }, [activeRepoId, isRunning, isBuilding]);

  // Check run/build status for ALL repos on mount (survives refresh)
  useEffect(() => {
    repos.filter(r => r.runCommand).forEach(r => checkStatus(r.id));
    repos.filter(r => r.buildCommand).forEach(r => checkBuildStatus(r.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (repo) {
      fetchLog(repo.path);
      fetchAll(repo.path);
      if (repo.runCommand) checkStatus(repo.id);
      if (repo.buildCommand) checkBuildStatus(repo.id);
    }
  }, [repo?.id, fetchLog, fetchAll, checkStatus, checkBuildStatus]);

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
        <div className="flex items-center gap-0.5 ml-1">
          <button
            onClick={() => setShowRepoSettings(true)}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
            title="Repository settings"
          >
            <Settings size={12} />
          </button>
          <button
            onClick={async () => {
              const confirmed = await confirm({
                title: 'Remove Repository',
                message: `Are you sure you want to remove "${repo.name}" from SikaGit? This will not delete the repository files on disk.`,
                confirmLabel: 'Remove',
                variant: 'danger',
              });
              if (confirmed) removeRepo(repo.id);
            }}
            className="p-1 rounded hover:bg-danger/20 text-text-muted hover:text-danger transition-colors"
            title="Remove repository"
          >
            <Trash2 size={12} />
          </button>
        </div>
        <span className="text-xs text-text-secondary flex-1">{repo.displayPath}</span>

        {/* Run & Build */}
        {(repo.runCommand || repo.buildCommand) && (
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            {repo.runCommand && (
              <button
                onClick={() => {
                  if (isRunning) {
                    stopRun(repo.id);
                  } else {
                    startRun(repo.id);
                    setShowTerminal(true);
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary transition-colors text-[0.7rem]',
                  repo.buildCommand && 'border-r border-border',
                  isRunning
                    ? 'text-danger hover:bg-danger/10'
                    : 'text-success hover:bg-success/10'
                )}
                title={isRunning ? 'Stop' : `Run: ${repo.runCommand}`}
              >
                {isRunning ? <Square size={12} /> : <Play size={12} />}
                <span>{isRunning ? 'Stop' : 'Run'}</span>
              </button>
            )}
            {repo.buildCommand && (
              <button
                onClick={() => {
                  if (isBuilding) {
                    stopBuild(repo.id);
                  } else {
                    startBuild(repo.id);
                    setShowBuildTerminal(true);
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary transition-colors text-[0.7rem]',
                  isBuilding
                    ? 'text-danger hover:bg-danger/10'
                    : 'text-warning hover:bg-warning/10'
                )}
                title={isBuilding ? 'Stop build' : `Build: ${repo.buildCommand}`}
              >
                {isBuilding ? <Square size={12} /> : <Hammer size={12} />}
                <span>{isBuilding ? 'Stop' : 'Build'}</span>
              </button>
            )}
            {(hasRunOutput || isRunning || hasBuildOutput || isBuilding) && (
              <button
                onClick={() => {
                  const anyVisible = showTerminal || showBuildTerminal;
                  setShowTerminal(!anyVisible);
                  setShowBuildTerminal(!anyVisible);
                }}
                className={cn(
                  'flex items-center px-2 py-1 bg-bg-secondary border-l border-border transition-colors text-[0.7rem]',
                  (showTerminal || showBuildTerminal)
                    ? 'text-accent hover:bg-accent/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                )}
                title={(showTerminal || showBuildTerminal) ? 'Hide terminals' : 'Show terminals'}
              >
                <Terminal size={12} />
              </button>
            )}
          </div>
        )}

        {/* Remote actions */}
        {status && hasRemote && (
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={handleFetch}
              disabled={!!remoteAction}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border-r border-border transition-colors disabled:opacity-40 text-[0.7rem]"
            >
              {remoteAction === 'fetch' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              <span>Fetch</span>
            </button>
            <button
              onClick={handlePull}
              disabled={!!remoteAction}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary border-r border-border transition-colors disabled:opacity-40 text-[0.7rem]',
                status.behind > 0
                  ? 'text-warning hover:bg-warning/10'
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
                'flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary transition-colors disabled:opacity-40 text-[0.7rem]',
                status.ahead > 0
                  ? 'text-accent hover:bg-accent/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
            >
              {remoteAction === 'push' ? <Loader2 size={12} className="animate-spin" /> : <ArrowUp size={12} className={status.ahead > 0 ? 'animate-bounce-up' : ''} />}
              <span>Push</span>
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

      {/* Terminal panels — side by side */}
      {(showTerminal || showBuildTerminal) && (
        <div className="flex border-t border-border">
          {showTerminal && repo.runCommand && (
            <div className={cn('flex-1 min-w-0', showBuildTerminal && repo.buildCommand && 'border-r border-border')}>
              <RunOutput
                repoId={repo.id}
                command={repo.runCommand}
                onClose={() => setShowTerminal(false)}
              />
            </div>
          )}
          {showBuildTerminal && repo.buildCommand && (
            <div className="flex-1 min-w-0">
              <RunOutput
                repoId={`build:${repo.id}`}
                command={repo.buildCommand}
                onClose={() => setShowBuildTerminal(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* Repo settings dialog */}
      {showRepoSettings && repo && (
        <RepoSettingsDialog repo={repo} onClose={() => setShowRepoSettings(false)} />
      )}
    </div>
  );
}
