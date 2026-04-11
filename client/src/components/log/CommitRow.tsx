import { useRef, useCallback, useState } from 'react';
import { GitMerge, GitBranch, Trash2, Archive } from 'lucide-react';
import type { GraphCommit } from '@sikagit/shared';
import { cn, formatDate, truncateHash, detectCommitType } from '../../lib/utils';

export type BranchAction = 'merge' | 'checkout' | 'delete' | 'unshelve';

interface CommitRowProps {
  commit: GraphCommit;
  graphWidth: number;
  columnWidths: { type: number; author: number; date: number; hash: number };
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onBranchAction?: (branch: string, action: BranchAction) => void;
}

export function CommitRow({ commit, graphWidth, columnWidths, isSelected, onClick, onDoubleClick, onBranchAction }: CommitRowProps) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: string } | null>(null);

  const handleClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onDoubleClick?.();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onClick();
      }, 220);
    }
  }, [onClick, onDoubleClick]);

  const handleBranchContext = (e: React.MouseEvent, branch: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, branch });
  };

  const handleAction = (action: BranchAction) => {
    if (contextMenu && onBranchAction) {
      onBranchAction(contextMenu.branch, action);
    }
    setContextMenu(null);
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center h-full px-3 text-xs cursor-pointer border-b border-border/30',
          isSelected
            ? 'bg-accent-emphasis/20 text-text-primary'
            : 'hover:bg-bg-tertiary/50 text-text-secondary'
        )}
        onClick={handleClick}
      >
        {/* Graph space */}
        <span style={{ width: graphWidth }} className="flex-shrink-0" />

        {/* Description */}
        <span className="flex-1 truncate ml-2">
          {commit.branches.length > 0 && (
            commit.branches.map(b => {
              const isRemote = b.startsWith('origin/') || b.startsWith('remotes/');
              const isShelved = b.startsWith('save/');
              return (
                <span
                  key={b}
                  onContextMenu={e => handleBranchContext(e, b)}
                  className={cn(
                    'inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[0.625rem] font-medium mr-1 cursor-context-menu',
                    isShelved
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : isRemote
                        ? 'bg-danger/10 text-danger border border-danger/20'
                        : 'bg-success/10 text-success border border-success/20'
                  )}
                >
                  {isShelved && <Archive size={9} className="flex-shrink-0" />}
                  {b}
                </span>
              );
            })
          )}
          {commit.tags.length > 0 && (
            commit.tags.map(t => (
              <span
                key={t}
                className="inline-flex items-center px-1.5 py-0 rounded text-[0.625rem] font-medium bg-warning/10 text-warning border border-warning/20 mr-1"
              >
                {t}
              </span>
            ))
          )}
          <span className={cn(commit.isHead && 'font-semibold text-text-primary')}>
            {commit.message}
          </span>
        </span>

        {/* Type */}
        <span style={{ width: columnWidths.type }} className="flex-shrink-0 pl-1 flex items-center">
          {(() => {
            const commitType = detectCommitType(commit.message);
            if (!commitType) return null;
            return (
              <span className={cn('px-1.5 py-px rounded text-[0.575rem] font-medium leading-tight', commitType.color, commitType.bg)}>
                {commitType.label}
              </span>
            );
          })()}
        </span>

        {/* Author */}
        <span style={{ width: columnWidths.author }} className="truncate flex-shrink-0 pl-1">{commit.authorName}</span>

        {/* Date */}
        <span style={{ width: columnWidths.date }} className="flex-shrink-0 text-text-muted pl-1">{formatDate(commit.authorDate)}</span>

        {/* Hash */}
        <span style={{ width: columnWidths.hash }} className="flex-shrink-0 font-mono text-text-muted pl-1">{truncateHash(commit.hash)}</span>
      </div>

      {/* Branch context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setContextMenu(null)} onContextMenu={e => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-[101] bg-bg-secondary border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.branch.startsWith('save/') && (
              <>
                <button
                  onClick={() => handleAction('unshelve')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 transition-colors"
                >
                  <Archive size={12} />
                  Restore shelved changes
                </button>
                <div className="my-1 border-t border-border" />
              </>
            )}
            <button
              onClick={() => handleAction('merge')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <GitMerge size={12} className="text-accent" />
              Merge into current branch
            </button>
            <button
              onClick={() => handleAction('checkout')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <GitBranch size={12} className="text-success" />
              Checkout this branch
            </button>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => handleAction('delete')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 transition-colors"
            >
              <Trash2 size={12} />
              Delete branch
            </button>
          </div>
        </>
      )}
    </>
  );
}
