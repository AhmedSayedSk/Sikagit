import { GitBranch, ArrowUp, ArrowDown } from 'lucide-react';
import { useStatusStore } from '../../store/statusStore';

export function StatusBar() {
  const status = useStatusStore(s => s.status);

  return (
    <div className="h-6 bg-bg-secondary border-t border-border flex items-center px-3 text-xs text-text-secondary gap-4">
      {status && (
        <>
          <div className="flex items-center gap-1">
            <GitBranch size={12} />
            <span>{status.current || 'detached'}</span>
          </div>
          {status.tracking && (
            <div className="flex items-center gap-2">
              {status.ahead > 0 && (
                <span className="flex items-center gap-0.5">
                  <ArrowUp size={10} />
                  {status.ahead}
                </span>
              )}
              {status.behind > 0 && (
                <span className="flex items-center gap-0.5">
                  <ArrowDown size={10} />
                  {status.behind}
                </span>
              )}
            </div>
          )}
          {status.files.length > 0 && (
            <span>{status.files.length} changed</span>
          )}
        </>
      )}
      <div className="flex-1" />
      <span className="text-text-muted">SikaGit</span>
    </div>
  );
}
