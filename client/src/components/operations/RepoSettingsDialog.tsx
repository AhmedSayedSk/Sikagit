import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Settings, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
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

type RemoteStatus = 'idle' | 'checking' | 'valid' | 'invalid';

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

  // Remote URL validation
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('idle');
  const [remoteError, setRemoteError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.getGitConfig(repo.path)
      .then(config => {
        setUserName(config.userName || '');
        setUserEmail(config.userEmail || '');
        setRemoteUrl(config.remoteUrl || '');
        setOriginalRemoteUrl(config.remoteUrl || '');
        // Mark existing remote as valid
        if (config.remoteUrl) setRemoteStatus('valid');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [repo.path]);

  const validateRemoteUrl = useCallback(async (url: string) => {
    if (!url.trim()) {
      setRemoteStatus('idle');
      setRemoteError('');
      return;
    }

    setRemoteStatus('checking');
    setRemoteError('');

    try {
      // Test the URL directly without modifying the remote
      const result = await api.testRemote(repo.path, url.trim());

      if (result.ok) {
        setRemoteStatus('valid');
        setRemoteError('');
      } else {
        setRemoteStatus('invalid');
        setRemoteError(result.error || 'Connection failed');
      }
    } catch {
      setRemoteStatus('invalid');
      setRemoteError('Failed to test connection');
    }
  }, [repo.path]);

  const handleRemoteUrlChange = (value: string) => {
    setRemoteUrl(value);
    setRemoteError('');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setRemoteStatus('idle');
      return;
    }

    if (value.trim() === originalRemoteUrl) {
      setRemoteStatus('valid');
      return;
    }

    setRemoteStatus('checking');
    debounceRef.current = setTimeout(() => {
      validateRemoteUrl(value);
    }, 800);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const remoteUrlChanged = remoteUrl.trim() !== originalRemoteUrl;
  const remoteBlocking = remoteUrlChanged && remoteUrl.trim() !== '' && remoteStatus !== 'valid';
  const canSave = !saving && !remoteBlocking;

  const handleSave = async () => {
    setSaving(true);
    setError('');
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

      // Update remote URL if changed (already set during validation, but ensure it's set)
      if (remoteUrlChanged) {
        await api.setRemoteUrl(repo.path, remoteUrl.trim());
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
                <div className="relative">
                  <input
                    type="text"
                    value={remoteUrl}
                    onChange={e => handleRemoteUrlChange(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    className={cn(
                      'w-full bg-bg-primary border rounded px-3 py-2 pr-9 text-sm text-text-primary font-mono text-xs focus:outline-none transition-colors',
                      remoteStatus === 'valid' ? 'border-success/50 focus:border-success' :
                      remoteStatus === 'invalid' ? 'border-danger/50 focus:border-danger' :
                      'border-border focus:border-accent'
                    )}
                  />
                  {/* Status icon */}
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {remoteStatus === 'checking' && <Loader2 size={14} className="animate-spin text-text-muted" />}
                    {remoteStatus === 'valid' && <CheckCircle2 size={14} className="text-success" />}
                    {remoteStatus === 'invalid' && <XCircle size={14} className="text-danger" />}
                  </div>
                </div>
                {remoteStatus === 'invalid' && remoteError && (
                  <p className="text-[0.6rem] text-danger mt-1">{remoteError}</p>
                )}
                {remoteStatus === 'checking' && (
                  <p className="text-[0.6rem] text-text-muted mt-1">Checking connection...</p>
                )}
                {remoteStatus === 'valid' && remoteUrlChanged && (
                  <p className="text-[0.6rem] text-success mt-1">Connected successfully</p>
                )}
                {remoteStatus === 'idle' && (
                  <p className="text-[0.6rem] text-text-muted mt-1">Set the origin remote URL to connect this repo to GitHub or another host</p>
                )}
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
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-3 py-1.5 rounded text-xs font-medium bg-accent-emphasis hover:bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
