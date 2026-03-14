import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Minus, RotateCcw, Trash2, Folder, GitCommitHorizontal, FilePlus2, FilePen, FileX2, FileSymlink, FileQuestion, FileWarning, Sparkles } from 'lucide-react';
import { useStatusStore } from '../../store/statusStore';
import { useLogStore } from '../../store/logStore';
import { useUIStore } from '../../store/uiStore';
import { useConfirmStore } from '../../store/confirmStore';
import { CommitDialog } from '../operations/CommitDialog';
import { SmartCommitDialog } from '../operations/SmartCommitDialog';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { GitFileStatus } from '@sikagit/shared';

function getStatusIcon(index: string, workingDir: string) {
  if (index === 'U' || workingDir === 'U') return { Icon: FileWarning, color: 'text-[var(--color-status-conflict)]', label: 'Conflicted' };
  if (index === 'M' || workingDir === 'M') return { Icon: FilePen, color: 'text-[var(--color-status-modified)]', label: 'Modified' };
  if (index === 'A') return { Icon: FilePlus2, color: 'text-[var(--color-status-added)]', label: 'Added' };
  if (index === 'D' || workingDir === 'D') return { Icon: FileX2, color: 'text-[var(--color-status-deleted)]', label: 'Deleted' };
  if (index === 'R') return { Icon: FileSymlink, color: 'text-[var(--color-status-renamed)]', label: 'Renamed' };
  if (index === '?') return { Icon: FileQuestion, color: 'text-[var(--color-status-untracked)]', label: 'Untracked' };
  return { Icon: FileQuestion, color: 'text-[var(--color-status-untracked)]', label: 'Unknown' };
}

interface FolderGroup {
  folder: string;
  files: GitFileStatus[];
}

function groupByFolder(files: GitFileStatus[]): FolderGroup[] {
  const map = new Map<string, GitFileStatus[]>();
  for (const f of files) {
    const lastSlash = f.path.lastIndexOf('/');
    const folder = lastSlash >= 0 ? f.path.substring(0, lastSlash) : '';
    const existing = map.get(folder);
    if (existing) existing.push(f);
    else map.set(folder, [f]);
  }
  // Sort folders alphabetically, root first
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === '') return -1;
      if (b === '') return 1;
      return a.localeCompare(b);
    })
    .map(([folder, files]) => ({ folder, files }));
}

function fileName(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

function FileRow({ file, isActive, onClick, actions, showFullPath }: {
  file: GitFileStatus;
  isActive: boolean;
  onClick: () => void;
  actions: React.ReactNode;
  showFullPath?: boolean;
}) {
  const { Icon, color, label } = getStatusIcon(file.index, file.workingDir);
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-1 text-xs cursor-pointer',
        isActive
          ? 'bg-accent-emphasis/20 text-text-primary'
          : 'hover:bg-bg-tertiary/30'
      )}
      onClick={onClick}
    >
      <span title={label} className="flex-shrink-0"><Icon size={13} className={color} /></span>
      <span className="flex-1 truncate">{showFullPath ? file.path : fileName(file.path)}</span>
      {actions}
    </div>
  );
}

function FolderSection({ group, collapsedFolders, toggleFolder, children }: {
  group: FolderGroup;
  collapsedFolders: Set<string>;
  toggleFolder: (folder: string) => void;
  children: React.ReactNode;
}) {
  if (group.folder === '') {
    return <>{children}</>;
  }

  const collapsed = collapsedFolders.has(group.folder);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 text-[0.65rem] font-medium text-text-muted cursor-pointer hover:text-text-secondary transition-colors"
        onClick={() => toggleFolder(group.folder)}
      >
        {collapsed
          ? <ChevronRight size={10} className="flex-shrink-0" />
          : <ChevronDown size={10} className="flex-shrink-0" />
        }
        <Folder size={10} className="flex-shrink-0 text-text-muted/70" />
        <span className="truncate">{group.folder}</span>
        <span className="text-text-muted/50 ml-auto">{group.files.length}</span>
      </div>
      {!collapsed && <div className="ml-2">{children}</div>}
    </div>
  );
}

interface FileStatusPanelProps {
  repoPath: string;
}

