import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Panel = 'log' | 'files' | 'branches';
type Theme = 'dark' | 'light';

interface UIState {
  sidebarOpen: boolean;
  activePanel: Panel;
  theme: Theme;
  fontSize: number;
  diffFontSize: number;
  diffLineHeight: number;
  sidebarWidth: number;
  commitListWidth: number;
  bottomPanelHeight: number;
  colGraphWidth: number | null; // null = auto from lanes
  colAuthorWidth: number;
  colDateWidth: number;
  colHashWidth: number;
  unstagedPanelRatio: number; // 0-1, proportion of unstaged panel width
  toggleSidebar: () => void;
  setActivePanel: (panel: Panel) => void;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setDiffFontSize: (size: number) => void;
  setDiffLineHeight: (height: number) => void;
  setSidebarWidth: (width: number) => void;
  setCommitListWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
  setColGraphWidth: (width: number) => void;
  setColAuthorWidth: (width: number) => void;
  setColDateWidth: (width: number) => void;
  setColHashWidth: (width: number) => void;
  setUnstagedPanelRatio: (ratio: number) => void;
}

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const COMMIT_LIST_MIN = 250;
const COMMIT_LIST_MAX_RATIO = 0.7;
const BOTTOM_PANEL_MIN = 120;
const BOTTOM_PANEL_MAX = 500;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      activePanel: 'log',
      theme: 'dark',
      fontSize: 14,
      diffFontSize: 12,
      diffLineHeight: 3,
      sidebarWidth: 240,
      commitListWidth: 500,
      bottomPanelHeight: 320,
      colGraphWidth: null,
      colAuthorWidth: 112,
      colDateWidth: 80,
      colHashWidth: 64,
      unstagedPanelRatio: 0.5,

      toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
      setActivePanel: (panel: Panel) => set({ activePanel: panel }),
      setTheme: (theme: Theme) => set({ theme }),
      setFontSize: (size: number) => set({ fontSize: clamp(size, 10, 20) }),
      setDiffFontSize: (size: number) => set({ diffFontSize: clamp(size, 8, 20) }),
      setDiffLineHeight: (height: number) => set({ diffLineHeight: clamp(height, 0, 10) }),
      setSidebarWidth: (width: number) => set({
        sidebarWidth: clamp(width, SIDEBAR_MIN, SIDEBAR_MAX),
      }),
      setCommitListWidth: (width: number) => set({
        commitListWidth: clamp(width, COMMIT_LIST_MIN, window.innerWidth * COMMIT_LIST_MAX_RATIO),
      }),
      setBottomPanelHeight: (height: number) => set({
        bottomPanelHeight: clamp(height, BOTTOM_PANEL_MIN, BOTTOM_PANEL_MAX),
      }),
      setColGraphWidth: (width: number) => set({
        colGraphWidth: clamp(width, 30, 400),
      }),
      setColAuthorWidth: (width: number) => set({
        colAuthorWidth: clamp(width, 50, 300),
      }),
      setColDateWidth: (width: number) => set({
        colDateWidth: clamp(width, 40, 200),
      }),
      setColHashWidth: (width: number) => set({
        colHashWidth: clamp(width, 40, 150),
      }),
      setUnstagedPanelRatio: (ratio: number) => set({
        unstagedPanelRatio: clamp(ratio, 0.15, 0.85),
      }),
    }),
    { name: 'sikagit-ui' }
  )
);
