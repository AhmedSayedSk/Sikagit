import { useEffect, useState, useCallback } from 'react';
import { X, FileText } from 'lucide-react';
import { useStatusStore } from '../../store/statusStore';
import { useConfirmStore } from '../../store/confirmStore';
import { api } from '../../lib/api';
import { DiffView } from './DiffView';
import { ImagePreview, isImageFile, isBinaryFile } from './ImagePreview';

interface FileDiffPanelProps {
  repoPath: string;
}

/**
 * Build a minimal patch string for a single hunk that git apply can understand.
 * We reconstruct from the raw diff text by extracting the relevant file header + hunk.
 */
function extractHunkPatch(rawDiff: string, hunkGlobalIndex: number): string | null {
  const lines = rawDiff.split('\n');
  let fileHeader = '';
  let currentHunkIdx = -1;
  let hunkStart = -1;
  let lastFileHeader = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff --git')) {
      lastFileHeader = line;
      // Collect ---, +++ lines
      let header = line + '\n';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('index ') || lines[j].startsWith('---') || lines[j].startsWith('+++')) {
          header += lines[j] + '\n';
        } else {
          break;
        }
      }
      fileHeader = header;
    } else if (line.startsWith('@@')) {
      currentHunkIdx++;
      if (currentHunkIdx === hunkGlobalIndex) {
        // Found the target hunk — collect all lines until next hunk or file
        let patch = fileHeader + line + '\n';
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('diff --git') || lines[j].startsWith('@@')) break;
          patch += lines[j] + '\n';
        }
        return patch;
      }
    }
  }
  return null;
}

export function FileDiffPanel({ repoPath }: FileDiffPanelProps) {
  const { selectedFile, selectedFileSource, selectFile, fetchStatus } = useStatusStore();
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const confirm = useConfirmStore(s => s.confirm);

  const loadDiff = useCallback(() => {
    if (!selectedFile || !selectedFileSource) return;
    setLoading(true);
    const fetchDiff = selectedFileSource === 'staged'
      ? api.getStagedDiff(repoPath, selectedFile)
      : api.getDiff(repoPath, undefined, selectedFile);

    fetchDiff
      .then(setDiff)
      .catch(() => setDiff(''))
      .finally(() => setLoading(false));
  }, [selectedFile, selectedFileSource, repoPath]);

  useEffect(() => {
    loadDiff();
  }, [loadDiff]);

  const handleStageHunk = useCallback(async (hunkIndex: number) => {
    const patch = extractHunkPatch(diff, hunkIndex);
    if (!patch) return;
    try {
      await api.stageHunk(repoPath, patch);
      await fetchStatus(repoPath);
      loadDiff();
    } catch (err) {
      console.error('Stage hunk failed:', err);
    }
  }, [diff, repoPath, fetchStatus, loadDiff]);

  const handleDiscardHunk = useCallback(async (hunkIndex: number) => {
    const patch = extractHunkPatch(diff, hunkIndex);
    if (!patch) return;
    try {
      await api.discardHunk(repoPath, patch);
      await fetchStatus(repoPath);
      loadDiff();
    } catch (err) {
      console.error('Discard hunk failed:', err);
    }
  }, [diff, repoPath, fetchStatus, loadDiff]);

  if (!selectedFile) return null;

  const showHunkActions = selectedFileSource === 'unstaged';

  // Server sentinel for oversized diffs (see gitService.ts DIFF_TOO_LARGE_MARKER).
  const isOversizeDiff = diff.startsWith('__SIKAGIT_DIFF_TOO_LARGE__');
  // Git's own marker for binary files, including the server's synthetic stub
  // for oversized/binary untracked files.
  const isBinaryDiff = /^(?:diff --git[^\n]*\n(?:[^\n]*\n)*?)?Binary files /m.test(diff);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-secondary flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-text-muted flex-shrink-0" />
          <span className="text-sm font-medium truncate">{selectedFile}</span>
          <span className="text-xs text-text-muted flex-shrink-0">
            ({selectedFileSource})
          </span>
        </div>
        <button
          onClick={() => selectFile(null)}
          className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Loading diff...
          </div>
        ) : isOversizeDiff ? (
          <div className="flex items-center justify-center h-full px-6 text-center text-text-muted text-sm">
            File is too large to display — preview suppressed to keep the app responsive.
          </div>
        ) : isBinaryFile(selectedFile) || (isBinaryDiff && !isImageFile(selectedFile)) ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Binary or oversized file — preview not available
          </div>
        ) : isImageFile(selectedFile) ? (
          <ImagePreview repoPath={repoPath} filePath={selectedFile} />
        ) : (
          <DiffView
            diff={diff}
            repoPath={repoPath}
            onStageHunk={showHunkActions ? handleStageHunk : undefined}
            onDiscardHunk={showHunkActions ? (async (hunkIndex: number) => {
              const confirmed = await confirm({
                title: 'Discard Hunk',
                message: 'Are you sure you want to discard this hunk? This action cannot be undone.',
                confirmLabel: 'Discard',
                variant: 'danger',
              });
              if (confirmed) handleDiscardHunk(hunkIndex);
            }) : undefined}
          />
        )}
      </div>
    </div>
  );
}
