import { useState, useEffect, useCallback } from 'react';
import { useRepoStore } from '../../store/repoStore';
import { useLogStore } from '../../store/logStore';
import { useStatusStore } from '../../store/statusStore';
import { useUIStore } from '../../store/uiStore';
import { CommitList } from '../log/CommitList';
import { CommitDetail } from '../log/CommitDetail';
import { FileDiffPanel } from '../diff/FileDiffPanel';
import { FileStatusPanel } from '../files/FileStatusPanel';
import { CommitDialog } from '../operations/CommitDialog';
import { ResizeHandle } from '../ui/ResizeHandle';
import { GitBranch, GitCommitHorizontal, FolderKanban, ChevronRight } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { cn } from '../../lib/utils';

export function MainContent() {
  const repos = useRepoStore(s => s.repos);
  const activeRepoId = useRepoStore(s => s.activeRepoId);
  const repo = repos.find(r => r.id === activeRepoId);
  const { fetchLog, selectedCommit, selectCommit } = useLogStore();
  const { fetchAll, selectedFile, selectFile, status } = useStatusStore();
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const { commitListWidth, setCommitListWidth, bottomPanelHeight, setBottomPanelHeight } = useUIStore();
  const projects = useProjectStore(s => s.projects);
  const repoProject = activeRepoId ? projects.find(p => p.repoIds.includes(activeRepoId)) : undefined;

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
        <button
          onClick={() => setCommitDialogOpen(true)}
          disabled={!status || status.staged.length === 0}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors',
            status && status.staged.length > 0
              ? 'bg-accent-emphasis hover:bg-accent text-white cursor-pointer'
              : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
          )}
        >
          <GitCommitHorizontal size={13} />
          Commit ({status?.staged.length ?? 0})
        </button>
      </div>

      {commitDialogOpen && (
        <CommitDialog
          repoPath={repo.path}
          stagedCount={status?.staged.length ?? 0}
          onClose={() => setCommitDialogOpen(false)}
        />
      )}

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
