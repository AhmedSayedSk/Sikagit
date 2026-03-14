import { useEffect, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useLogStore } from '../../store/logStore';
import { api } from '../../lib/api';
import { truncateHash } from '../../lib/utils';
import { DiffView } from '../diff/DiffView';

interface CommitDetailProps {
  repoPath: string;
}

export function CommitDetail({ repoPath }: CommitDetailProps) {
  const { commits, selectedCommit, selectCommit } = useLogStore();
  const commit = commits.find(c => c.hash === selectedCommit);
  const [diff, setDiff] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (commit) {
      api.getDiff(repoPath, commit.hash).then(setDiff).catch(() => setDiff(''));
    }
  }, [commit?.hash, repoPath]);

  if (!commit) return null;

  const copyHash = () => {
    navigator.clipboard.writeText(commit.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compact header with commit info */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 text-xs">
          <span className="font-medium truncate">{commit.message}</span>
        </div>
        <button
          onClick={() => selectCommit(null)}
          className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary flex-shrink-0 ml-2"
        >
          <X size={14} />
        </button>
      </div>

      {/* Compact metadata row */}
      <div className="flex items-center gap-4 px-3 py-1 border-b border-border/50 bg-bg-secondary/50 text-xs text-text-secondary flex-shrink-0 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="text-text-muted">Hash</span>
          <span className="font-mono">{truncateHash(commit.hash)}</span>
          <button onClick={copyHash} className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted">
            {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
          </button>
        </span>
        <span>
          <span className="text-text-muted">Author </span>
          {commit.authorName}
        </span>
        <span>
          <span className="text-text-muted">Date </span>
          {new Date(commit.authorDate).toLocaleString()}
        </span>
        {commit.parentHashes.length > 0 && (
          <span>
            <span className="text-text-muted">Parents </span>
            <span className="font-mono">{commit.parentHashes.map(h => truncateHash(h)).join(', ')}</span>
          </span>
        )}
      </div>

      {/* Diff takes remaining space */}
      <div className="flex-1 overflow-hidden">
        {diff ? (
          <DiffView diff={diff} repoPath={repoPath} commit={commit.hash} />
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Loading diff...
          </div>
        )}
      </div>
    </div>
  );
}
