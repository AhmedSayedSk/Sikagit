import { create } from 'zustand';
import type { Project } from '@sikagit/shared';
import { api } from '../lib/api';

interface ProjectState {
  projects: Project[];
  fetchProjects: () => Promise<void>;
  createProject: (name: string, color: string, repoIds?: string[]) => Promise<void>;
  updateProject: (id: string, data: { name?: string; color?: string; repoIds?: string[] }) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addRepoToProject: (projectId: string, repoId: string) => Promise<void>;
  removeRepoFromProject: (projectId: string, repoId: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],

  fetchProjects: async () => {
    const projects = await api.getProjects();
    set({ projects });
  },

  createProject: async (name, color, repoIds = []) => {
    const project = await api.createProject(name, color, repoIds);
    set(state => ({ projects: [...state.projects, project] }));
  },

  updateProject: async (id, data) => {
    const updated = await api.updateProject(id, data);
    set(state => ({ projects: state.projects.map(p => p.id === id ? updated : p) }));
  },

  deleteProject: async (id) => {
    await api.deleteProject(id);
    set(state => ({ projects: state.projects.filter(p => p.id !== id) }));
  },

  addRepoToProject: async (projectId, repoId) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project || project.repoIds.includes(repoId)) return;
    const updated = await api.updateProject(projectId, { repoIds: [...project.repoIds, repoId] });
    set(state => ({ projects: state.projects.map(p => p.id === projectId ? updated : p) }));
  },

  removeRepoFromProject: async (projectId, repoId) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;
    const updated = await api.updateProject(projectId, { repoIds: project.repoIds.filter(id => id !== repoId) });
    set(state => ({ projects: state.projects.map(p => p.id === projectId ? updated : p) }));
  },
}));
