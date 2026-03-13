import { useState } from 'react';
import { GitBranch, Plus, Trash2, FolderGit2, Settings, SlidersHorizontal } from 'lucide-react';
import { useRepoStore } from '../../store/repoStore';
import { AddRepoDialog } from '../operations/AddRepoDialog';
import { RepoSettingsDialog } from '../operations/RepoSettingsDialog';
import { AppSettingsDialog } from '../operations/AppSettingsDialog';
import { cn } from '../../lib/utils';
import type { RepoBookmark } from '@sikagit/shared';

export function Sidebar() {
  const { repos, activeRepoId, setActiveRepo, removeRepo } = useRepoStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [settingsRepo, setSettingsRepo] = useState<RepoBookmark | null>(null);
  const [showAppSettings, setShowAppSettings] = useState(false);

  return (
    <aside className="h-full bg-bg-secondary flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FolderGit2 size={16} className="text-accent" />
          <span className="text-sm font-semibold">Repositories</span>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="p-1 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
          title="Add repository"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {repos.length === 0 ? (
          <div className="px-3 py-8 text-center text-text-muted text-sm">
            <GitBranch size={32} className="mx-auto mb-2 opacity-50" />
            <p>No repositories</p>
            <p className="text-xs mt-1">Click + to add one</p>
          </div>
        ) : (
          repos.map(repo => (
            <div
              key={repo.id}
              className={cn(
                'group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors',
                activeRepoId === repo.id
                  ? 'bg-accent-emphasis/20 text-accent'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              )}
              onClick={() => setActiveRepo(repo.id)}
            >
              {/* Avatar or fallback icon */}
              {repo.avatar ? (
                <img
                  src={repo.avatar}
                  alt=""
                  className="h-6 max-w-[40px] rounded flex-shrink-0 object-contain"
                />
              ) : (
                <GitBranch size={14} className="flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{repo.name}</div>
                <div className="truncate text-xs text-text-muted">{repo.displayPath}</div>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={e => { e.stopPropagation(); setSettingsRepo(repo); }}
                  className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
                  title="Settings"
                >
                  <Settings size={12} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); removeRepo(repo.id); }}
                  className="p-0.5 rounded hover:bg-danger/20 text-text-muted hover:text-danger"
                  title="Remove repository"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer with app settings */}
      <div className="border-t border-border px-3 py-2 flex items-center justify-between">
        <span className="text-[0.625rem] text-text-muted">SikaGit</span>
        <button
          onClick={() => setShowAppSettings(true)}
          className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
          title="App Settings"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {showAddDialog && <AddRepoDialog onClose={() => setShowAddDialog(false)} />}
      {settingsRepo && <RepoSettingsDialog repo={settingsRepo} onClose={() => setSettingsRepo(null)} />}
      {showAppSettings && <AppSettingsDialog onClose={() => setShowAppSettings(false)} />}
    </aside>
  );
}
