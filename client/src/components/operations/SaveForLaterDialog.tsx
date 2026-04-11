import { useState } from 'react';
import { X, Archive, Loader2, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useStatusStore } from '../../store/statusStore';
import { useUIStore } from '../../store/uiStore';
import { useToastStore } from '../../store/toastStore';
import { cn } from '../../lib/utils';
import { getFileIcon } from '../../lib/fileIcons';
import type { GitFileStatus } from '@sikagit/shared';
import { FilePlus2, FilePen, FileX2, FileSymlink, FileQuestion, FileWarning } from 'lucide-react';

function getStatusIcon(index: string, workingDir: string) {
  if (index === 'U' || workingDir === 'U') return { Icon: FileWarning, color: 'text-[var(--color-status-conflict)]', label: 'Conflicted' };
  if (index === 'M' || workingDir === 'M') return { Icon: FilePen, color: 'text-[var(--color-status-modified)]', label: 'Modified' };
  if (index === 'A') return { Icon: FilePlus2, color: 'text-[var(--color-status-added)]', label: 'Added' };
  if (index === 'D' || workingDir === 'D') return { Icon: FileX2, color: 'text-[var(--color-status-deleted)]', label: 'Deleted' };
  if (index === 'R') return { Icon: FileSymlink, color: 'text-[var(--color-status-renamed)]', label: 'Renamed' };
  if (index === '?') return { Icon: FilePlus2, color: 'text-[var(--color-status-untracked)]', label: 'New' };
  return { Icon: FileQuestion, color: 'text-[var(--color-status-untracked)]', label: 'Unknown' };
}

interface SaveForLaterDialogProps {
  repoPath: string;
  files: GitFileStatus[];
  onClose: () => void;
}

function generateBranchName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `save/${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function SaveForLaterDialog({ repoPath, files, onClose }: SaveForLaterDialogProps) {
  const [branchName, setBranchName] = useState(generateBranchName);
  const filePaths = files.map(f => f.path);
  const [message, setMessage] = useState(`Shelve: ${files.length} file${files.length !== 1 ? 's' : ''}`);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');
  const fetchAll = useStatusStore(s => s.fetchAll);
  const clearChecked = useStatusStore(s => s.clearChecked);
  const addToast = useToastStore(s => s.addToast);
  const { aiEnabled, aiApiKey, aiModel } = useUIStore();

  const aiReady = aiEnabled && !!aiApiKey;

  const newCount = files.filter(f => f.index === '?' || f.index === 'A').length;
  const modifiedCount = files.filter(f => f.index === 'M' || f.workingDir === 'M').length;
  const deletedCount = files.filter(f => f.index === 'D' || f.workingDir === 'D').length;

  const handleAiSuggest = async () => {
    if (!aiReady) return;
    setSuggesting(true);
    setError('');
    try {
      const result = await api.aiSuggestSaveForLater(repoPath, aiApiKey, aiModel, filePaths);
      setBranchName(result.branchName);
      setMessage(result.message);
    } catch (err: any) {
      setError(err.message || 'AI suggestion failed');
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = async () => {
    if (!branchName.trim() || filePaths.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.saveForLater(repoPath, filePaths, branchName.trim(), message.trim() || `Shelve ${files.length} files`);
      clearChecked();
      fetchAll(repoPath);
      addToast('success', `Saved ${files.length} file${files.length !== 1 ? 's' : ''} to branch "${result.branch}"`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[860px] shadow-xl flex flex-col max-h-[60vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Archive size={16} className="text-accent" />
            <span className="text-sm font-medium">Shelve Changes</span>
            <span className="text-xs text-text-muted">({files.length} file{files.length !== 1 ? 's' : ''})</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content — two-column layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: form fields */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto border-r border-border">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-text-secondary font-medium">Branch Name</label>
                {aiReady && (
                  <button
                    onClick={handleAiSuggest}
                    disabled={suggesting || saving}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.65rem] font-medium text-accent hover:bg-accent/10 border border-accent/20 hover:border-accent/40 transition-colors disabled:opacity-40"
                  >
                    {suggesting ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Sparkles size={11} />
                    )}
                    {suggesting ? 'Suggesting...' : 'AI Suggest'}
                  </button>
                )}
              </div>
              <input
                type="text"
                value={branchName}
                onChange={e => setBranchName(e.target.value)}
                placeholder="save/my-feature"
                disabled={suggesting}
                className={cn(
                  "w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent",
                  suggesting && "opacity-50 cursor-not-allowed"
                )}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
                }}
              />
            </div>
            <div className="flex flex-col flex-1">
              <label className="text-xs text-text-secondary font-medium mb-1.5">Commit Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Describe what these changes are for..."
                rows={4}
                disabled={suggesting}
                className={cn(
                  "w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary resize-none focus:outline-none focus:border-accent",
                  suggesting && "opacity-50 cursor-not-allowed"
                )}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
                }}
              />
            </div>

            <div className="flex items-center gap-1.5">
              {newCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-[var(--color-status-untracked)]/15 text-[var(--color-status-untracked)]">
                  +{newCount} new
                </span>
              )}
              {modifiedCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-[var(--color-status-modified)]/15 text-[var(--color-status-modified)]">
                  ~{modifiedCount} modified
                </span>
              )}
              {deletedCount > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[0.6rem] font-medium bg-[var(--color-status-deleted)]/15 text-[var(--color-status-deleted)]">
                  -{deletedCount} deleted
                </span>
              )}
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}
            <p className="text-[0.625rem] text-text-muted">
              Selected files will be committed to a new branch and removed from your working directory. Press Ctrl+Enter to save.
            </p>
          </div>

          {/* Right: file list */}
          <div className="w-[260px] flex flex-col overflow-hidden">
            <div className="px-3 py-2 text-xs font-medium text-text-secondary border-b border-border flex-shrink-0 flex items-center justify-between">
              <span>Files</span>
              <span className="text-text-muted">{files.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {files.map(f => {
                const { Icon: StatusIcon, color: statusColor, label: statusLabel } = getStatusIcon(f.index, f.workingDir);
                const { Icon: TypeIcon, color: typeColor, label: typeLabel } = getFileIcon(f.path);
                return (
                  <div key={f.path} className="flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-bg-tertiary/30" title={f.path}>
                    <span title={statusLabel} className="flex-shrink-0"><StatusIcon size={12} className={statusColor} /></span>
                    <span title={typeLabel} className="flex-shrink-0" style={{ color: typeColor }}><TypeIcon size={12} /></span>
                    <span className="text-text-primary truncate">{f.path}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!branchName.trim() || files.length === 0 || saving}
            className={cn(
              'px-4 py-1.5 rounded text-xs font-medium transition-colors',
              branchName.trim() && files.length > 0
                ? 'bg-accent-emphasis hover:bg-accent text-white cursor-pointer'
                : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
            )}
          >
            {saving ? 'Shelving...' : 'Shelve'}
          </button>
        </div>
      </div>
    </div>
  );
}
