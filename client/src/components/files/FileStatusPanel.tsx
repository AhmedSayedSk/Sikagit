import { useCallback, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Minus, RotateCcw, FilePlus2, FilePen, FileX2, FileSymlink, FileQuestion, FileWarning } from 'lucide-react';
import { useStatusStore } from '../../store/statusStore';
import { useLogStore } from '../../store/logStore';
import { useUIStore } from '../../store/uiStore';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

function getStatusIcon(index: string, workingDir: string) {
  if (index === 'U' || workingDir === 'U') return { Icon: FileWarning, color: 'text-[var(--color-status-conflict)]', label: 'Conflicted' };
  if (index === 'M' || workingDir === 'M') return { Icon: FilePen, color: 'text-[var(--color-status-modified)]', label: 'Modified' };
  if (index === 'A') return { Icon: FilePlus2, color: 'text-[var(--color-status-added)]', label: 'Added' };
  if (index === 'D' || workingDir === 'D') return { Icon: FileX2, color: 'text-[var(--color-status-deleted)]', label: 'Deleted' };
  if (index === 'R') return { Icon: FileSymlink, color: 'text-[var(--color-status-renamed)]', label: 'Renamed' };
  if (index === '?') return { Icon: FileQuestion, color: 'text-[var(--color-status-untracked)]', label: 'Untracked' };
  return { Icon: FileQuestion, color: 'text-[var(--color-status-untracked)]', label: 'Unknown' };
}

interface FileStatusPanelProps {
  repoPath: string;
}

export function FileStatusPanel({ repoPath }: FileStatusPanelProps) {
  const { status, fetchStatus, selectedFile, selectedFileSource, selectFile } = useStatusStore();
  const selectCommit = useLogStore(s => s.selectCommit);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const { unstagedPanelRatio, setUnstagedPanelRatio } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

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

  const handleSelectFile = useCallback((path: string | null, source: 'staged' | 'unstaged') => {
    selectFile(path, source);
    if (path) selectCommit(null);
  }, [selectFile, selectCommit]);

  const stageFile = async (file: string) => {
    await api.stageFiles(repoPath, [file]);
    refresh();
  };

  const unstageFile = async (file: string) => {
    await api.unstageFiles(repoPath, [file]);
    refresh();
  };

  const stageAll = async () => {
    if (!status) return;
    const files = [...status.unstaged.map(f => f.path), ...status.untracked];
    await api.stageFiles(repoPath, files);
    refresh();
  };

  const unstageAll = async () => {
    if (!status) return;
    await api.unstageFiles(repoPath, status.staged.map(f => f.path));
    refresh();
  };

  const discardFile = async (file: string) => {
    await api.discardChanges(repoPath, [file]);
    refresh();
  };

  if (!status) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading...
      </div>
    );
  }

  const stagedFiles = status.staged;
  const unstagedFiles = [...status.unstaged, ...status.untracked.map(p => ({
    path: p, index: '?', workingDir: '?', isStaged: false, isConflicted: false,
  }))];

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden border-t border-border">
      {/* Unstaged files */}
      <div style={{ width: `${unstagedPanelRatio * 100}%` }} className="flex-shrink-0 flex flex-col overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary cursor-pointer text-xs font-medium text-text-secondary flex-shrink-0"
          onClick={() => setUnstagedOpen(!unstagedOpen)}
        >
          <div className="flex items-center gap-1">
            {unstagedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Unstaged ({unstagedFiles.length})
          </div>
          {unstagedFiles.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); stageAll(); }}
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
            {unstagedFiles.map(f => {
              const { Icon, color, label } = getStatusIcon(f.index, f.workingDir);
              return (
                <div
                  key={f.path}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-1 text-xs cursor-pointer',
                    selectedFile === f.path && selectedFileSource === 'unstaged'
                      ? 'bg-accent-emphasis/20 text-text-primary'
                      : 'hover:bg-bg-tertiary/30'
                  )}
                  onClick={() => handleSelectFile(
                    selectedFile === f.path && selectedFileSource === 'unstaged' ? null : f.path,
                    'unstaged'
                  )}
                >
                  <span title={label} className="flex-shrink-0"><Icon size={13} className={color} /></span>
                  <span className="flex-1 truncate">{f.path}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={e => { e.stopPropagation(); stageFile(f.path); }}
                      className="text-success/70 hover:text-success"
                      title="Stage"
                    >
                      <Plus size={12} />
                    </button>
                    {f.index !== '?' && (
                      <button
                        onClick={e => { e.stopPropagation(); discardFile(f.path); }}
                        className="text-danger/70 hover:text-danger"
                        title="Discard changes"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
          className="flex items-center justify-between px-3 py-1.5 bg-bg-secondary cursor-pointer text-xs font-medium text-text-secondary flex-shrink-0"
          onClick={() => setStagedOpen(!stagedOpen)}
        >
          <div className="flex items-center gap-1">
            {stagedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Staged ({stagedFiles.length})
          </div>
          {stagedFiles.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); unstageAll(); }}
              className="px-1.5 py-0.5 rounded border border-warning/40 bg-warning/15 text-warning hover:bg-warning/25 hover:border-warning/60 flex items-center gap-1 transition-colors"
              title="Unstage all"
            >
              <Minus size={10} />
              <span className="text-[0.6rem] font-medium">Unstage All</span>
            </button>
          )}
        </div>
        {stagedOpen && (
          <div className="flex-1 overflow-y-auto">
            {stagedFiles.map(f => {
              const { Icon, color, label } = getStatusIcon(f.index, f.workingDir);
              return (
                <div
                  key={f.path}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-1 text-xs cursor-pointer',
                    selectedFile === f.path && selectedFileSource === 'staged'
                      ? 'bg-accent-emphasis/20 text-text-primary'
                      : 'hover:bg-bg-tertiary/30'
                  )}
                  onClick={() => handleSelectFile(
                    selectedFile === f.path && selectedFileSource === 'staged' ? null : f.path,
                    'staged'
                  )}
                >
                  <span title={label} className="flex-shrink-0"><Icon size={13} className={color} /></span>
                  <span className="flex-1 truncate">{f.path}</span>
                  <button
                    onClick={e => { e.stopPropagation(); unstageFile(f.path); }}
                    className="opacity-0 group-hover:opacity-100 text-warning/70 hover:text-warning"
                    title="Unstage"
                  >
                    <Minus size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
