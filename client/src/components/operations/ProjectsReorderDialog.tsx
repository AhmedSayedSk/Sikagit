import { useState } from 'react';
import { X, ListOrdered, GripVertical, FolderKanban } from 'lucide-react';
import { useProjectStore } from '../../store/projectStore';
import { cn } from '../../lib/utils';

interface ProjectsReorderDialogProps {
  onClose: () => void;
}

export function ProjectsReorderDialog({ onClose }: ProjectsReorderDialogProps) {
  const projects = useProjectStore(s => s.projects);
  const reorderProjects = useProjectStore(s => s.reorderProjects);

  const [order, setOrder] = useState<string[]>(projects.map(p => p.id));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const orderedProjects = order
    .map(id => projects.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const moveProject = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return;
    const ids = [...order];
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setOrder(ids);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await reorderProjects(order);
      onClose();
    } catch (err) {
      console.error('Failed to reorder projects:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-lg w-[480px] shadow-xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <ListOrdered size={16} className="text-accent" />
            <span className="text-sm font-medium">Reorder Projects</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-text-muted mb-2.5">
            Drag rows to change how projects appear in the sidebar.
          </p>
          {orderedProjects.length === 0 ? (
            <p className="text-xs text-text-muted p-6 text-center border border-dashed border-border rounded">
              No projects yet.
            </p>
          ) : (
            <div className="border border-border rounded bg-bg-primary overflow-hidden">
              {orderedProjects.map((project, idx) => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(e) => {
                    setDragIdx(idx);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIdx !== idx) setDragOverIdx(idx);
                  }}
                  onDragLeave={() => {
                    if (dragOverIdx === idx) setDragOverIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx !== null) moveProject(dragIdx, idx);
                    setDragIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragIdx(null);
                    setDragOverIdx(null);
                  }}
                  className={cn(
                    'flex items-center gap-2 px-2 py-2 text-xs border-b border-border last:border-b-0 cursor-grab active:cursor-grabbing transition-colors',
                    dragIdx === idx && 'opacity-40',
                    dragOverIdx === idx && dragIdx !== idx && 'bg-accent/10',
                    dragIdx !== idx && dragOverIdx !== idx && 'hover:bg-bg-tertiary/30'
                  )}
                >
                  <GripVertical size={13} className="text-text-muted flex-shrink-0" />
                  <span className="text-text-muted tabular-nums w-5 text-right flex-shrink-0">{idx + 1}</span>
                  {project.avatar ? (
                    <img src={project.avatar} alt="" className="w-4 h-4 rounded-sm object-contain flex-shrink-0" />
                  ) : (
                    <FolderKanban size={14} className="text-accent flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate text-text-primary">{project.name}</span>
                  <span className="text-text-muted text-[0.6rem]">{project.repoIds.length} repo{project.repoIds.length === 1 ? '' : 's'}</span>
                </div>
              ))}
            </div>
          )}
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
            disabled={saving || orderedProjects.length === 0}
            className="px-4 py-1.5 rounded text-xs font-medium bg-accent-emphasis hover:bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Order'}
          </button>
        </div>
      </div>
    </div>
  );
}
