import path from 'path';
import fs from 'fs';

const WSL_UNC_PREFIX = '\\\\wsl$\\';
const WSL_LOCALHOST_PREFIX = '\\\\wsl.localhost\\';

// Detect if we're running inside Docker (or Linux) vs native Windows
const IS_POSIX = path.sep === '/';

export function normalizePath(inputPath: string): string {
  let normalized = inputPath.trim();

  // If running on Linux/Docker, keep POSIX paths as-is
  if (IS_POSIX) {
    // Normalize but don't convert to Windows paths
    normalized = path.posix.normalize(normalized);
    // Remove trailing slash (except root "/")
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  // Windows-specific normalization below
  if (normalized.startsWith('/mnt/')) {
    const drive = normalized.charAt(5).toUpperCase();
    normalized = `${drive}:${normalized.slice(6).replace(/\//g, '\\')}`;
  } else if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    normalized = `${WSL_UNC_PREFIX}Ubuntu${normalized.replace(/\//g, '\\')}`;
  }

  normalized = path.win32.normalize(normalized);

  if (normalized.endsWith('\\') && !normalized.endsWith(':\\')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

export function isWSLPath(repoPath: string): boolean {
  if (IS_POSIX) {
    // In Docker, /host/home/... are WSL paths
    return repoPath.startsWith('/host/home');
  }
  const upper = repoPath.toUpperCase();
  return upper.startsWith(WSL_UNC_PREFIX.toUpperCase()) ||
    upper.startsWith(WSL_LOCALHOST_PREFIX.toUpperCase());
}

export function getDisplayPath(repoPath: string): string {
  if (IS_POSIX) {
    // /host/home/ahmedsk/projects/repo -> WSL: ~/projects/repo
    const hostHomeMatch = repoPath.match(/^\/host\/home\/([^/]+)\/(.+)$/);
    if (hostHomeMatch) {
      return `WSL: ~/${hostHomeMatch[2]}`;
    }
    // /host/mnt/d/programming/repo -> D:\programming\repo
    const hostMntMatch = repoPath.match(/^\/host\/mnt\/([a-z])\/(.+)$/);
    if (hostMntMatch) {
      return `${hostMntMatch[1].toUpperCase()}:\\${hostMntMatch[2].replace(/\//g, '\\')}`;
    }
    return repoPath;
  }

  // Windows display
  const upper = repoPath.toUpperCase();
  if (upper.startsWith(WSL_UNC_PREFIX.toUpperCase()) || upper.startsWith(WSL_LOCALHOST_PREFIX.toUpperCase())) {
    const prefix = upper.startsWith(WSL_UNC_PREFIX.toUpperCase()) ? WSL_UNC_PREFIX : WSL_LOCALHOST_PREFIX;
    const rest = repoPath.slice(prefix.length);
    const parts = rest.split('\\');
    const distro = parts[0];
    const linuxPath = '/' + parts.slice(1).join('/');

    const homeMatch = linuxPath.match(/^\/home\/[^/]+\/(.*)$/);
    if (homeMatch) {
      return `WSL(${distro}): ~/${homeMatch[1]}`;
    }
    return `WSL(${distro}): ${linuxPath}`;
  }

  return repoPath;
}

export function getRepoName(repoPath: string): string {
  const normalized = normalizePath(repoPath);
  const sep = IS_POSIX ? '/' : (normalized.includes('/') ? '/' : '\\');
  const parts = normalized.split(sep).filter(Boolean);
  return parts[parts.length - 1] || 'unknown';
}

export function validateGitRepo(repoPath: string): { valid: boolean; error?: string } {
  const normalized = normalizePath(repoPath);

  try {
    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      return { valid: false, error: 'Path is not a directory' };
    }
  } catch {
    return { valid: false, error: 'Path does not exist or is not accessible' };
  }

  const gitPath = path.join(normalized, '.git');
  try {
    fs.statSync(gitPath);
  } catch {
    // No .git found — auto-initialize
    try {
      const { execSync } = require('child_process');
      execSync('git init', { cwd: normalized, stdio: 'ignore' });
    } catch {
      return { valid: false, error: 'Directory is not a git repository and could not be initialized' };
    }
  }

  return { valid: true };
}
