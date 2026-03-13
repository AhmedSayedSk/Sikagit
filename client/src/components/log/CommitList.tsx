import { useRef, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLogStore } from '../../store/logStore';
import { useStatusStore } from '../../store/statusStore';
import { useUIStore } from '../../store/uiStore';
import { CommitRow } from './CommitRow';
import { CommitGraph, getGraphWidth } from '../graph/CommitGraph';
import { ColumnResizeHandle } from '../ui/ColumnResizeHandle';
import { cn } from '../../lib/utils';

interface CommitListProps {
  repoPath: string;
}

const ROW_HEIGHT = 28;

export function CommitList({ repoPath }: CommitListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { commits, totalLanes, loading, hasMore, loadMore, selectedCommit, selectCommit } = useLogStore();
  const { status, selectFile } = useStatusStore();
  const {
    colGraphWidth, setColGraphWidth,
    colAuthorWidth, setColAuthorWidth,
    colDateWidth, setColDateWidth,
    colHashWidth, setColHashWidth,
  } = useUIStore();
  const [scrollTop, setScrollTop] = useState(0);

  const hasUncommitted = status && (
    status.staged.length > 0 ||
    status.unstaged.length > 0 ||
    status.untracked.length > 0
  );

  const rowVirtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const { scrollHeight, clientHeight } = el;
    if (scrollHeight - el.scrollTop - clientHeight < 500 && hasMore && !loading) {
      loadMore(repoPath);
    }
  }, [repoPath, hasMore, loading, loadMore]);

  const autoGraphWidth = getGraphWidth(totalLanes);
  const graphWidth = colGraphWidth ?? autoGraphWidth;

  const columnWidths = { author: colAuthorWidth, date: colDateWidth, hash: colHashWidth };

  if (loading && commits.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading commits...
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const startIndex = virtualItems.length > 0 ? virtualItems[0].index : 0;
  const endIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index + 1 : 0;

  const uncommittedOffset = hasUncommitted ? ROW_HEIGHT : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-7 bg-bg-secondary border-b border-border flex items-center px-3 text-xs text-text-muted font-medium flex-shrink-0">
        <span style={{ width: graphWidth }} className="flex-shrink-0">Graph</span>
        <ColumnResizeHandle onResize={delta => setColGraphWidth((colGraphWidth ?? autoGraphWidth) + delta)} />
        <span className="flex-1 ml-2">Description</span>
        <ColumnResizeHandle onResize={delta => setColAuthorWidth(colAuthorWidth - delta)} />
        <span style={{ width: colAuthorWidth }} className="flex-shrink-0 pl-1">Author</span>
        <ColumnResizeHandle onResize={delta => setColDateWidth(colDateWidth - delta)} />
        <span style={{ width: colDateWidth }} className="flex-shrink-0 pl-1">Date</span>
        <ColumnResizeHandle onResize={delta => setColHashWidth(colHashWidth - delta)} />
        <span style={{ width: colHashWidth }} className="flex-shrink-0 pl-1">Hash</span>
      </div>

      {/* Virtual list */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        {/* Uncommitted changes row */}
        {hasUncommitted && (
          <div
            className={cn(
              'flex items-center h-7 px-3 text-xs cursor-default border-b border-border/30',
              'bg-warning/8 text-warning'
            )}
            style={{ height: ROW_HEIGHT }}
          >
            <span style={{ width: graphWidth }} className="flex-shrink-0" />
            <span className="flex-1 ml-2 font-medium">
              Uncommitted changes
              <span className="ml-2 font-normal text-text-muted">
                ({(status?.staged.length || 0)} staged, {(status?.unstaged.length || 0) + (status?.untracked.length || 0)} unstaged)
              </span>
            </span>
          </div>
        )}

        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {/* SVG graph layer */}
          {commits.length > 0 && (
            <CommitGraph
              commits={commits}
              totalLanes={totalLanes}
              startIndex={startIndex}
              endIndex={endIndex}
              scrollOffset={scrollTop - uncommittedOffset}
            />
          )}

          {/* Commit rows */}
          {virtualItems.map(virtualItem => (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <CommitRow
                commit={commits[virtualItem.index]}
                graphWidth={graphWidth}
                columnWidths={columnWidths}
                isSelected={selectedCommit === commits[virtualItem.index].hash}
                onClick={() => {
                  const hash = commits[virtualItem.index].hash;
                  const newHash = selectedCommit === hash ? null : hash;
                  selectCommit(newHash);
                  if (newHash) selectFile(null);
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
