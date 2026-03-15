import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, FolderGit2, SlidersHorizontal, FolderKanban, ChevronRight, GitBranch, Pencil } from 'lucide-react';
import { getRepoIcon } from '../../lib/repoIcons';
import { useRepoStore } from '../../store/repoStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { AddRepoDialog } from '../operations/AddRepoDialog';
import { AppSettingsDialog } from '../operations/AppSettingsDialog';
import { ProjectDialog } from '../operations/ProjectDialog';
import { useConfirmStore } from '../../store/confirmStore';
import { cn } from '../../lib/utils';
import type { RepoBookmark, Project } from '@sikagit/shared';

function CollapsiblePanel({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(expanded ? undefined : 0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setHeight(expanded ? undefined : 0);
      return;
    }
    const el = contentRef.current;
    if (!el) return;
    if (expanded) {
      const scrollH = el.scrollHeight;
      setHeight(0);
      requestAnimationFrame(() => {
        setHeight(scrollH);
        const onEnd = () => { setHeight(undefined); el.removeEventListener('transitionend', onEnd); };
        el.addEventListener('transitionend', onEnd);
      });
    } else {
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [expanded]);

  return (
    <div
      ref={contentRef}
      style={{ height: height !== undefined ? height : 'auto', overflow: 'hidden', transition: 'height 200ms ease' }}
    >
      {children}
    </div>
  );
}

const DRAG_THRESHOLD = 5; // px of movement before drag activates

function DraggableRepoList({ projectRepos, repoIds, activeRepoId, onSelectRepo, onReorderRepos }: {
  projectRepos: RepoBookmark[];
  repoIds: string[];
  activeRepoId: string | null;
  onSelectRepo: (id: string) => void;
  onReorderRepos: (repoIds: string[]) => void;
}) {
  const [dragState, setDragState] = useState<{
    fromIdx: number;
    toIdx: number;
    offsetY: number;   // cursor offset from top of dragged item
    currentY: number;  // current cursor Y
    startRect: DOMRect; // original rect of dragged item
    rects: DOMRect[];  // snapshot of all item rects at drag start
  } | null>(null);

  const dragRef = useRef<typeof dragState>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const repoIdsRef = useRef(repoIds);
  repoIdsRef.current = repoIds;
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    // Only left click
    if (e.button !== 0) return;
    e.preventDefault();

    const rowEl = rowRefs.current[idx];
    if (!rowEl) return;

    const startRect = rowEl.getBoundingClientRect();
    const startY = e.clientY;
    const offsetY = e.clientY - startRect.top;
    let activated = false;

    // Snapshot all rects at start
    const rects = rowRefs.current.map(el => el?.getBoundingClientRect() ?? new DOMRect());

    const activate = () => {
      activated = true;
      const state = {
        fromIdx: idx,
        toIdx: idx,
        offsetY,
        currentY: startY,
        startRect,
        rects,
      };
      dragRef.current = state;
      setDragState(state);
    };

    const handleMove = (ev: PointerEvent) => {
      if (!activated) {
        // Check threshold
        if (Math.abs(ev.clientY - startY) >= DRAG_THRESHOLD) {
          activate();
        } else {
          return;
        }
      }

      // Find closest drop target by midpoint
      let closest = idx;
      let minDist = Infinity;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const midY = r.top + r.height / 2;
        const dist = Math.abs(ev.clientY - midY);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }

      const state = {
        fromIdx: idx,
        toIdx: closest,
        offsetY,
        currentY: ev.clientY,
        startRect,
        rects,
      };
      dragRef.current = state;
      setDragState(state);
    };

    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);

      if (!activated) {
        // It was a click, not a drag
        onSelectRepo(projectRepos[idx].id);
        return;
      }

      const drag = dragRef.current;
      if (drag && drag.fromIdx !== drag.toIdx) {
        const ids = [...repoIdsRef.current];
        const [moved] = ids.splice(drag.fromIdx, 1);
        ids.splice(drag.toIdx, 0, moved);
        onReorderRepos(ids);
      }

      dragRef.current = null;
      setDragState(null);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [onSelectRepo, onReorderRepos, projectRepos]);

  // Compute translateY for each item during drag
  const getItemStyle = (idx: number): React.CSSProperties => {
    if (!dragState) return {};
    const { fromIdx, toIdx, currentY, offsetY, startRect, rects } = dragState;

    if (idx === fromIdx) {
      // The dragged item: follows the cursor
      const dragY = currentY - offsetY - startRect.top;
      return {
        transform: `translateY(${dragY}px) scale(1.02)`,
        zIndex: 50,
        position: 'relative',
        transition: 'none',
        opacity: 1,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      };
    }

    // Other items: shift up or down to make room
    const itemH = rects[fromIdx]?.height ?? 0;
    if (fromIdx < toIdx) {
      // Dragging down: items between from+1..to shift up
      if (idx > fromIdx && idx <= toIdx) {
        return { transform: `translateY(${-itemH}px)`, transition: 'transform 200ms ease' };
      }
    } else if (fromIdx > toIdx) {
      // Dragging up: items between to..from-1 shift down
      if (idx >= toIdx && idx < fromIdx) {
        return { transform: `translateY(${itemH}px)`, transition: 'transform 200ms ease' };
      }
    }
    return { transform: 'translateY(0)', transition: 'transform 200ms ease' };
  };

  return (
    <div ref={containerRef} className="relative ml-2 mt-0.5 mb-1.5">
      {/* Tree vertical line */}
      {projectRepos.length > 0 && (
        <div
          className="absolute left-[7px] top-0 w-px bg-accent/25"
          style={{ bottom: 14 }}
        />
      )}
      {projectRepos.length === 0 ? (
        <p className="text-[0.75em] text-text-muted px-3 py-1 text-center">No repositories</p>
      ) : (
        projectRepos.map((repo, idx) => {
          const isDragging = dragState?.fromIdx === idx;
          const itemStyle = getItemStyle(idx);

          return (
            <div
              key={repo.id}
              ref={el => { rowRefs.current[idx] = el; }}
              className="relative"
              style={itemStyle}
            >
              {/* Tree horizontal branch */}
              <div className="absolute left-[7px] top-1/2 w-1.5 h-px bg-accent/25" />
              <div className="ml-3">
                <div
                  className={cn(
                    'flex items-center gap-2 mx-1 px-2 py-1.5 cursor-pointer rounded-md select-none',
                    repo.id === activeRepoId
                      ? 'bg-accent-emphasis/20 text-accent'
                      : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
                    isDragging && 'bg-bg-tertiary ring-1 ring-accent/30 cursor-grabbing'
                  )}
                  onPointerDown={e => handlePointerDown(e, idx)}
                >
                  {(() => { const { Icon, label } = getRepoIcon(repo.avatar); return <span title={label} className="flex-shrink-0"><Icon size={12} /></span>; })()}
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{repo.name}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ProjectSection({ project, repos, activeRepoId, expanded, onToggle, onSelectRepo, onEditProject, onDeleteProject, onReorderRepos }: {
  project: Project;
  repos: RepoBookmark[];
  activeRepoId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelectRepo: (id: string) => void;
  onEditProject: () => void;
  onDeleteProject: () => void;
  onReorderRepos: (repoIds: string[]) => void;
}) {
  const projectRepos = project.repoIds
    .map(id => repos.find(r => r.id === id))
    .filter((r): r is RepoBookmark => !!r);

  return (
    <div className={cn(
      'mb-0.5 mx-1 rounded-md transition-all duration-200',
      expanded ? 'bg-accent/[0.06] border border-accent/10' : 'border border-transparent'
    )}>
      {/* Project header */}
      <div
        className="group flex items-center gap-1.5 px-2 py-2 cursor-pointer hover:bg-bg-tertiary/30 transition-colors rounded-md"
        onClick={onToggle}
      >
        <ChevronRight
          size={11}
          className="text-text-muted transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        {project.avatar ? (
          <img src={project.avatar} alt="" className="h-4 max-w-[32px] rounded-sm flex-shrink-0 object-contain" />
        ) : (
          <FolderKanban size={12} className="flex-shrink-0 text-accent" />
        )}
        <span className="flex-1 truncate font-medium text-text-primary">{project.name}</span>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={e => { e.stopPropagation(); onEditProject(); }}
            className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
            title="Edit project"
          >
            <Pencil size={10} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDeleteProject(); }}
            className="p-0.5 rounded hover:bg-danger/20 text-text-muted hover:text-danger"
            title="Delete project"
          >
            <Trash2 size={10} />
          </button>
        </div>
        <span className="text-[0.6rem] text-text-muted">{projectRepos.length}</span>
      </div>

      {/* Project repos — animated collapse */}
      <CollapsiblePanel expanded={expanded}>
        <DraggableRepoList
          projectRepos={projectRepos}
          repoIds={project.repoIds}
          activeRepoId={activeRepoId}
          onSelectRepo={onSelectRepo}
          onReorderRepos={onReorderRepos}
        />
      </CollapsiblePanel>
    </div>
  );
}

function RepoItem({ repo, isActive, onSelect }: {
  repo: RepoBookmark;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 mx-1 px-2 py-1.5 cursor-pointer transition-colors rounded-md',
        isActive
          ? 'bg-accent-emphasis/20 text-accent'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      )}
      onClick={onSelect}
    >
      {(() => { const { Icon, label } = getRepoIcon(repo.avatar); return <span title={label} className="flex-shrink-0"><Icon size={12} /></span>; })()}
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{repo.name}</div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { repos, activeRepoId, setActiveRepo } = useRepoStore();
  const { projects, fetchProjects, deleteProject, updateProject } = useProjectStore();
  const fontSize = useUIStore(s => s.fontSize);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project?: Project }>({ open: false });
  const confirm = useConfirmStore(s => s.confirm);

  // Accordion: only one project expanded at a time; auto-expand project containing active repo
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  // Auto-expand project containing the active repo (on load, refresh, or repo change)
  useEffect(() => {
    if (!activeRepoId) return;
    const p = projects.find(p => p.repoIds.includes(activeRepoId));
    if (p) setExpandedProjectId(p.id);
  }, [activeRepoId, projects]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Repos that belong to any project
  const assignedRepoIds = new Set(projects.flatMap(p => p.repoIds));
  // Repos not in any project
  const ungroupedRepos = repos.filter(r => !assignedRepoIds.has(r.id));

  return (
    <aside className="h-full bg-bg-secondary flex flex-col" style={{ fontSize: fontSize - 2 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FolderGit2 size={16} className="text-accent" />
          <span className="font-semibold">Repositories</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setProjectDialog({ open: true })}
            className="p-1 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
            title="New project"
          >
            <FolderKanban size={14} />
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="p-1 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors"
            title="Add repository"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {repos.length === 0 && projects.length === 0 ? (
          <div className="px-3 py-8 text-center text-text-muted">
            <GitBranch size={28} className="mx-auto mb-2 opacity-50" />
            <p>No repositories</p>
            <p className="text-[0.75em] mt-1">Click + to add one</p>
          </div>
        ) : (
          <>
            {/* Projects */}
            {projects.map(project => (
              <ProjectSection
                key={project.id}
                project={project}
                repos={repos}
                activeRepoId={activeRepoId}
                expanded={expandedProjectId === project.id}
                onToggle={() => setExpandedProjectId(expandedProjectId === project.id ? null : project.id)}
                onSelectRepo={(id) => { setActiveRepo(id); setExpandedProjectId(project.id); }}
                onEditProject={() => setProjectDialog({ open: true, project })}
                onDeleteProject={async () => {
                  const confirmed = await confirm({
                    title: 'Delete Project',
                    message: `Are you sure you want to delete "${project.name}"? Repositories will not be removed.`,
                    confirmLabel: 'Delete',
                    variant: 'danger',
                  });
                  if (confirmed) deleteProject(project.id);
                }}
                onReorderRepos={(repoIds) => updateProject(project.id, { repoIds })}
              />
            ))}

            {/* Separator if there are both projects and ungrouped repos */}
            {projects.length > 0 && ungroupedRepos.length > 0 && (
              <div className="mx-2 my-1 border-t border-border/50" />
            )}

            {/* Ungrouped repos */}
            {ungroupedRepos.map(repo => (
              <RepoItem
                key={repo.id}
                repo={repo}
                isActive={activeRepoId === repo.id}
                onSelect={() => setActiveRepo(repo.id)}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <img src="/logo.png" alt="SikaGit" className="h-4 w-4 rounded-sm" />
          <span className="text-[0.85em] font-semibold tracking-wide text-accent/70">SikaGit</span>
        </div>
        <button
          onClick={() => setShowAppSettings(true)}
          className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
          title="App Settings"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {/* Dialogs */}
      {showAddDialog && <AddRepoDialog onClose={() => setShowAddDialog(false)} />}
      {showAppSettings && <AppSettingsDialog onClose={() => setShowAppSettings(false)} />}
      {projectDialog.open && (
        <ProjectDialog
          project={projectDialog.project}
          onClose={() => setProjectDialog({ open: false })}
        />
      )}
    </aside>
  );
}
