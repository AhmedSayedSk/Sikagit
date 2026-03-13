import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// Directories to skip during recursive search
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.cache', '.npm', '.yarn', '__pycache__',
  'venv', '.venv', 'vendor', 'dist', 'build', '.next', '.nuxt',
  'AppData', 'Windows', 'Program Files', 'Program Files (x86)',
  '$Recycle.Bin', 'System Volume Information', 'ProgramData',
  'Recovery', 'OneDriveTemp',
]);

/**
 * POST /api/v1/browse/resolve
 *
 * The browser's native folder picker (<input webkitdirectory>) doesn't expose
 * absolute paths. The client sends the folder name + a few relative file paths
 * as a fingerprint, and this endpoint searches known directories to find the
 * matching absolute path on the server's filesystem.
 */
router.post('/resolve', (req: Request, res: Response) => {
  const { folderName, files } = req.body as {
    folderName: string;
    files: string[];
  };

  if (!folderName) {
    res.status(400).json({ success: false, error: 'Missing folderName' });
    return;
  }

  const searchDirs = getSearchDirs();
  let match: string | null = null;

  // Phase 1: Direct child check — the folder might be directly inside a search dir
  for (const dir of searchDirs) {
    const candidate = path.join(dir, folderName);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory() && matchesFingerprint(candidate, files || [])) {
        match = candidate;
        break;
      }
    } catch {
      // not found here, continue
    }
  }

  // Phase 2: Shallow recursive search (max depth 2) in search dirs only
  if (!match) {
    for (const dir of searchDirs) {
      match = findFolder(dir, folderName, files || [], 0, 2);
      if (match) break;
    }
  }

  if (!match) {
    res.status(404).json({
      success: false,
      error: `Could not locate "${folderName}". Please type the full path manually.`,
    });
    return;
  }

  res.json({ success: true, data: { path: match } });
});

/**
 * Returns a focused list of directories likely to contain dev projects.
 * NOT entire drive roots — that would be way too slow.
 */
function getSearchDirs(): string[] {
  const dirs: string[] = [];
  const home = os.homedir();
  const devDirNames = [
    'projects', 'repos', 'dev', 'code', 'workspace', 'programming',
    'Documents', 'Desktop', 'src', 'git', 'github', 'work',
  ];

  // Helper: add dir + its common dev subdirectories
  const addHome = (homeDir: string) => {
    if (!fs.existsSync(homeDir)) return;
    dirs.push(homeDir);
    for (const d of devDirNames) {
      const full = path.join(homeDir, d);
      if (fs.existsSync(full)) dirs.push(full);
      // Also check case-insensitive (e.g., "Programming" vs "programming")
      const titleCase = d.charAt(0).toUpperCase() + d.slice(1);
      if (titleCase !== d) {
        const fullTC = path.join(homeDir, titleCase);
        if (fs.existsSync(fullTC)) dirs.push(fullTC);
      }
    }
  };

  // Docker-mounted host home directories
  if (fs.existsSync('/host/home')) {
    try {
      const users = fs.readdirSync('/host/home', { withFileTypes: true });
      for (const u of users) {
        if (u.isDirectory()) addHome(path.join('/host/home', u.name));
      }
    } catch { /* ignore */ }
  }

  // Docker-mounted Windows drives: only scan Users/<name> directories
  if (fs.existsSync('/host/mnt')) {
    try {
      const drives = fs.readdirSync('/host/mnt', { withFileTypes: true });
      for (const drive of drives) {
        if (!drive.isDirectory()) continue;
        const drivePath = path.join('/host/mnt', drive.name);

        // Check for Users directory on each drive
        const usersDir = path.join(drivePath, 'Users');
        if (fs.existsSync(usersDir)) {
          try {
            const users = fs.readdirSync(usersDir, { withFileTypes: true });
            for (const u of users) {
              if (u.isDirectory() && u.name !== 'Public' && u.name !== 'Default') {
                addHome(path.join(usersDir, u.name));
              }
            }
          } catch { /* ignore */ }
        }

        // Also check drive root for dev directories directly
        for (const d of devDirNames) {
          const full = path.join(drivePath, d);
          if (fs.existsSync(full)) dirs.push(full);
          const titleCase = d.charAt(0).toUpperCase() + d.slice(1);
          if (titleCase !== d) {
            const fullTC = path.join(drivePath, titleCase);
            if (fs.existsSync(fullTC)) dirs.push(fullTC);
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Native home (non-Docker)
  if (home) addHome(home);

  // Native WSL /mnt drives
  if (!fs.existsSync('/host/mnt') && fs.existsSync('/mnt')) {
    try {
      const drives = fs.readdirSync('/mnt', { withFileTypes: true });
      for (const d of drives) {
        if (d.isDirectory() && d.name.length === 1) {
          const drivePath = path.join('/mnt', d.name);
          for (const devDir of devDirNames) {
            const full = path.join(drivePath, devDir);
            if (fs.existsSync(full)) dirs.push(full);
          }
        }
      }
    } catch { /* ignore */ }
  }

  return [...new Set(dirs)]; // deduplicate
}

function findFolder(
  dir: string,
  targetName: string,
  fingerprint: string[],
  depth: number,
  maxDepth: number,
): string | null {
  if (depth > maxDepth) return null;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.name === targetName) {
      if (fingerprint.length === 0 || matchesFingerprint(fullPath, fingerprint)) {
        return fullPath;
      }
    }

    const result = findFolder(fullPath, targetName, fingerprint, depth + 1, maxDepth);
    if (result) return result;
  }

  return null;
}

function matchesFingerprint(dir: string, files: string[]): boolean {
  if (files.length === 0) return true;
  let matched = 0;
  const toCheck = files.slice(0, 5);
  for (const file of toCheck) {
    if (fs.existsSync(path.join(dir, file))) matched++;
  }
  return matched >= Math.ceil(toCheck.length / 2);
}

export default router;
