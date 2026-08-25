import { useEffect, useRef, useState } from 'react';
import { ChevronDown, EyeOff } from 'lucide-react';
import type { DiffWhitespaceMode, DiffWhitespaceSuppression } from '@sikagit/shared';
import { useUIStore } from '../../store/uiStore';

const MODES: { value: DiffWhitespaceMode; label: string; hint: string }[] = [
  { value: 'none', label: 'None', hint: 'Raw git diff — show every difference' },
  { value: 'eol', label: 'Line endings', hint: 'Hide CRLF ↔ LF churn (--ignore-cr-at-eol)' },
  { value: 'all', label: 'All whitespace', hint: 'Also hide indentation and blank-line changes' },
];

const SHORT_LABEL: Record<DiffWhitespaceMode, string> = {
  none: 'none',
  eol: 'EOL',
  all: 'all',
};

/**
 * Header control for the diff whitespace filter. The setting is global (stored
 * in uiStore) so the file panel and the commit detail always agree.
 */
export function DiffWhitespaceToggle() {
  const mode = useUIStore(s => s.diffWhitespace);
  const setMode = useUIStore(s => s.setDiffWhitespace);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        title="Which whitespace differences to hide in diffs"
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[0.625rem] font-medium transition-colors ${
          mode === 'none'
            ? 'border-border bg-bg-tertiary text-text-muted hover:text-text-secondary'
            : 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20'
        }`}
      >
        <EyeOff size={11} />
        <span>Ignore: {SHORT_LABEL[mode]}</span>
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-bg-primary shadow-lg overflow-hidden">
          {MODES.map(m => (
            <button
              key={m.value}
              onClick={() => { setMode(m.value); setOpen(false); }}
              className={`w-full text-left px-2.5 py-1.5 hover:bg-bg-tertiary transition-colors ${
                m.value === mode ? 'bg-accent/10' : ''
              }`}
            >
              <div className={`text-[0.7rem] font-medium ${m.value === mode ? 'text-accent' : 'text-text-primary'}`}>
                {m.label}
              </div>
              <div className="text-[0.625rem] text-text-muted leading-snug">{m.hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function summarize(suppressed: DiffWhitespaceSuppression[]) {
  const lines = suppressed.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const wholly = suppressed.filter(f => f.whollySuppressed).length;
  return { lines, wholly, files: suppressed.length };
}

/**
 * Banner explaining that the diff on screen is smaller than what git reports,
 * so a filtered diff is never silently misleading. Renders nothing when the
 * filter removed nothing.
 */
export function WhitespaceSuppressionNotice({
  suppressed,
  mode,
}: {
  suppressed: DiffWhitespaceSuppression[];
  mode: DiffWhitespaceMode;
}) {
  const setMode = useUIStore(s => s.setDiffWhitespace);
  if (mode === 'none' || suppressed.length === 0) return null;

  const { lines, wholly, files } = summarize(suppressed);
  const what = mode === 'eol' ? 'Line-ending' : 'Whitespace';

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 bg-warning/10 border-b border-warning/25 text-[0.6875rem] text-text-secondary">
      <EyeOff size={12} className="flex-shrink-0 mt-0.5 text-warning" />
      <div className="min-w-0 flex-1">
        <span className="text-text-primary font-medium">
          {what}-only changes hidden
        </span>
        {' — '}
        {lines.toLocaleString()} line{lines !== 1 ? 's' : ''} across {files} file{files !== 1 ? 's' : ''}
        {wholly > 0 && `, ${wholly} of which changed nothing else`}.
        {mode === 'eol' && (
          <span className="text-text-muted"> Line endings were rewritten (CRLF ↔ LF).</span>
        )}
      </div>
      <button
        onClick={() => setMode('none')}
        className="flex-shrink-0 px-1.5 py-0.5 rounded border border-border bg-bg-tertiary text-[0.625rem] text-text-secondary hover:text-text-primary transition-colors"
      >
        Show all
      </button>
    </div>
  );
}
