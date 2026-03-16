import { create } from 'zustand';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useToastStore } from './toastStore';
import { playSuccess, playError } from '../lib/sound';

interface RunState {
  outputs: Record<string, string[]>;
  running: Record<string, boolean>;
  ports: Record<string, number | null>;
  runTargets: Record<string, string>;
  startRun: (repoId: string) => Promise<void>;
  stopRun: (repoId: string) => Promise<void>;
  checkStatus: (repoId: string) => Promise<void>;
  clearOutput: (repoId: string) => void;
  // Build
  startBuild: (repoId: string) => Promise<void>;
  stopBuild: (repoId: string) => Promise<void>;
  checkBuildStatus: (repoId: string) => Promise<void>;
  clearBuildOutput: (repoId: string) => void;
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

  socket.on(`run:exit:${key}`, (code: number) => {
    useRunStore.setState((state) => ({
      running: { ...state.running, [key]: false },
      ports: { ...state.ports, [key]: null },
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
  });
}

const buildKey = (id: string) => `build:${id}`;

export const useRunStore = create<RunState>()((set) => ({
  outputs: {},
  running: {},
  ports: {},
  runTargets: {},

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
}));