export function FileStatusPanel({ repoPath }: FileStatusPanelProps) {
  const { status, fetchStatus, selectedFile, selectedFileSource, selectFile } = useStatusStore();
  const selectCommit = useLogStore(s => s.selectCommit);
  const stagedOpen = true;
  const unstagedOpen = true;
  const { unstagedPanelRatio, setUnstagedPanelRatio, groupFilesByFolder } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const confirm = useConfirmStore(s => s.confirm);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [smartCommitOpen, setSmartCommitOpen] = useState(false);
  const { aiEnabled, aiApiKey } = useUIStore();
  const [collapsedUnstagedFolders, setCollapsedUnstagedFolders] = useState<Set<string>>(new Set());
  const [collapsedStagedFolders, setCollapsedStagedFolders] = useState<Set<string>>(new Set());

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startRatio = unstagedPanelRatio;
    const containerWidth = containerRef.current?.offsetWidth ?? 1;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newRatio = startRatio + delta / containerWidth;
      setUnstagedPanelRatio(newRatio);
    };
    const onMouseUp = () => {
      setDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [unstagedPanelRatio, setUnstagedPanelRatio]);

  const refresh = useCallback(() => fetchStatus(repoPath), [repoPath, fetchStatus]);

  // Auto-poll status every 3 seconds to detect external file changes
  useEffect(() => {
    const interval = setInterval(() => fetchStatus(repoPath), 3000);
    return () => clearInterval(interval);
  }, [repoPath, fetchStatus]);

  const handleSelectFile = useCallback((path: string | null, source: 'staged' | 'unstaged') => {
    selectFile(path, source);
    if (path) selectCommit(null);
  }, [selectFile, selectCommit]);

  const selectNextInList = useCallback((list: GitFileStatus[], file: string, source: 'staged' | 'unstaged') => {
    if (selectedFile !== file || selectedFileSource !== source) return;
    const idx = list.findIndex(f => f.path === file);
    if (list.length <= 1) {
      selectFile(null);
    } else {
      const next = idx < list.length - 1 ? list[idx + 1] : list[idx - 1];
      selectFile(next.path, source);
    }
  }, [selectedFile, selectedFileSource, selectFile]);

  const stageFile = async (file: string) => {
    selectNextInList(unstagedFiles, file, 'unstaged');
    await api.stageFiles(repoPath, [file]);
    await refresh();
  };

  const unstageFile = async (file: string) => {
    selectNextInList(status?.staged ?? [], file, 'staged');
    await api.unstageFiles(repoPath, [file]);
    await refresh();
  };

  const stageAll = async () => {
    if (!status) return;
    selectFile(null);
    const files = [...status.unstaged.map(f => f.path), ...status.untracked];
    await api.stageFiles(repoPath, files);
    await refresh();
  };

  const unstageAll = async () => {
    if (!status) return;
    selectFile(null);
    await api.unstageFiles(repoPath, status.staged.map(f => f.path));
    await refresh();
  };

  const discardFile = async (file: string) => {
    selectNextInList(unstagedFiles, file, 'unstaged');
    await api.discardChanges(repoPath, [file]);
    await refresh();
  };

  const deleteFile = async (file: string) => {
    selectNextInList(unstagedFiles, file, 'unstaged');
    await api.deleteUntrackedFiles(repoPath, [file]);
    await refresh();
  };

  const toggleUnstagedFolder = useCallback((folder: string) => {
    setCollapsedUnstagedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  const toggleStagedFolder = useCallback((folder: string) => {
    setCollapsedStagedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }, []);

  const unstagedFiles: GitFileStatus[] = useMemo(() => {
    if (!status) return [];
    return [...status.unstaged, ...status.untracked.map(p => ({
      path: p, index: '?', workingDir: '?', isStaged: false, isConflicted: false,
    }))];
  }, [status]);

  const unstagedGroups = useMemo(() => groupByFolder(unstagedFiles), [unstagedFiles]);
  const stagedGroups = useMemo(() => groupByFolder(status?.staged ?? []), [status?.staged]);

  if (!status) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading...
      </div>
    );
  }

  const stagedFiles = status.staged;

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden border-t border-border">
      {/* Unstaged files */}
      <div style={{ width: `${unstagedPanelRatio * 100}%` }} className="flex-shrink-0 flex flex-col overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary text-xs font-medium text-text-secondary flex-shrink-0"
        >
          <div className="flex items-center gap-1">
            Unstaged ({unstagedFiles.length})
          </div>
          {unstagedFiles.length > 0 && (
            <button
              onClick={() => stageAll()}
              className="px-1.5 py-0.5 rounded border border-success/40 bg-success/15 text-success hover:bg-success/25 hover:border-success/60 flex items-center gap-1 transition-colors"
              title="Stage all"
            >
              <Plus size={10} />
              <span className="text-[0.6rem] font-medium">Stage All</span>
            </button>
          )}
        </div>
        {unstagedOpen && (
          <div className="flex-1 overflow-y-auto">
            {(groupFilesByFolder ? unstagedGroups : [{ folder: '', files: unstagedFiles }]).map(group => (
              <FolderSection
                key={group.folder}
                group={group}
                collapsedFolders={collapsedUnstagedFolders}
                toggleFolder={toggleUnstagedFolder}
              >
                {group.files.map(f => (
                  <FileRow
                    key={f.path}
                    file={f}
                    showFullPath={!groupFilesByFolder}
                    isActive={selectedFile === f.path && selectedFileSource === 'unstaged'}
                    onClick={() => handleSelectFile(
                      selectedFile === f.path && selectedFileSource === 'unstaged' ? null : f.path,
                      'unstaged'
                    )}
                    actions={
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={e => { e.stopPropagation(); stageFile(f.path); }}
                          className="p-1 rounded bg-success/15 text-success/80 hover:bg-success/25 hover:text-success transition-colors"
                          title="Stage"
                        >
                          <Plus size={12} />
                        </button>
                        {f.index === '?' ? (
                          <button
                            onClick={async e => {
                              e.stopPropagation();
                              const confirmed = await confirm({
                                title: 'Delete File',
                                message: `Are you sure you want to permanently delete "${f.path}"? This action cannot be undone.`,
                                confirmLabel: 'Delete',
                                variant: 'danger',
                              });
                              if (confirmed) deleteFile(f.path);
                            }}
                            className="p-1 rounded bg-danger/15 text-danger/80 hover:bg-danger/25 hover:text-danger transition-colors"
                            title="Delete file"
                          >
                            <Trash2 size={12} />
                          </button>
                        ) : (
                          <button
                            onClick={async e => {
                              e.stopPropagation();
                              const confirmed = await confirm({
                                title: 'Discard Changes',
                                message: `Are you sure you want to discard all changes to "${f.path}"? This action cannot be undone.`,
                                confirmLabel: 'Discard',
                                variant: 'danger',
                              });
                              if (confirmed) discardFile(f.path);
                            }}
                            className="p-1 rounded bg-danger/15 text-danger/80 hover:bg-danger/25 hover:text-danger transition-colors"
                            title="Discard changes"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                      </div>
                    }
                  />
                ))}
              </FolderSection>
            ))}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className={cn(
          'w-[3px] flex-shrink-0 cursor-col-resize hover:bg-accent/40 transition-colors',
          dragging ? 'bg-accent/50' : 'bg-border'
        )}
      />

      {/* Staged files */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div
          className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary text-xs font-medium text-text-secondary flex-shrink-0"
        >
          <div className="flex items-center gap-1">
            Staged ({stagedFiles.length})
          </div>
          <div className="flex items-center gap-1.5">
            {stagedFiles.length > 0 && (
              <button
                onClick={() => unstageAll()}
                className="px-1.5 py-0.5 rounded border border-warning/40 bg-warning/15 text-warning hover:bg-warning/25 hover:border-warning/60 flex items-center gap-1 transition-colors"
                title="Unstage all"
              >
                <Minus size={10} />
                <span className="text-[0.6rem] font-medium">Unstage All</span>
              </button>
            )}
            <button
              onClick={() => setCommitDialogOpen(true)}
              disabled={stagedFiles.length === 0}
              className={cn(
                'px-1.5 py-0.5 rounded border flex items-center gap-1 transition-colors',
                stagedFiles.length > 0
                  ? 'border-accent/40 bg-accent-emphasis/15 text-accent hover:bg-accent-emphasis/25 hover:border-accent/60 cursor-pointer'
                  : 'border-border bg-bg-tertiary text-text-muted/40 cursor-not-allowed'
              )}
            >
              <GitCommitHorizontal size={10} />
              <span className="text-[0.6rem] font-medium">Commit</span>
            </button>
            {aiEnabled && !!aiApiKey && (
              <button
                onClick={() => setSmartCommitOpen(true)}
                disabled={stagedFiles.length === 0}
                className={cn(
                  'px-1.5 py-0.5 rounded border flex items-center gap-1 transition-colors',
                  stagedFiles.length > 0
                    ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 hover:border-accent/60 cursor-pointer'
                    : 'border-border bg-bg-tertiary text-text-muted/40 cursor-not-allowed'
                )}
              >
                <Sparkles size={10} />
                <span className="text-[0.6rem] font-medium">Smart Commit</span>
              </button>
            )}
          </div>
        </div>
        {stagedOpen && (
          <div className="flex-1 overflow-y-auto">
            {(groupFilesByFolder ? stagedGroups : [{ folder: '', files: stagedFiles }]).map(group => (
              <FolderSection
                key={group.folder}
                group={group}
                collapsedFolders={collapsedStagedFolders}
                toggleFolder={toggleStagedFolder}
              >
                {group.files.map(f => (
                  <FileRow
                    key={f.path}
                    file={f}
                    showFullPath={!groupFilesByFolder}
                    isActive={selectedFile === f.path && selectedFileSource === 'staged'}
                    onClick={() => handleSelectFile(
                      selectedFile === f.path && selectedFileSource === 'staged' ? null : f.path,
                      'staged'
                    )}
                    actions={
                      <button
                        onClick={e => { e.stopPropagation(); unstageFile(f.path); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded bg-warning/15 text-warning/80 hover:bg-warning/25 hover:text-warning transition-colors"
                        title="Unstage"
                      >
                        <Minus size={12} />
                      </button>
                    }
                  />
                ))}
              </FolderSection>
            ))}
          </div>
        )}
      </div>

{commitDialogOpen && (
        <CommitDialog
          repoPath={repoPath}
          stagedCount={stagedFiles.length}
          onClose={() => setCommitDialogOpen(false)}
        />
      )}
      {smartCommitOpen && (
        <SmartCommitDialog
          repoPath={repoPath}
          onClose={() => setSmartCommitOpen(false)}
        />
      )}
    </div>
  );
}
