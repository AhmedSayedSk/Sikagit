import { useRef, useCallback } from 'react';
import type { GraphCommit } from '@sikagit/shared';
import { cn, formatDate, truncateHash, detectCommitType } from '../../lib/utils';

interface CommitRowProps {
  commit: GraphCommit;
  graphWidth: number;
  columnWidths: { type: number; author: number; date: number; hash: number };
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}

export function CommitRow({ commit, graphWidth, columnWidths, isSelected, onClick, onDoubleClick }: CommitRowProps) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    if (clickTimer.current) {
      // Double click detected — cancel the pending single click
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onDoubleClick?.();
    } else {
      // Delay single click to see if a double click follows
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onClick();
      }, 220);
    }
  }, [onClick, onDoubleClick]);

  return (
    <div
      className={cn(
        'flex items-center h-full px-3 text-xs cursor-pointer border-b border-border/30',
        isSelected
          ? 'bg-accent-emphasis/20 text-text-primary'
          : 'hover:bg-bg-tertiary/50 text-text-secondary'
      )}
      onClick={handleClick}
    >
      {/* Graph space — the SVG is rendered behind this as an absolute layer */}
      <span style={{ width: graphWidth }} className="flex-shrink-0" />

      {/* Description */}
      <span className="flex-1 truncate ml-2">
        {commit.branches.length > 0 && (
          commit.branches.map(b => {
            const isRemote = b.includes('/');
            return (
              <span
                key={b}
                className={cn(
                  'inline-flex items-center px-1.5 py-0 rounded text-[0.625rem] font-medium mr-1',
                  isRemote
                    ? 'bg-danger/10 text-danger border border-danger/20'
                    : 'bg-success/10 text-success border border-success/20'
                )}
              >
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
  );
}
