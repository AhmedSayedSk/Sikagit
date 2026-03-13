import { useState } from 'react';
import { X, FolderOpen, AlertCircle, FolderSearch, Loader2, FolderKanban } from 'lucide-react';
import { useRepoStore } from '../../store/repoStore';
import { useProjectStore } from '../../store/projectStore';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { REPO_ICONS } from '../../lib/repoIcons';

interface AddRepoDialogProps {
  onClose: () => void;
}

export function AddRepoDialog({ onClose }: AddRepoDialogProps) {
  const [path, setPath] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const addRepo = useRepoStore(s => s.addRepo);
  const updateRepo = useRepoStore(s => s.updateRepo);
  const { projects, addRepoToProject } = useProjectStore();

  const toggleProject = (id: string) => {
    setSelectedProjectIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;

    setLoading(true);
    setError('');
    try {
      await addRepo(path.trim());

      const repos = useRepoStore.getState().repos;
      const newRepo = repos[repos.length - 1];

      const updates: { name?: string; avatar?: string } = {};
      if (displayName.trim()) updates.name = displayName.trim();
      if (selectedIcon) updates.avatar = selectedIcon;
      if (Object.keys(updates).length > 0) {
        await updateRepo(newRepo.id, updates);
      }

      for (const projectId of selectedProjectIds) {
        await addRepoToProject(projectId, newRepo.id);
      }

      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseClick = async () => {
    if (!('showDirectoryPicker' in window)) {
      setError('Your browser does not support the folder picker. Please type the path manually, or use Chrome/Edge.');
      return;
    }

    try {
      // @ts-expect-error showDirectoryPicker not yet in TS lib types
      const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
        mode: 'read',
      });

      const folderName = dirHandle.name;

      const fingerprint: string[] = [];
      try {
        for await (const [name] of dirHandle.entries()) {
          fingerprint.push(name);
          if (fingerprint.length >= 8) break;
        }
      } catch {
        // permission denied or empty
      }

      setResolving(true);
      setError('');

      try {
        const result = await api.resolveFolder(folderName, fingerprint);
        setPath(result.path);
      } catch {
        setPath(folderName);
        setError(`Could not auto-detect the full path for "${folderName}". Please type the full path manually.`);
      } finally {
        setResolving(false);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[480px] shadow-xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-accent" />
            <span className="text-sm font-medium">Add Repository</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Path */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Repository Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={e => setPath(e.target.value)}
                placeholder="D:\projects\my-repo or /home/user/my-repo"
                className="flex-1 bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                autoFocus
              />
              <button
                type="button"
                onClick={handleBrowseClick}
                disabled={resolving}
                className="px-3 py-2 rounded border bg-bg-primary border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
                title="Browse folders"
              >
                {resolving ? <Loader2 size={16} className="animate-spin" /> : <FolderSearch size={16} />}
              </button>
            </div>
            <p className="text-[0.625rem] text-text-muted mt-1">
              Type a path or click browse to open the file explorer
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Optional — defaults to folder name"
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Repository Type Icon */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Repository Type</label>
            <div className="flex flex-wrap gap-1.5">
              {REPO_ICONS.map(({ name: iconName, label, Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setSelectedIcon(selectedIcon === iconName ? '' : iconName)}
                  className={cn(
                    'w-9 h-9 rounded-md border flex items-center justify-center transition-all',
                    selectedIcon === iconName
                      ? 'border-accent bg-accent/15 text-accent scale-110'
                      : 'border-border/50 bg-bg-primary text-text-muted hover:text-text-primary hover:border-border hover:bg-bg-tertiary/30'
                  )}
                  title={label}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>

          {/* Project Assignment */}
          {projects.length > 0 && (
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">
                Assign to Projects ({selectedProjectIds.length} selected)
              </label>
              <div className="border border-border rounded bg-bg-primary max-h-36 overflow-y-auto">
                {projects.map(project => (
                  <label
                    key={project.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-bg-tertiary/30 transition-colors',
                      selectedProjectIds.includes(project.id) && 'bg-accent/5'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={() => toggleProject(project.id)}
                      className="accent-accent rounded"
                    />
                    {project.avatar ? (
                      <img src={project.avatar} alt="" className="w-4 h-4 rounded-sm object-cover flex-shrink-0" />
                    ) : (
                      <FolderKanban size={12} className="text-accent flex-shrink-0" />
                    )}
                    <span className="flex-1 truncate text-text-primary">{project.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-danger">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!path.trim() || loading || resolving}
              className="px-3 py-1.5 rounded text-xs font-medium bg-accent-emphasis hover:bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Adding...' : 'Add Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
