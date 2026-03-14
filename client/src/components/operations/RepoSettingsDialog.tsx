import { useState, useEffect } from 'react';
import { X, Settings, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { RepoBookmark } from '@sikagit/shared';
import { useRepoStore } from '../../store/repoStore';
import { useStatusStore } from '../../store/statusStore';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { REPO_ICONS, getRepoIcon } from '../../lib/repoIcons';

interface RepoSettingsDialogProps {
  repo: RepoBookmark;
  onClose: () => void;
}

export function RepoSettingsDialog({ repo, onClose }: RepoSettingsDialogProps) {
  const updateRepo = useRepoStore(s => s.updateRepo);
  const fetchAll = useStatusStore(s => s.fetchAll);

  // Repo bookmark fields
  const [name, setName] = useState(repo.name);
  const [selectedIcon, setSelectedIcon] = useState(repo.avatar || '');

  // Git config fields
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');

  const [originalRemoteUrl, setOriginalRemoteUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    api.getGitConfig(repo.path)
      .then(config => {
        setUserName(config.userName || '');
        setUserEmail(config.userEmail || '');
        setRemoteUrl(config.remoteUrl || '');
        setOriginalRemoteUrl(config.remoteUrl || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [repo.path]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setWarning('');
    try {
      await updateRepo(repo.id, {
        name: name.trim() || repo.name,
        avatar: selectedIcon || undefined,
      });

      const configs: [string, string][] = [
        ['user.name', userName.trim()],
        ['user.email', userEmail.trim()],
      ];
      for (const [key, value] of configs) {
        await api.setGitConfig(repo.path, key, value);
      }

      // Update remote URL if changed
      if (remoteUrl.trim() !== originalRemoteUrl) {
        await api.setRemoteUrl(repo.path, remoteUrl.trim());

        // Test connection if a URL was set
        if (remoteUrl.trim()) {
          const result = await api.testRemote(repo.path);
          if (!result.ok) {
            // Save succeeds but warn user about connection
            setWarning('Remote URL saved but connection test failed. Please check the URL and try again.');
            setOriginalRemoteUrl(remoteUrl.trim());
            setSaving(false);
            fetchAll(repo.path);
            return;
          }
        }
      }

      // Refresh status so toolbar updates
      fetchAll(repo.path);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[520px] shadow-xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-accent" />
            <span className="text-sm font-medium">Repository Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Display name */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={repo.name}
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Icon */}
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

          {/* Divider */}
          <div className="border-t border-border pt-4">
            <span className="text-xs font-medium text-text-secondary">Git Configuration</span>
            <p className="text-[0.625rem] text-text-muted mt-0.5">These settings are saved to the repo's local .git/config</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-4 text-text-muted text-sm">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading config...
            </div>
          ) : (
            <>
              {/* Git user.name */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Author Name (user.name)</label>
                <input
                  type="text"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              {/* Git user.email */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Author Email (user.email)</label>
                <input
                  type="text"
                  value={userEmail}
                  onChange={e => setUserEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              {/* Remote URL */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Remote URL (origin)</label>
                <input
                  type="text"
                  value={remoteUrl}
                  onChange={e => setRemoteUrl(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary font-mono text-xs focus:outline-none focus:border-accent"
                />
                <p className="text-[0.6rem] text-text-muted mt-1">Set the origin remote URL to connect this repo to GitHub or another host</p>
              </div>

              {/* Path (read-only info) */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Local Path</label>
                <input
                  type="text"
                  value={repo.path}
                  readOnly
                  className="w-full bg-bg-tertiary/50 border border-border rounded px-3 py-2 text-sm text-text-muted cursor-default font-mono text-xs"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex-shrink-0 space-y-2">
          {error && (
            <p className="text-danger text-xs">{error}</p>
          )}
          {warning && (
            <p className="text-warning text-xs">{warning}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded text-xs font-medium bg-accent-emphasis hover:bg-accent text-white disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
