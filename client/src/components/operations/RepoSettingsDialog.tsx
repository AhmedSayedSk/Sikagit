import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Settings, Loader2, CheckCircle2, XCircle, Bookmark, Play, GitBranch, FolderOpen } from 'lucide-react';
import type { RepoBookmark } from '@sikagit/shared';
import { useRepoStore } from '../../store/repoStore';
import { useStatusStore } from '../../store/statusStore';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { REPO_ICONS } from '../../lib/repoIcons';

interface RepoSettingsDialogProps {
  repo: RepoBookmark;
  onClose: () => void;
}

type Tab = 'general' | 'run' | 'git';

const tabs: { id: Tab; label: string; icon: typeof Bookmark }[] = [
  { id: 'general', label: 'General', icon: Bookmark },
  { id: 'run', label: 'Run & Build', icon: Play },
  { id: 'git', label: 'Git', icon: GitBranch },
];

type RemoteStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export function RepoSettingsDialog({ repo, onClose }: RepoSettingsDialogProps) {
  const updateRepo = useRepoStore(s => s.updateRepo);
  const fetchAll = useStatusStore(s => s.fetchAll);

  const [activeTab, setActiveTab] = useState<Tab>('general');

  // Repo bookmark fields
  const [name, setName] = useState(repo.name);
  const [selectedIcon, setSelectedIcon] = useState(repo.avatar || '');

  // Run command
  const [runCommand, setRunCommand] = useState(repo.runCommand || '');
  const [runPort, setRunPort] = useState(repo.runPort?.toString() || '');
  const [buildCommand, setBuildCommand] = useState(repo.buildCommand || '');

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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api.getGitConfig(repo.path)
      .then(config => {
        setUserName(config.userName || '');
        setUserEmail(config.userEmail || '');
        setRemoteUrl(config.remoteUrl || '');
        setOriginalRemoteUrl(config.remoteUrl || '');
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
      const parsedPort = runPort.trim() ? parseInt(runPort.trim(), 10) : null;
      await updateRepo(repo.id, {
        name: name.trim() || repo.name,
        avatar: selectedIcon || undefined,
        runCommand: runCommand.trim() || undefined,
        runPort: parsedPort && parsedPort >= 1024 && parsedPort <= 65535 ? parsedPort : null,
        buildCommand: buildCommand.trim() || undefined,
      });

      const configs: [string, string][] = [
        ['user.name', userName.trim()],
        ['user.email', userEmail.trim()],
      ];
      for (const [key, value] of configs) {
        await api.setGitConfig(repo.path, key, value);
      }

      if (remoteUrlChanged) {
        await api.setRemoteUrl(repo.path, remoteUrl.trim());
      }

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
        className="bg-bg-secondary border border-border rounded-lg w-[820px] h-[700px] shadow-xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-accent" />
            <span className="text-sm font-medium">Repository Settings</span>
            <span className="text-[0.6rem] text-text-muted font-mono">— {repo.name}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs + Content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Tab sidebar */}
          <div className="w-40 flex-shrink-0 border-r border-border bg-bg-primary/50 py-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                    activeTab === tab.id
                      ? 'bg-accent/10 text-accent border-r-2 border-accent font-medium'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/30'
                  )}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* ─── General Tab ─── */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-medium text-text-primary mb-1">Identity</h3>
                  <p className="text-[0.6rem] text-text-muted mb-3">Customize how this repository appears in the sidebar</p>
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

                {/* Path (read-only info) */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Local Path</label>
                  <div className="flex items-center gap-2">
                    <FolderOpen size={14} className="text-text-muted flex-shrink-0" />
                    <input
                      type="text"
                      value={repo.displayPath}
                      readOnly
                      className="w-full bg-bg-tertiary/50 border border-border rounded px-3 py-2 text-sm text-text-muted cursor-default font-mono text-xs"
                    />
                  </div>
                  {repo.isWSL && (
                    <p className="text-[0.55rem] text-accent/70 mt-1 flex items-center gap-1">
                      WSL filesystem
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ─── Run Tab ─── */}
            {activeTab === 'run' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-1">Run & Build</h3>
                  <p className="text-xs text-text-muted mb-3">Configure commands to run and build this project from the toolbar</p>
                </div>

                {/* Run + Build side by side */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5 font-medium">Run Command</label>
                    <input
                      type="text"
                      value={runCommand}
                      onChange={e => setRunCommand(e.target.value)}
                      placeholder="e.g. npm run dev"
                      className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-text-primary font-mono text-xs focus:outline-none focus:border-accent"
                    />
                    <p className="text-[0.65rem] text-text-muted mt-1">Play button in toolbar</p>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5 font-medium">Build Command</label>
                    <input
                      type="text"
                      value={buildCommand}
                      onChange={e => setBuildCommand(e.target.value)}
                      placeholder="e.g. npm run build"
                      className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-text-primary font-mono text-xs focus:outline-none focus:border-accent"
                    />
                    <p className="text-[0.65rem] text-text-muted mt-1">Build button in toolbar</p>
                  </div>
                </div>

                {/* Port */}
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Port</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={runPort}
                    onChange={e => setRunPort(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 8080 (auto-detect if empty)"
                    className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-text-primary font-mono text-xs focus:outline-none focus:border-accent"
                  />
                  <p className="text-[0.65rem] text-text-muted mt-1">
                    Fixed port for the dev server. Appends <code className="text-accent/80">--port</code> and sets <code className="text-accent/80">PORT</code> env.
                  </p>
                </div>

                {/* Environment info */}
                <div className="border border-border rounded-lg p-3.5 bg-bg-primary">
                  <p className="text-[0.7rem] text-text-muted mb-2.5 font-medium uppercase tracking-wider">Environment</p>
                  <div className="space-y-2.5 text-xs text-text-secondary">
                    <div className="flex items-center justify-between">
                      <span>Run target</span>
                      <span className={cn(
                        'px-2 py-0.5 rounded text-[0.65rem] font-medium',
                        repo.isWSL
                          ? 'bg-accent/10 text-accent'
                          : 'bg-success/10 text-success'
                      )}>
                        {repo.isWSL ? 'WSL' : 'Windows'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Working directory</span>
                      <span className="font-mono text-[0.65rem] text-text-muted max-w-[260px] truncate" title={repo.path}>
                        {repo.displayPath}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Port detection</span>
                      <span className="text-[0.65rem] text-text-muted">Automatic from output</span>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ─── Git Tab ─── */}
            {activeTab === 'git' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-medium text-text-primary mb-1">Git Configuration</h3>
                  <p className="text-[0.6rem] text-text-muted mb-3">These settings are saved to the repo's local .git/config</p>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-8 text-text-muted text-sm">
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
                  </>
                )}
              </div>
            )}
          </div>
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
