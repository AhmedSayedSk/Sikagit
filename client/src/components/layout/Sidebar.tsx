import { useState, useEffect } from 'react';
import { GitBranch, Plus, Trash2, FolderGit2, Settings, SlidersHorizontal, FolderKanban, ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { useRepoStore } from '../../store/repoStore';
import { useProjectStore } from '../../store/projectStore';
import { AddRepoDialog } from '../operations/AddRepoDialog';
import { RepoSettingsDialog } from '../operations/RepoSettingsDialog';
import { AppSettingsDialog } from '../operations/AppSettingsDialog';
import { ProjectDialog } from '../operations/ProjectDialog';
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
        'group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs transition-colors',
        isActive
          ? 'bg-accent-emphasis/20 text-accent'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      )}
      onClick={onSelect}
    >
      {repo.avatar ? (
        <img src={repo.avatar} alt="" className="h-5 max-w-[32px] rounded flex-shrink-0 object-contain" />
      ) : (
        <GitBranch size={12} className="flex-shrink-0" />
      )}
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

function ProjectSection({ project, repos, activeRepoId, onSelectRepo, onSettingsRepo, onRemoveRepo, onEditProject, onDeleteProject }: {
  project: Project;
  repos: RepoBookmark[];
  activeRepoId: string | null;
  onSelectRepo: (id: string) => void;
  onSettingsRepo: (repo: RepoBookmark) => void;
  onRemoveRepo: (id: string) => void;
  onEditProject: () => void;
  onDeleteProject: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const projectRepos = repos.filter(r => project.repoIds.includes(r.id));

  return (
    <div className="mb-0.5">
      {/* Project header */}
      <div
        className="group flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-bg-tertiary/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={11} className="text-text-muted" /> : <ChevronRight size={11} className="text-text-muted" />}
        <div
          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
          style={{ backgroundColor: project.color }}
        />
        <span className="flex-1 truncate font-medium text-text-primary">{project.name}</span>
        <span className="text-[0.6rem] text-text-muted mr-1">{projectRepos.length}</span>
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

      {/* Project repos */}
      {expanded && (
        <div className="pl-2">
          {projectRepos.length === 0 ? (
            <p className="text-[0.6rem] text-text-muted px-3 py-1">No repositories</p>
          ) : (
            projectRepos.map(repo => (
              <RepoItem
                key={repo.id}
                repo={repo}
                isActive={activeRepoId === repo.id}
                onSelect={() => onSelectRepo(repo.id)}
                onSettings={() => onSettingsRepo(repo)}
                onRemove={() => onRemoveRepo(repo.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { repos, activeRepoId, setActiveRepo, removeRepo } = useRepoStore();
  const { projects, fetchProjects, deleteProject } = useProjectStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [settingsRepo, setSettingsRepo] = useState<RepoBookmark | null>(null);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; project?: Project }>({ open: false });

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Repos that belong to any project
  const assignedRepoIds = new Set(projects.flatMap(p => p.repoIds));
  // Repos not in any project
  const ungroupedRepos = repos.filter(r => !assignedRepoIds.has(r.id));

  return (
    <aside className="h-full bg-bg-secondary flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FolderGit2 size={16} className="text-accent" />
          <span className="text-xs font-semibold">Repositories</span>
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
          <div className="px-3 py-8 text-center text-text-muted text-xs">
            <GitBranch size={28} className="mx-auto mb-2 opacity-50" />
            <p>No repositories</p>
            <p className="text-[0.6rem] mt-1">Click + to add one</p>
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
                onSelectRepo={setActiveRepo}
                onSettingsRepo={setSettingsRepo}
                onRemoveRepo={removeRepo}
                onEditProject={() => setProjectDialog({ open: true, project })}
                onDeleteProject={() => deleteProject(project.id)}
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
                onRemove={() => removeRepo(repo.id)}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 flex items-center justify-between">
        <span className="text-[0.625rem] text-text-muted">SikaGit</span>
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
