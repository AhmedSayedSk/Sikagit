import { useRef, useState } from 'react';
import { X, FolderKanban, Upload, Trash2 } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { useRepoStore } from '../../store/repoStore';
import { cn } from '../../lib/utils';
import type { Project } from '@sikagit/shared';

interface ProjectDialogProps {
  project?: Project;
  onClose: () => void;
}

export function ProjectDialog({ project, onClose }: ProjectDialogProps) {
  const repos = useRepoStore(s => s.repos);
  const { createProject, updateProject, fetchProjects } = useProjectStore();

  const [name, setName] = useState(project?.name || '');
  const [avatar, setAvatar] = useState<string | undefined>(project?.avatar);
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>(project?.repoIds || []);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleRepo = (id: string) => {
    setSelectedRepoIds(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    e.target.value = '';
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (project) {
        await updateProject(project.id, { name: name.trim(), avatar: avatar || '', repoIds: selectedRepoIds });
      } else {
        await createProject(name.trim(), selectedRepoIds, avatar || undefined);
      }
      await fetchProjects();
      onClose();
    } catch (err) {
      console.error('Failed to save project:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[440px] shadow-xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <FolderKanban size={16} className="text-accent" />
            <span className="text-sm font-medium">{project ? 'Edit Project' : 'New Project'}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. My App, E-commerce Platform"
              className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          {/* Avatar */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Project Image</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              {avatar ? (
                <img src={avatar} alt="Project" className="w-10 h-10 rounded-md object-cover border border-border" />
              ) : (
                <div className="w-10 h-10 rounded-md border border-dashed border-border flex items-center justify-center bg-bg-primary">
                  <FolderKanban size={16} className="text-text-muted" />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded text-xs border border-border bg-bg-primary text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors flex items-center gap-1.5"
                >
                  <Upload size={11} />
                  {avatar ? 'Change' : 'Upload'}
                </button>
                {avatar && (
                  <button
                    onClick={() => setAvatar(undefined)}
                    className="px-2.5 py-1.5 rounded text-xs border border-border bg-bg-primary text-text-secondary hover:text-danger hover:border-danger/40 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 size={11} />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Repos */}
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">
              Repositories ({selectedRepoIds.length} selected)
            </label>
            <div className="border border-border rounded bg-bg-primary max-h-48 overflow-y-auto">
              {repos.length === 0 ? (
                <p className="text-xs text-text-muted p-3 text-center">No repositories added yet</p>
              ) : (
                repos.map(repo => (
                  <label
                    key={repo.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-bg-tertiary/30 transition-colors',
                      selectedRepoIds.includes(repo.id) && 'bg-accent/5'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRepoIds.includes(repo.id)}
                      onChange={() => toggleRepo(repo.id)}
                      className="accent-accent rounded"
                    />
                    <span className="flex-1 truncate text-text-primary">{repo.name}</span>
                    <span className="text-text-muted truncate text-[0.6rem]">{repo.displayPath}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-1.5 rounded text-xs font-medium bg-accent-emphasis hover:bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : project ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
