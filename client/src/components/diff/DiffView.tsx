import { useState } from 'react';
import { FileCode, ChevronRight, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { isImageFile } from './ImagePreview';

interface DiffViewProps {
  diff: string;
  repoPath?: string;
  commit?: string;
  /** If provided, enables Stage hunk / Discard hunk buttons */
  onStageHunk?: (hunkIndex: number, filePath: string) => void;
  onDiscardHunk?: (hunkIndex: number, filePath: string) => void;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk' | 'meta';
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

interface DiffHunk {
  header: string;
  startOld: number;
  endOld: number;
  startNew: number;
  endNew: number;
  lines: DiffLine[];
}

interface DiffFile {
  path: string;
  hunks: DiffHunk[];
}

function parseDiffFiles(raw: string): DiffFile[] {
  const lines = raw.split('\n');
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // New file
    if (line.startsWith('diff --git')) {
      // Extract file path from "diff --git a/path b/path"
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      const filePath = match ? match[2] : line;
      currentFile = { path: filePath, hunks: [] };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    // Meta lines (---, +++, index) — skip, they're represented by file header
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('index ')) {
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const startOld = parseInt(match[1], 10);
        const countOld = match[2] !== undefined ? parseInt(match[2], 10) : 1;
        const startNew = parseInt(match[3], 10);
        const countNew = match[4] !== undefined ? parseInt(match[4], 10) : 1;
        oldLine = startOld;
        newLine = startNew;
        currentHunk = {
          header: line,
          startOld,
          endOld: startOld + countOld - 1,
          startNew,
          endNew: startNew + countNew - 1,
          lines: [],
        };
        if (!currentFile) {
          currentFile = { path: 'unknown', hunks: [] };
          files.push(currentFile);
        }
        currentFile.hunks.push(currentHunk);
      }
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.substring(1),
        oldLineNo: null,
        newLineNo: newLine,
      });
      newLine++;
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.substring(1),
        oldLineNo: oldLine,
        newLineNo: null,
      });
      oldLine++;
    } else {
      const content = line.startsWith(' ') ? line.substring(1) : line;
      currentHunk.lines.push({
        type: 'context',
        content,
        oldLineNo: oldLine,
        newLineNo: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return files;
}

const lineStyles: Record<DiffLine['type'], string> = {
  add: 'bg-[var(--color-diff-add-bg)] text-text-primary',
  remove: 'bg-[var(--color-diff-remove-bg)] text-text-primary',
  context: 'text-text-secondary',
  hunk: '',
  meta: '',
};

const gutterStyles: Record<DiffLine['type'], string> = {
  add: 'text-text-secondary',
  remove: 'text-text-secondary',
  context: 'text-text-muted/60',
  hunk: '',
  meta: '',
};

const markerStyles: Record<DiffLine['type'], string> = {
  add: 'text-[var(--color-diff-add-marker)]',
  remove: 'text-[var(--color-diff-remove-marker)]',
  context: 'text-transparent',
  hunk: '',
  meta: '',
};

function DiffFileSection({ file, hunkStartIndex, repoPath, commit, onStageHunk, onDiscardHunk }: {
  file: DiffFile;
  hunkStartIndex: number;
  repoPath?: string;
  commit?: string;
  onStageHunk?: (hunkIndex: number, filePath: string) => void;
  onDiscardHunk?: (hunkIndex: number, filePath: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const diffFontSize = useUIStore(s => s.diffFontSize);
  const diffLineHeight = useUIStore(s => s.diffLineHeight);

  const addCount = file.hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'add').length, 0);
  const removeCount = file.hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'remove').length, 0);

  return (
    <div>
      {/* File header — clickable to toggle */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1 bg-bg-tertiary border-b border-border text-xs font-medium text-text-secondary cursor-pointer hover:bg-bg-tertiary/80 select-none"
      >
        {expanded
          ? <ChevronDown size={13} className="flex-shrink-0 text-text-muted" />
          : <ChevronRight size={13} className="flex-shrink-0 text-text-muted" />
        }
        <FileCode size={13} className="flex-shrink-0 text-text-muted" />
        <span className="truncate">{file.path}</span>
        <span className="ml-auto flex gap-2 text-[0.625rem] font-mono">
          {addCount > 0 && <span className="text-success">+{addCount}</span>}
          {removeCount > 0 && <span className="text-danger">-{removeCount}</span>}
        </span>
      </div>

      {/* Image preview for image files */}
      {expanded && isImageFile(file.path) && repoPath && (
        <div className="flex items-center gap-6 p-4 justify-center flex-wrap">
          {commit && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-[0.6rem] font-medium text-text-muted">Previous</span>
              <div className="border border-border rounded-lg p-2 bg-bg-primary">
                <img
                  src={`/api/v1/git/file?repo=${encodeURIComponent(repoPath)}&file=${encodeURIComponent(file.path)}&commit=${commit}~1`}
                  alt="Before"
                  className="max-w-[240px] max-h-[240px] object-contain rounded"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[0.6rem] font-medium text-text-muted">{commit ? 'Current' : 'Preview'}</span>
            <div className="border border-border rounded-lg p-2 bg-bg-primary">
              <img
                src={`/api/v1/git/file?repo=${encodeURIComponent(repoPath)}&file=${encodeURIComponent(file.path)}${commit ? `&commit=${commit}` : ''}`}
                alt={file.path}
                className="max-w-[240px] max-h-[240px] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}

      {/* Hunks — only shown when expanded */}
      {expanded && file.hunks.map((hunk, hi) => {
        const hunkIdx = hunkStartIndex + hi;
        return (
          <div key={hi}>
            {/* Hunk separator */}
            <div className="flex items-center justify-between px-3 py-0.5 bg-accent/5 border-y border-border/40">
              <span className="text-[0.6875rem] text-text-muted font-mono">
                Hunk {hi + 1} : Lines {hunk.startNew}-{hunk.endNew}
              </span>
              {(onStageHunk || onDiscardHunk) && (
                <div className="flex gap-2">
                  {onStageHunk && (
                    <button
                      onClick={() => onStageHunk(hunkIdx, file.path)}
                      className="px-2 py-0.5 text-[0.625rem] font-medium rounded border border-success/25 bg-success/10 text-success/80 hover:bg-success/20 hover:text-success hover:border-success/40 transition-colors"
                    >
                      Stage hunk
                    </button>
                  )}
                  {onDiscardHunk && (
                    <button
                      onClick={() => onDiscardHunk(hunkIdx, file.path)}
                      className="px-2 py-0.5 text-[0.625rem] font-medium rounded border border-danger/25 bg-danger/10 text-danger/80 hover:bg-danger/20 hover:text-danger hover:border-danger/40 transition-colors"
                    >
                      Discard hunk
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Diff lines */}
            <table className="w-full border-collapse font-mono tracking-tight" style={{ fontSize: diffFontSize, lineHeight: `${diffFontSize + diffLineHeight}px` }}>
              <tbody>
                {hunk.lines.map((line, li) => (
                  <tr key={li} className={lineStyles[line.type]}>
                    <td className={`w-7 px-0.5 text-right select-none border-r border-border/20 tabular-nums bg-bg-primary ${gutterStyles[line.type]}`}>
                      {line.oldLineNo ?? ''}
                    </td>
                    <td className={`w-7 px-0.5 text-right select-none border-r border-border/20 tabular-nums bg-bg-primary ${gutterStyles[line.type]}`}>
                      {line.newLineNo ?? ''}
                    </td>
                    <td className={`w-3 text-center select-none ${markerStyles[line.type]}`}>
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ''}
                    </td>
                    <td className="px-1.5 whitespace-pre tracking-tight">
                      {line.content}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function DiffView({ diff, repoPath, commit, onStageHunk, onDiscardHunk }: DiffViewProps) {
  if (!diff) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        No changes to display
      </div>
    );
  }

  const files = parseDiffFiles(diff);
  let globalHunkIndex = 0;

  return (
    <div className="overflow-auto h-full select-text">
      {files.map((file, fi) => {
        // Track hunk indices even when collapsed
        const fileHunkStart = globalHunkIndex;
        globalHunkIndex += file.hunks.length;

        return (
          <DiffFileSection
            key={fi}
            file={file}
            hunkStartIndex={fileHunkStart}
            repoPath={repoPath}
            commit={commit}
            onStageHunk={onStageHunk}
            onDiscardHunk={onDiscardHunk}
          />
        );
      })}
    </div>
  );
}
