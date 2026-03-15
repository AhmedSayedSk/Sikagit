export interface GitCommit {
  hash: string;
  abbreviatedHash: string;
  authorName: string;
  authorEmail: string;
  authorDate: string;
  message: string;
  body: string;
  parentHashes: string[];
  branches: string[];
  tags: string[];
  isHead: boolean;
}

export interface GraphCommit extends GitCommit {
  lane: number;
  laneColor: number;
  connections: GraphConnection[];
}

export interface GraphConnection {
  fromLane: number;
  toLane: number;
  fromRow: number;
  toRow: number;
  type: 'straight' | 'merge-in' | 'branch-out';
  colorIndex: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  tracking?: string;
  ahead?: number;
  behind?: number;
  isRemote: boolean;
}

export interface GitTag {
  name: string;
  commit: string;
  message?: string;
}

export interface GitFileStatus {
  path: string;
  index: string;
  workingDir: string;
  isStaged: boolean;
  isConflicted: boolean;
  size?: number; // file size in bytes
}

export interface GitDiffFile {
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface RepoBookmark {
  id: string;
  path: string;
  displayPath: string;
  name: string;
  isWSL: boolean;
  lastOpened?: string;
  group?: string;
  avatar?: string; // base64 data URL for repo logo
}

export interface Project {
  id: string;
  name: string;
  avatar?: string; // base64 data URL for project image
  repoIds: string[];
  createdAt: string;
}

export interface RepoConfig {
  userName?: string;
  userEmail?: string;
  defaultBranch?: string;
  remoteUrl?: string;
}

export interface GitStatus {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  remoteUrl?: string; // origin URL when no upstream tracking is set
  files: GitFileStatus[];
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: GitFileStatus[];
  conflicted: string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
