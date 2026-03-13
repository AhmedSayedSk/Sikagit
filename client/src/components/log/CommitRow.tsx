import type { GraphCommit } from '@sikagit/shared';
import { cn, formatDate, truncateHash } from '../../lib/utils';

interface CommitRowProps {
  commit: GraphCommit;
  graphWidth: number;
  columnWidths: { author: number; date: number; hash: number };
  isSelected: boolean;
  onClick: () => void;
}

export function CommitRow({ commit, graphWidth, columnWidths, isSelected, onClick }: CommitRowProps) {
  return (
    <div
      className={cn(
        'flex items-center h-7 px-3 text-xs cursor-pointer border-b border-border/30',
        isSelected
          ? 'bg-accent-emphasis/20 text-text-primary'
          : 'hover:bg-bg-tertiary/50 text-text-secondary'
      )}
      onClick={onClick}
    >
      {/* Graph space — the SVG is rendered behind this as an absolute layer */}
      <span style={{ width: graphWidth }} className="flex-shrink-0" />

      {/* Description */}
      <span className="flex-1 truncate ml-2">
        {commit.branches.length > 0 && (
          commit.branches.map(b => (
            <span
              key={b}
              className="inline-flex items-center px-1.5 py-0 rounded text-[0.625rem] font-medium bg-accent/10 text-accent border border-accent/20 mr-1"
            >
              {b}
            </span>
          ))
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

      {/* Author */}
      <span style={{ width: columnWidths.author }} className="truncate flex-shrink-0 pl-1">{commit.authorName}</span>

      {/* Date */}
      <span style={{ width: columnWidths.date }} className="flex-shrink-0 text-text-muted pl-1">{formatDate(commit.authorDate)}</span>

      {/* Hash */}
      <span style={{ width: columnWidths.hash }} className="flex-shrink-0 font-mono text-text-muted pl-1">{truncateHash(commit.hash)}</span>
    </div>
  );
}
