import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DiffWhitespaceMode } from '@sikagit/shared';

type Panel = 'log' | 'files' | 'branches';
type Theme = 'dark' | 'light';

interface UIState {
  sidebarOpen: boolean;
  activePanel: Panel;
  theme: Theme;
  fontSize: number;
  diffFontSize: number;
  diffLineHeight: number;
  /** Whitespace noise filter applied to every diff view. */
  diffWhitespace: DiffWhitespaceMode;
  sidebarWidth: number;
  commitListWidth: number;
  bottomPanelHeight: number;
  colGraphWidth: number | null; // null = auto from lanes
  colTypeWidth: number;
  colAuthorWidth: number;
  colDateWidth: number;
  colHashWidth: number;
  unstagedPanelRatio: number; // 0-1, proportion of unstaged panel width
  groupFilesByFolder: boolean;
  autoFetchOnOpen: boolean;
  demoMode: boolean;
  aiEnabled: boolean;
  aiApiKey: string;
  aiModel: string;
  backgroundSmartCommit: boolean;       // run Smart Commit without the review dialog
  backgroundSmartCommitPush: boolean;   // also push after the background commit (only if above is on)
  toggleSidebar: () => void;
  setActivePanel: (panel: Panel) => void;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setDiffFontSize: (size: number) => void;
  setDiffLineHeight: (height: number) => void;
  setDiffWhitespace: (mode: DiffWhitespaceMode) => void;
  setSidebarWidth: (width: number) => void;
  setCommitListWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
  setColGraphWidth: (width: number) => void;
  setColTypeWidth: (width: number) => void;
  setColAuthorWidth: (width: number) => void;
  setColDateWidth: (width: number) => void;
  setColHashWidth: (width: number) => void;
  setUnstagedPanelRatio: (ratio: number) => void;
  setGroupFilesByFolder: (v: boolean) => void;
  setAutoFetchOnOpen: (v: boolean) => void;
  setDemoMode: (v: boolean) => void;
  setAiEnabled: (v: boolean) => void;
  setAiApiKey: (key: string) => void;
  setAiModel: (model: string) => void;
  setBackgroundSmartCommit: (v: boolean) => void;
  setBackgroundSmartCommitPush: (v: boolean) => void;
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

// Gemini model used for AI suggestions: the Flash family only (Pro retired).
// Keep in sync with AI_MODELS in components/operations/AppSettingsDialog.tsx.
export const DEFAULT_AI_MODEL = 'gemini-3.8-flash';
const SUPPORTED_AI_MODELS = new Set([
  DEFAULT_AI_MODEL,
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
]);

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      activePanel: 'log',
      theme: 'dark',
      fontSize: 14,
      diffFontSize: 10,
      diffLineHeight: 3,
      // Defaults to 'eol': line-ending churn is never worth reading, and left
      // unfiltered it reports every line of a file as changed.
      diffWhitespace: 'eol',
      sidebarWidth: 240,
      commitListWidth: 500,
      bottomPanelHeight: 320,
      colGraphWidth: null,
      colTypeWidth: 64,
      colAuthorWidth: 112,
      colDateWidth: 80,
      colHashWidth: 64,
      unstagedPanelRatio: 0.5,
      groupFilesByFolder: true,
      autoFetchOnOpen: true,
      demoMode: false,
      aiEnabled: false,
      aiApiKey: '',
      aiModel: DEFAULT_AI_MODEL,
      backgroundSmartCommit: false,
      backgroundSmartCommitPush: false,

      toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
      setActivePanel: (panel: Panel) => set({ activePanel: panel }),
      setTheme: (theme: Theme) => set({ theme }),
      setFontSize: (size: number) => set({ fontSize: clamp(size, 10, 20) }),
      setDiffFontSize: (size: number) => set({ diffFontSize: clamp(size, 8, 20) }),
      setDiffLineHeight: (height: number) => set({ diffLineHeight: clamp(height, 0, 10) }),
      setDiffWhitespace: (mode: DiffWhitespaceMode) => set({ diffWhitespace: mode }),
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
      setColTypeWidth: (width: number) => set({
        colTypeWidth: clamp(width, 40, 120),
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
      setGroupFilesByFolder: (v: boolean) => set({ groupFilesByFolder: v }),
      setAutoFetchOnOpen: (v: boolean) => set({ autoFetchOnOpen: v }),
      setDemoMode: (v: boolean) => set({ demoMode: v }),
      setAiEnabled: (v: boolean) => set({ aiEnabled: v }),
      setAiApiKey: (key: string) => set({ aiApiKey: key }),
      setAiModel: (model: string) => set({ aiModel: model }),
      setBackgroundSmartCommit: (v: boolean) => set({ backgroundSmartCommit: v }),
      setBackgroundSmartCommitPush: (v: boolean) => set({ backgroundSmartCommitPush: v }),
    }),
    {
      name: 'sikagit-ui',
      version: 3,
      // v1/v2: the diff font default dropped 12px -> 11px -> 10px; carry users
      // still on a previous default over, keep explicit choices.
      // v3: the Gemini Pro models were retired; anything not in the supported
      // Flash list becomes the current default.
      migrate: (persisted, version) => {
        const state = persisted as Partial<UIState>;
        if (version < 1 && state.diffFontSize === 12) state.diffFontSize = 11;
        if (version < 2 && state.diffFontSize === 11) state.diffFontSize = 10;
        if (version < 3 && !SUPPORTED_AI_MODELS.has(state.aiModel ?? '')) state.aiModel = DEFAULT_AI_MODEL;
        return state as UIState;
      },
    }
  )
);
