import { create } from 'zustand';

export interface ActivityEntry {
  id: number;
  label: string;
  startedAt: number;
}

interface ActivityState {
  entries: ActivityEntry[];
  begin: (label: string) => number;
  end: (id: number) => void;
}

let nextId = 1;

export const useActivityStore = create<ActivityState>()((set) => ({
  entries: [],
  begin: (label) => {
    const id = nextId++;
    set((state) => ({ entries: [...state.entries, { id, label, startedAt: Date.now() }] }));
    return id;
  },
  end: (id) => set((state) => ({ entries: state.entries.filter(e => e.id !== id) })),
}));

// Wrap an async function so its execution registers a labelled activity for the
// duration of the promise. Use for any operation that should surface in the
// bottom status bar (refresh, stage, push, pull, etc.).
export async function withActivity<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const id = useActivityStore.getState().begin(label);
  try {
    return await fn();
  } finally {
    useActivityStore.getState().end(id);
  }
}
