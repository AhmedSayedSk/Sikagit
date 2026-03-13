import { useState, useEffect, useRef } from 'react';
import { X, Settings, Upload, Trash2, Loader2 } from 'lucide-react';
import type { RepoBookmark, RepoConfig } from '@sikagit/shared';
import { useRepoStore } from '../../store/repoStore';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

interface RepoSettingsDialogProps {
  repo: RepoBookmark;
  onClose: () => void;
}

export function RepoSettingsDialog({ repo, onClose }: RepoSettingsDialogProps) {
  const updateRepo = useRepoStore(s => s.updateRepo);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Repo bookmark fields
  const [name, setName] = useState(repo.name);
  const [group, setGroup] = useState(repo.group || '');
  const [avatar, setAvatar] = useState(repo.avatar || '');

  // Git config fields
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.getGitConfig(repo.path)
      .then(config => {
        setUserName(config.userName || '');
        setUserEmail(config.userEmail || '');
        setRemoteUrl(config.remoteUrl || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [repo.path]);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const MAX = 128;
      let w = img.width;
      let h = img.height;
      if (w > MAX || h > MAX) {
        const scale = Math.min(MAX / w, MAX / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      setAvatar(canvas.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // Save repo bookmark settings
      await updateRepo(repo.id, {
        name: name.trim() || repo.name,
        group: group.trim() || undefined,
        avatar: avatar || undefined,
      });

      // Save git config
      const configs: [string, string][] = [
        ['user.name', userName.trim()],
        ['user.email', userEmail.trim()],
      ];
      for (const [key, value] of configs) {
        await api.setGitConfig(repo.path, key, value);
      }

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
          {/* Avatar / Logo */}
          <div>
            <label className="block text-xs text-text-secondary mb-2 font-medium">Repository Logo</label>
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors',
                  avatar ? 'border-border' : 'border-border hover:border-accent/40'
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatar ? (
                  <img src={avatar} alt="Logo" className="w-full h-full object-contain rounded-lg" />
                ) : (
                  <Upload size={20} className="text-text-muted" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-accent hover:underline"
                >
                  Upload image
                </button>
                {avatar && (
                  <button
                    type="button"
                    onClick={() => setAvatar('')}
                    className="text-xs text-danger hover:underline flex items-center gap-1"
                  >
                    <Trash2 size={10} /> Remove
                  </button>
                )}
                <span className="text-[0.625rem] text-text-muted">PNG, JPG, SVG. Max 512KB</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
          </div>

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

          {/* Group */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Group</label>
            <input
              type="text"
              value={group}
              onChange={e => setGroup(e.target.value)}
              placeholder="e.g. Work, Personal"
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
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

              {/* Remote URL (read-only info) */}
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Remote URL (origin)</label>
                <input
                  type="text"
                  value={remoteUrl}
                  readOnly
                  className="w-full bg-bg-tertiary/50 border border-border rounded px-3 py-2 text-sm text-text-muted cursor-default"
                />
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-border flex-shrink-0">
          <div className="text-xs">
            {error && <span className="text-danger">{error}</span>}
            {success && <span className="text-success">{success}</span>}
          </div>
          <div className="flex gap-2">
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
