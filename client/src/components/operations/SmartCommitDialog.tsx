import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, GitCommitHorizontal, ChevronDown, ChevronRight, Pencil, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { useStatusStore } from '../../store/statusStore';
import { useLogStore } from '../../store/logStore';
import { useUIStore } from '../../store/uiStore';
import { useToastStore } from '../../store/toastStore';
import { cn } from '../../lib/utils';

interface SmartCommitDialogProps {
  repoPath: string;
  onClose: () => void;
}

interface CommitGroup {
  files: string[];
  title: string;
  description: string;
}

export function SmartCommitDialog({ repoPath, onClose }: SmartCommitDialogProps) {
  const { aiApiKey, aiModel } = useUIStore();
  const fetchStatus = useStatusStore(s => s.fetchStatus);
  const fetchLog = useLogStore(s => s.fetchLog);
  const addToast = useToastStore(s => s.addToast);

  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState<CommitGroup[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(0);
  const [editingGroup, setEditingGroup] = useState<number | null>(null);

  useEffect(() => {
    api.aiSmartCommitPreview(repoPath, aiApiKey, aiModel)
      .then(result => {
        setGroups(result.groups);
        setExpandedGroup(0);
      })
      .catch(err => setError(err.message || 'Failed to analyze changes'))
      .finally(() => setLoading(false));
  }, [repoPath, aiApiKey, aiModel]);

  const handleExecute = async () => {
    setExecuting(true);
    setError('');
    try {
      const result = await api.aiSmartCommitExecute(repoPath, groups);
      const commitCount = result.commits?.length || 0;
      addToast('success', `Created ${commitCount} commit${commitCount !== 1 ? 's' : ''}`);
      fetchStatus(repoPath);
      fetchLog(repoPath);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Smart commit failed');
    } finally {
      setExecuting(false);
    }
  };

  const updateGroupTitle = (idx: number, title: string) => {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, title } : g));
  };

  const updateGroupDescription = (idx: number, description: string) => {
    setGroups(prev => prev.map((g, i) => i === idx ? { ...g, description } : g));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[560px] shadow-xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            <span className="text-sm font-medium">Smart Commit</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="animate-spin text-accent" />
              <p className="text-sm text-text-secondary">Analyzing your changes...</p>
              <p className="text-[0.65rem] text-text-muted">AI is grouping related files into logical commits</p>
            </div>
          ) : error && groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm text-danger">{error}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[0.65rem] text-text-muted mb-3">
                AI suggests {groups.length} separate commit{groups.length !== 1 ? 's' : ''}. Review and edit before executing.
              </p>

              {groups.map((group, idx) => (
                <div key={idx} className="border border-border rounded-lg overflow-hidden">
                  {/* Group header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-bg-tertiary/50 cursor-pointer hover:bg-bg-tertiary/80"
                    onClick={() => setExpandedGroup(expandedGroup === idx ? null : idx)}
                  >
                    {expandedGroup === idx
                      ? <ChevronDown size={13} className="text-text-muted flex-shrink-0" />
                      : <ChevronRight size={13} className="text-text-muted flex-shrink-0" />
                    }
                    <GitCommitHorizontal size={13} className="text-accent flex-shrink-0" />
                    <span className="text-xs font-medium text-text-primary flex-1 truncate">
                      {group.title}
                    </span>
                    <span className="text-[0.6rem] text-text-muted flex-shrink-0">
                      {group.files.length} file{group.files.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setEditingGroup(editingGroup === idx ? null : idx); setExpandedGroup(idx); }}
                      className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-accent"
                    >
                      {editingGroup === idx ? <Check size={11} /> : <Pencil size={11} />}
                    </button>
                  </div>

                  {/* Expanded content */}
                  {expandedGroup === idx && (
                    <div className="p-3 space-y-2 border-t border-border/50">
                      {editingGroup === idx ? (
                        <>
                          <input
                            type="text"
                            value={group.title}
                            onChange={e => updateGroupTitle(idx, e.target.value)}
                            className="w-full bg-bg-primary border border-border rounded px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
                            placeholder="Commit title"
                          />
                          <textarea
                            value={group.description}
                            onChange={e => updateGroupDescription(idx, e.target.value)}
                            className="w-full bg-bg-primary border border-border rounded px-2.5 py-1.5 text-xs text-text-primary resize-none focus:outline-none focus:border-accent"
                            placeholder="Description (optional)"
                            rows={2}
                          />
                        </>
                      ) : group.description ? (
                        <p className="text-[0.65rem] text-text-secondary">{group.description}</p>
                      ) : null}

                      <div className="space-y-0.5">
                        {group.files.map(file => (
                          <div key={file} className="text-[0.65rem] font-mono text-text-muted px-1.5 py-0.5 rounded bg-bg-primary">
                            {file}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {error && groups.length > 0 && <p className="text-xs text-danger mt-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            Cancel
          </button>
          {!loading && groups.length > 0 && (
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-medium bg-accent-emphasis hover:bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {executing ? (
                <><Loader2 size={12} className="animate-spin" /> Committing...</>
              ) : (
                <><Sparkles size={12} /> Execute {groups.length} Commit{groups.length !== 1 ? 's' : ''}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
