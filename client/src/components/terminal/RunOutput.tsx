import { useEffect, useRef, useState } from 'react';
import { X, Trash2, ExternalLink, ChevronDown, ChevronUp, Square } from 'lucide-react';
import { useRunStore } from '../../store/runStore';
import { parseAnsi } from '../../lib/ansi';

interface RunOutputProps {
  repoId: string;
  command: string;
  onClose: () => void;
}

function AnsiLine({ text }: { text: string }) {
  const segments = parseAnsi(text);
  return (
    <pre className="whitespace-pre-wrap break-all m-0">
      {segments.map((seg, i) =>
        Object.keys(seg.style).length > 0 ? (
          <span key={i} style={seg.style}>{seg.text}</span>
        ) : (
          seg.text
        )
      )}
    </pre>
  );
}

const EMPTY_OUTPUTS: string[] = [];

export function RunOutput({ repoId, command, onClose }: RunOutputProps) {
  const outputs = useRunStore(s => s.outputs[repoId]) ?? EMPTY_OUTPUTS;
  const isRunning = useRunStore(s => !!s.running[repoId]);
  const port = useRunStore(s => s.ports[repoId] ?? null);
  const runTarget = useRunStore(s => s.runTargets[repoId] ?? 'unknown');
  const stopRun = useRunStore(s => s.stopRun);
  const stopBuild = useRunStore(s => s.stopBuild);
  const clearRunOutput = useRunStore(s => s.clearOutput);
  const clearBuildOutput = useRunStore(s => s.clearBuildOutput);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  const isBuild = repoId.startsWith('build:');
  const actualRepoId = isBuild ? repoId.slice(6) : repoId;

  useEffect(() => {
    if (scrollRef.current && !collapsed) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputs, collapsed]);

  const handleStop = () => {
    if (isBuild) stopBuild(actualRepoId);
    else stopRun(actualRepoId);
  };

  const handleClear = () => {
    if (isBuild) clearBuildOutput(actualRepoId);
    else clearRunOutput(actualRepoId);
  };

  const handleClose = () => {
    handleClear();
    onClose();
  };

  const localUrl = port ? `http://localhost:${port}` : null;
  const envLabel = runTarget === 'wsl' ? 'WSL' : 'WIN';

  return (
    <div className="flex flex-col bg-[#1a1a2e]">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary border-b border-border flex-shrink-0 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        {/* Collapse toggle */}
        <span className="text-text-muted">
          {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>

        {/* Status dot + env tag */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isRunning ? 'bg-success' : 'bg-text-muted'}`} />
        <span className="text-[0.6rem] font-mono font-semibold text-text-muted tracking-wider">{envLabel}</span>

        {/* Separator */}
        <span className="w-px h-3 bg-border" />

        {/* Command */}
        <span className="text-[0.65rem] text-text-secondary font-mono truncate">{command}</span>

        {/* Port link */}
        {port && isRunning && (
          <>
            <span className="w-px h-3 bg-border" />
            <a
              href={localUrl!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-accent text-[0.6rem] font-mono hover:underline"
              title={`Open ${localUrl}`}
            >
              <ExternalLink size={9} />
              :{port}
            </a>
          </>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {isRunning && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-danger hover:bg-danger/10 transition-colors text-[0.6rem] font-medium"
              title={isBuild ? 'Stop build' : 'Stop server'}
            >
              <Square size={10} />
              <span>Stop</span>
            </button>
          )}
          <button
            onClick={handleClear}
            className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
            title="Clear output"
          >
            <Trash2 size={11} />
          </button>
          <button
            onClick={handleClose}
            className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
            title="Close"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Output (collapsible) */}
      {!collapsed && (
        <div ref={scrollRef} className="overflow-auto p-2 font-mono text-xs leading-relaxed text-[#c8d3f5]" style={{ height: 200 }}>
          {outputs.map((line, i) => (
            <AnsiLine key={i} text={line} />
          ))}
          {isRunning && outputs.length === 0 && (
            <span className="text-text-muted">Waiting for output...</span>
          )}
        </div>
      )}
    </div>
  );
}
