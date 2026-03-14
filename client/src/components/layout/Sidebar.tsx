import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, FolderGit2, Settings, SlidersHorizontal, FolderKanban, ChevronRight, Pencil, GitBranch } from 'lucide-react';
import { getRepoIcon } from '../../lib/repoIcons';
import { useRepoStore } from '../../store/repoStore';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { AddRepoDialog } from '../operations/AddRepoDialog';
import { RepoSettingsDialog } from '../operations/RepoSettingsDialog';
import { AppSettingsDialog } from '../operations/AppSettingsDialog';
import { ProjectDialog } from '../operations/ProjectDialog';
import { useConfirmStore } from '../../store/confirmStore';
import { cn } from '../../lib/utils';
import type { RepoBookmark, Project } from '@sikagit/shared';

function RepoItem({ repo, isActive, onSelect, onSettings, onRemove }: {
  repo: RepoBookmark;
  isActive: boolean;
  onSelect: () => void;
  onSettings: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 mx-2 px-3 py-1.5 cursor-pointer transition-colors rounded-md',
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
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={e => { e.stopPropagation(); onSettings(); }}
          className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-text-primary"
          title="Settings"
        >
          <Settings size={10} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="p-0.5 rounded hover:bg-danger/20 text-text-muted hover:text-danger"
          title="Remove"
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}

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

function ProjectSection({ project, repos, activeRepoId, expanded, onToggle, onSelectRepo, onSettingsRepo, onRemoveRepo, onEditProject, onDeleteProject }: {
  project: Project;
  repos: RepoBookmark[];
  activeRepoId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelectRepo: (id: string) => void;
  onSettingsRepo: (repo: RepoBookmark) => void;
  onRemoveRepo: (id: string) => void;
  onEditProject: () => void;
  onDeleteProject: () => void;
}) {
  const projectRepos = repos.filter(r => project.repoIds.includes(r.id));

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
            <Pencil size={9} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDeleteProject(); }}
            className="p-0.5 rounded hover:bg-danger/20 text-text-muted hover:text-danger"
            title="Delete project"
          >
            <Trash2 size={9} />
          </button>
        </div>
      </div>

      {/* Project repos — animated collapse */}
      <CollapsiblePanel expanded={expanded}>
        <div className="relative ml-3 mt-1 mb-2">
          {/* Tree vertical line */}
          {projectRepos.length > 0 && (
            <div
              className="absolute left-[10px] top-0 w-px bg-accent/30"
              style={{ bottom: 14 }}
            />
          )}
          {projectRepos.length === 0 ? (
            <p className="text-[0.75em] text-text-muted px-3 py-1 text-center">No repositories</p>
          ) : (
            projectRepos.map((repo, i) => (
              <div key={repo.id} className="relative">
                {/* Tree horizontal branch */}
                <div
                  className="absolute left-[10px] top-1/2 w-2 h-px bg-accent/30"
                />
                <div className="ml-4">
                  <RepoItem
                    repo={repo}
                    isActive={activeRepoId === repo.id}
                    onSelect={() => onSelectRepo(repo.id)}
                    onSettings={() => onSettingsRepo(repo)}
                    onRemove={() => onRemoveRepo(repo.id)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </CollapsiblePanel>
    </div>
  );
}

export function Sidebar() {
  const { repos, activeRepoId, setActiveRepo, removeRepo } = useRepoStore();
  const { projects, fetchProjects, deleteProject } = useProjectStore();
  const fontSize = useUIStore(s => s.fontSize);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [settingsRepo, setSettingsRepo] = useState<RepoBookmark | null>(null);
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
                onSettingsRepo={setSettingsRepo}
                onRemoveRepo={async (id) => {
                  const r = repos.find(r => r.id === id);
                  const confirmed = await confirm({
                    title: 'Remove Repository',
                    message: `Are you sure you want to remove "${r?.name || 'this repository'}" from SikaGit? This will not delete the repository files on disk.`,
                    confirmLabel: 'Remove',
                    variant: 'danger',
                  });
                  if (confirmed) removeRepo(id);
                }}
                onEditProject={() => setProjectDialog({ open: true, project })}
                onDeleteProject={async () => {
                  const confirmed = await confirm({
                    title: 'Delete Project',
                    message: `Are you sure you want to delete the project "${project.name}"? The repositories inside will not be removed.`,
                    confirmLabel: 'Delete',
                    variant: 'danger',
                  });
                  if (confirmed) deleteProject(project.id);
                }}
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
                onSettings={() => setSettingsRepo(repo)}
                onRemove={async () => {
                  const confirmed = await confirm({
                    title: 'Remove Repository',
                    message: `Are you sure you want to remove "${repo.name}" from SikaGit? This will not delete the repository files on disk.`,
                    confirmLabel: 'Remove',
                    variant: 'danger',
                  });
                  if (confirmed) removeRepo(repo.id);
                }}
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
      {settingsRepo && <RepoSettingsDialog repo={settingsRepo} onClose={() => setSettingsRepo(null)} />}
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
