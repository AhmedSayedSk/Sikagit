import { create } from 'zustand';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useToastStore } from './toastStore';
import { playSuccess, playError } from '../lib/sound';

interface ProcStats {
  cpuPercent: number;
  memMB: number;
}

interface RunState {
  outputs: Record<string, string[]>;
  running: Record<string, boolean>;
  ports: Record<string, number | null>;
  runTargets: Record<string, string>;
  stats: Record<string, ProcStats>;
  startRun: (repoId: string) => Promise<void>;
  stopRun: (repoId: string) => Promise<void>;
  checkStatus: (repoId: string) => Promise<void>;
  clearOutput: (repoId: string) => void;
  // Build
  startBuild: (repoId: string) => Promise<void>;
  stopBuild: (repoId: string) => Promise<void>;
  checkBuildStatus: (repoId: string) => Promise<void>;
  clearBuildOutput: (repoId: string) => void;
  // Install
  startInstall: (repoId: string) => Promise<void>;
  stopInstall: (repoId: string) => Promise<void>;
  checkInstallStatus: (repoId: string) => Promise<void>;
  clearInstallOutput: (repoId: string) => void;
}

const subscribedKeys = new Set<string>();

function subscribeToKey(key: string) {
  if (subscribedKeys.has(key)) return;
  subscribedKeys.add(key);

  const socket = getSocket();

  socket.on(`run:output:${key}`, (data: string) => {
    useRunStore.setState((state) => ({
      outputs: {
        ...state.outputs,
        [key]: [...(state.outputs[key] || []), data],
      },
    }));
  });

  socket.on(`run:port:${key}`, (data: { port: number; runTarget: string }) => {
    useRunStore.setState((state) => ({
      ports: { ...state.ports, [key]: data.port },
      runTargets: { ...state.runTargets, [key]: data.runTarget },
    }));
  });

  socket.on(`run:stats:${key}`, (data: ProcStats) => {
    useRunStore.setState((state) => ({
      stats: { ...state.stats, [key]: data },
    }));
  });

  socket.on(`run:exit:${key}`, (code: number) => {
    useRunStore.setState((state) => ({
      running: { ...state.running, [key]: false },
      ports: { ...state.ports, [key]: null },
      stats: { ...state.stats, [key]: { cpuPercent: 0, memMB: 0 } },
      outputs: {
        ...state.outputs,
        [key]: [...(state.outputs[key] || []), `\n--- Process exited with code ${code} ---\n`],
      },
    }));

    // Notify when a build finishes
    if (key.startsWith('build:')) {
      const { addToast } = useToastStore.getState();
      if (code === 0) {
        addToast('success', 'Build completed successfully');
        playSuccess();
      } else {
        addToast('error', `Build failed with exit code ${code}`);
        playError();
      }
    }
    // Notify when install finishes
    if (key.startsWith('install:')) {
      const { addToast } = useToastStore.getState();
      if (code === 0) {
        addToast('success', 'Dependencies installed successfully');
        playSuccess();
      } else {
        addToast('error', `Install failed with exit code ${code}`);
        playError();
      }
    }
  });
}

const buildKey = (id: string) => `build:${id}`;
const installKey = (id: string) => `install:${id}`;

