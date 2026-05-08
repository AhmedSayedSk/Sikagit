import { useRef, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLogStore } from '../../store/logStore';
import { useStatusStore } from '../../store/statusStore';
import { useUIStore } from '../../store/uiStore';
import { useConfirmStore } from '../../store/confirmStore';
import { useToastStore } from '../../store/toastStore';
import { api } from '../../lib/api';
import { CommitRow } from './CommitRow';
import type { BranchAction } from './CommitRow';
import { CommitGraph, getGraphWidth, UncommittedNode } from '../graph/CommitGraph';
import { ColumnResizeHandle } from '../ui/ColumnResizeHandle';
import { cn, truncateHash } from '../../lib/utils';

interface CommitListProps {
  repoPath: string;
  onBranchAction?: (branch: string, action: BranchAction) => void;
}

const ROW_HEIGHT = 28;

export function CommitList({ repoPath, onBranchAction }: CommitListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { commits, totalLanes, loading, hasMore, loadMore, fetchLog, selectedCommit, selectCommit } = useLogStore();
  const { status, selectFile } = useStatusStore();
  const {
    colGraphWidth, setColGraphWidth,
    colTypeWidth, setColTypeWidth,
    colAuthorWidth, setColAuthorWidth,
    colDateWidth, setColDateWidth,
    colHashWidth, setColHashWidth,
  } = useUIStore();
  const confirm = useConfirmStore(s => s.confirm);
  const addToast = useToastStore(s => s.addToast);
  const fetchStatus = useStatusStore(s => s.fetchStatus);
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

  const columnWidths = { type: colTypeWidth, author: colAuthorWidth, date: colDateWidth, hash: colHashWidth };

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
        <ColumnResizeHandle onResize={delta => setColTypeWidth(colTypeWidth - delta)} />
        <span style={{ width: colTypeWidth }} className="flex-shrink-0 pl-1">Type</span>
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
              'relative flex items-center h-7 px-3 text-xs cursor-pointer border-b border-border/30 transition-colors',
              selectedCommit === '__uncommitted__'
                ? 'bg-warning/20 text-warning'
                : 'bg-warning/8 text-warning hover:bg-warning/12'
            )}
            style={{ height: ROW_HEIGHT }}
            onClick={() => {
              const next = selectedCommit === '__uncommitted__' ? null : '__uncommitted__';
              selectCommit(next);
              if (next) selectFile(null);
            }}
          >
            {commits[0] && (
              <UncommittedNode
                lane={commits[0].lane}
                colorIndex={commits[0].laneColor}
                width={graphWidth}
              />
            )}
            <span style={{ width: graphWidth }} className="flex-shrink-0" />
            <span className="flex-1 truncate ml-2 font-medium">
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
              hasUncommitted={!!hasUncommitted}
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
                overflow: 'hidden',
              }}
            >
              <CommitRow
                commit={commits[virtualItem.index]}
                graphWidth={graphWidth}
                onBranchAction={onBranchAction}
                columnWidths={columnWidths}
                isSelected={selectedCommit === commits[virtualItem.index].hash}
                onClick={() => {
                  const hash = commits[virtualItem.index].hash;
                  const newHash = selectedCommit === hash ? null : hash;
                  selectCommit(newHash);
                  if (newHash) selectFile(null);
                }}
                onDoubleClick={async () => {
                  const commit = commits[virtualItem.index];
                  if (commit.isHead) return;
                  const confirmed = await confirm({
                    title: 'Checkout Commit',
                    message: `Move the current branch to commit ${truncateHash(commit.hash)}?\n\n"${commit.message}"\n\nThis will reset your branch to this commit. You can then force push to update the remote.`,
                    confirmLabel: 'Checkout',
                    variant: 'warning',
                  });
                  if (!confirmed) return;
                  try {
                    const { branch } = await api.checkout(repoPath, commit.hash);
                    addToast('success', `Switched to ${branch} at ${truncateHash(commit.hash)}`);
                    await fetchStatus(repoPath);
                    await fetchLog(repoPath);
                  } catch (err: any) {
                    addToast('error', err.message);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
