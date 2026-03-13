import { useState } from 'react';
import { X, FolderOpen, AlertCircle, FolderSearch, Loader2 } from 'lucide-react';
import { useRepoStore } from '../../store/repoStore';
import { api } from '../../lib/api';

interface AddRepoDialogProps {
  onClose: () => void;
}

export function AddRepoDialog({ onClose }: AddRepoDialogProps) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const addRepo = useRepoStore(s => s.addRepo);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;

    setLoading(true);
    setError('');
    try {
      await addRepo(path.trim());
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseClick = async () => {
    // Use File System Access API — opens native OS folder picker
    // No file upload, no warnings, just a directory handle
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

      // Collect a small fingerprint of files inside (first few entries)
      const fingerprint: string[] = [];
      try {
        for await (const [name] of dirHandle.entries()) {
          fingerprint.push(name);
          if (fingerprint.length >= 8) break;
        }
      } catch {
        // permission denied or empty — still try to resolve by name
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
      // User cancelled the picker
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[480px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
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

        <form onSubmit={handleSubmit} className="p-4">
          <label className="block text-xs text-text-secondary mb-1.5">
            Repository path
          </label>
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

          {error && (
            <div className="flex items-center gap-2 mt-3 text-xs text-danger">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
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