export const useRunStore = create<RunState>()((set) => ({
  outputs: {},
  running: {},
  ports: {},
  runTargets: {},
  stats: {},

  startRun: async (repoId: string) => {
    subscribeToKey(repoId);
    set((state) => ({
      running: { ...state.running, [repoId]: true },
      outputs: { ...state.outputs, [repoId]: [] },
      ports: { ...state.ports, [repoId]: null },
    }));
    try {
      const result = await api.runCommand(repoId);
      set((state) => ({
        runTargets: { ...state.runTargets, [repoId]: result.runTarget },
      }));
    } catch (err: any) {
      set((state) => ({
        running: { ...state.running, [repoId]: false },
        outputs: {
          ...state.outputs,
          [repoId]: [...(state.outputs[repoId] || []), `Error: ${err.message}\n`],
        },
      }));
    }
  },

  stopRun: async (repoId: string) => {
    try {
      await api.stopCommand(repoId);
    } catch {
      set((state) => ({
        running: { ...state.running, [repoId]: false },
      }));
    }
  },

  checkStatus: async (repoId: string) => {
    subscribeToKey(repoId);
    try {
      const { running, port, runTarget } = await api.runStatus(repoId);
      set((state) => ({
        running: { ...state.running, [repoId]: running },
        ports: { ...state.ports, [repoId]: port },
        runTargets: { ...state.runTargets, [repoId]: runTarget },
      }));
      if (running) {
        const current = useRunStore.getState().outputs[repoId];
        if (!current || current.length === 0) {
          try {
            const { lines } = await api.runOutput(repoId);
            if (lines.length > 0) {
              set((state) => ({
                outputs: { ...state.outputs, [repoId]: lines },
              }));
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  },

  clearOutput: (repoId: string) => {
    set((state) => ({
      outputs: { ...state.outputs, [repoId]: [] },
    }));
  },

  // ─── Build ───

  startBuild: async (repoId: string) => {
    const bk = buildKey(repoId);
    subscribeToKey(bk);
    set((state) => ({
      running: { ...state.running, [bk]: true },
      outputs: { ...state.outputs, [bk]: [] },
    }));
    try {
      const result = await api.buildCommand(repoId);
      set((state) => ({
        runTargets: { ...state.runTargets, [bk]: result.runTarget },
      }));
    } catch (err: any) {
      set((state) => ({
        running: { ...state.running, [bk]: false },
        outputs: {
          ...state.outputs,
          [bk]: [...(state.outputs[bk] || []), `Error: ${err.message}\n`],
        },
      }));
    }
  },

  stopBuild: async (repoId: string) => {
    const bk = buildKey(repoId);
    try {
      await api.stopBuild(repoId);
    } catch {
      set((state) => ({
        running: { ...state.running, [bk]: false },
      }));
    }
  },

  checkBuildStatus: async (repoId: string) => {
    const bk = buildKey(repoId);
    subscribeToKey(bk);
    try {
      const { running, runTarget } = await api.buildStatus(repoId);
      set((state) => ({
        running: { ...state.running, [bk]: running },
        runTargets: { ...state.runTargets, [bk]: runTarget },
      }));
      if (running) {
        const current = useRunStore.getState().outputs[bk];
        if (!current || current.length === 0) {
          try {
            const { lines } = await api.buildOutput(repoId);
            if (lines.length > 0) {
              set((state) => ({
                outputs: { ...state.outputs, [bk]: lines },
              }));
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  },

  clearBuildOutput: (repoId: string) => {
    const bk = buildKey(repoId);
    set((state) => ({
      outputs: { ...state.outputs, [bk]: [] },
    }));
  },

  // ─── Install ───

  startInstall: async (repoId: string) => {
    const ik = installKey(repoId);
    subscribeToKey(ik);
    set((state) => ({
      running: { ...state.running, [ik]: true },
      outputs: { ...state.outputs, [ik]: [] },
    }));
    try {
      const result = await api.installDeps(repoId);
      set((state) => ({
        runTargets: { ...state.runTargets, [ik]: result.runTarget },
      }));
    } catch (err: any) {
      set((state) => ({
        running: { ...state.running, [ik]: false },
        outputs: {
          ...state.outputs,
          [ik]: [...(state.outputs[ik] || []), `Error: ${err.message}\n`],
        },
      }));
    }
  },

  stopInstall: async (repoId: string) => {
    const ik = installKey(repoId);
    try {
      await api.stopInstall(repoId);
    } catch {
      set((state) => ({
        running: { ...state.running, [ik]: false },
      }));
    }
  },

  checkInstallStatus: async (repoId: string) => {
    const ik = installKey(repoId);
    subscribeToKey(ik);
    try {
      const { running, runTarget } = await api.installStatus(repoId);
      set((state) => ({
        running: { ...state.running, [ik]: running },
        runTargets: { ...state.runTargets, [ik]: runTarget },
      }));
      if (running) {
        const current = useRunStore.getState().outputs[ik];
        if (!current || current.length === 0) {
          try {
            const { lines } = await api.installOutput(repoId);
            if (lines.length > 0) {
              set((state) => ({
                outputs: { ...state.outputs, [ik]: lines },
              }));
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  },

  clearInstallOutput: (repoId: string) => {
    const ik = installKey(repoId);
    set((state) => ({
      outputs: { ...state.outputs, [ik]: [] },
    }));
  },
}));
