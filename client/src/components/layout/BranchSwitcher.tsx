import { useState, useRef, useEffect, useMemo } from 'react';
import { GitBranch, Check, ChevronDown, Search, Cloud, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useStatusStore } from '../../store/statusStore';
import { useLogStore } from '../../store/logStore';
import { useToastStore } from '../../store/toastStore';
import { cn } from '../../lib/utils';
import type { GitBranch as GitBranchType } from '@sikagit/shared';

// "remotes/origin/feature" -> "origin/feature"
const remoteLabel = (name: string) => name.replace(/^remotes\//, '');

/**
 * Repo-header branch picker: shows the current branch and, on click, a filterable
 * dropdown of all local + remote branches. Selecting one switches to it via the
 * safe /git/switch-branch endpoint (creates a tracking branch for remotes).
 */
export function BranchSwitcher({ repoPath }: { repoPath: string }) {
  const branches = useStatusStore(s => s.branches);
  const status = useStatusStore(s => s.status);
  const fetchAll = useStatusStore(s => s.fetchAll);
  const fetchLog = useLogStore(s => s.fetchLog);
  const addToast = useToastStore(s => s.addToast);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [switching, setSwitching] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = status?.current || branches.find(b => b.current)?.name || 'HEAD (detached)';

  const { local, remote } = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const match = (label: string) => !f || label.toLowerCase().includes(f);
    return {
      local: branches.filter(b => !b.isRemote && match(b.name)),
      remote: branches.filter(b => b.isRemote && match(remoteLabel(b.name))),
    };
  }, [branches, filter]);

  // Close on outside click / Escape; focus the filter when opening.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const switchTo = async (b: GitBranchType) => {
    if (b.current || switching) return;
    setSwitching(b.name);
    try {
      const { branch } = await api.switchBranch(repoPath, b.name);
      addToast('success', `Switched to ${branch}`);
      setOpen(false);
      setFilter('');
      fetchAll(repoPath);
      fetchLog(repoPath);
    } catch (err: any) {
      addToast('error', err?.message || 'Failed to switch branch');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        title={`Current branch: ${current} — click to switch`}
        className={cn(
          'flex items-center gap-1.5 max-w-[220px] px-2 py-1 rounded-md text-xs border bg-bg-primary transition-colors',
          open
            ? 'border-accent/50 text-text-primary'
            : 'border-border text-text-secondary hover:text-text-primary hover:border-accent/40'
        )}
      >
        <GitBranch size={12} className="text-accent flex-shrink-0" />
        <span className="truncate font-medium">{current}</span>
        <ChevronDown size={12} className="text-text-muted flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-40 w-[280px] bg-bg-primary border border-border rounded-md shadow-lg flex flex-col max-h-[380px]">
          {/* Filter */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border flex-shrink-0">
            <Search size={12} className="text-text-muted flex-shrink-0" />
            <input
              ref={inputRef}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter branches…"
              className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>

          <div className="overflow-y-auto py-1">
            <div className="px-3 py-1 text-[0.6rem] uppercase tracking-wider text-text-muted">Local</div>
            {local.length === 0 ? (
              <p className="px-3 py-1 text-[0.7rem] text-text-muted">No matching branches</p>
            ) : (
              local.map(b => (
                <BranchRow
                  key={b.name}
                  label={b.name}
                  active={b.current}
                  busy={switching === b.name}
                  onClick={() => switchTo(b)}
                />
              ))
            )}

            {remote.length > 0 && (
              <>
                <div className="px-3 py-1 mt-1 text-[0.6rem] uppercase tracking-wider text-text-muted border-t border-border/60">Remote</div>
                {remote.map(b => (
                  <BranchRow
                    key={b.name}
                    label={remoteLabel(b.name)}
                    remote
                    busy={switching === b.name}
                    onClick={() => switchTo(b)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BranchRow({ label, active, remote, busy, onClick }: {
  label: string;
  active?: boolean;
  remote?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={active || busy}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
        active
          ? 'text-accent cursor-default'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      )}
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin flex-shrink-0" />
      ) : active ? (
        <Check size={12} className="text-accent flex-shrink-0" />
      ) : remote ? (
        <Cloud size={12} className="text-text-muted flex-shrink-0" />
      ) : (
        <GitBranch size={12} className="text-text-muted flex-shrink-0" />
      )}
      <span className="truncate flex-1">{label}</span>
    </button>
  );
}
