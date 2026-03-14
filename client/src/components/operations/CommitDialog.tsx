import { useState } from 'react';
import { X, GitCommitHorizontal, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useStatusStore } from '../../store/statusStore';
import { useLogStore } from '../../store/logStore';
import { useUIStore } from '../../store/uiStore';
import { cn } from '../../lib/utils';

interface CommitDialogProps {
  repoPath: string;
  stagedCount: number;
  onClose: () => void;
}

export function CommitDialog({ repoPath, stagedCount, onClose }: CommitDialogProps) {
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');
  const fetchStatus = useStatusStore(s => s.fetchStatus);
  const fetchLog = useLogStore(s => s.fetchLog);
  const { aiEnabled, aiApiKey, aiModel } = useUIStore();

  const aiReady = aiEnabled && !!aiApiKey;

  const handleCommit = async () => {
    if (!message.trim() || stagedCount === 0) return;
    setCommitting(true);
    setError('');
    try {
      await api.commit(repoPath, message);
      fetchStatus(repoPath);
      fetchLog(repoPath);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const handleAiSuggest = async () => {
    if (!aiReady) return;
    setSuggesting(true);
    setError('');
    try {
      const result = await api.aiSuggest(repoPath, aiApiKey, aiModel);
      const msg = result.description
        ? `${result.title}\n\n${result.description}`
        : result.title;
      setMessage(msg);
    } catch (err: any) {
      setError(err.message || 'AI suggestion failed');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[480px] shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <GitCommitHorizontal size={16} className="text-accent" />
            <span className="text-sm font-medium">Commit Changes</span>
            <span className="text-xs text-text-muted">({stagedCount} staged)</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-text-secondary font-medium">Commit Message</label>
              {aiReady && (
                <button
                  onClick={handleAiSuggest}
                  disabled={suggesting || committing}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.65rem] font-medium text-accent hover:bg-accent/10 border border-accent/20 hover:border-accent/40 transition-colors disabled:opacity-40"
                >
                  {suggesting ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Sparkles size={11} />
                  )}
                  {suggesting ? 'Generating...' : 'AI Suggest'}
                </button>
              )}
            </div>
            <input
              type="text"
              value={message.split('\n')[0] || ''}
              onChange={e => {
                const rest = message.split('\n').slice(1).join('\n');
                setMessage(rest ? e.target.value + '\n' + rest : e.target.value);
              }}
              placeholder="Summary (required)"
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleCommit();
                }
              }}
            />
          </div>
          <div>
            <textarea
              value={message.split('\n').slice(1).join('\n')}
              onChange={e => {
                const summary = message.split('\n')[0] || '';
                setMessage(e.target.value ? summary + '\n' + e.target.value : summary);
              }}
              placeholder="Description (optional)"
              rows={4}
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-xs text-text-primary resize-none focus:outline-none focus:border-accent"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleCommit();
                }
              }}
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <p className="text-[0.625rem] text-text-muted">Press Ctrl+Enter to commit</p>
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
            onClick={handleCommit}
            disabled={!message.trim() || stagedCount === 0 || committing}
            className={cn(
              'px-4 py-1.5 rounded text-xs font-medium transition-colors',
              message.trim() && stagedCount > 0
                ? 'bg-accent-emphasis hover:bg-accent text-white cursor-pointer'
                : 'bg-bg-tertiary text-text-muted cursor-not-allowed'
            )}
          >
            {committing ? 'Committing...' : 'Commit'}
          </button>
        </div>
      </div>
    </div>
  );
}
