import simpleGit, { SimpleGit } from 'simple-git';
import { execSync } from 'child_process';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { GitCommit, GitBranch, GitTag, GitFileStatus, GitStatus } from '@sikagit/shared';
import { normalizePath } from './pathService';

/**
 * Read a value from the host's global gitconfig.
 * Inside Docker the host home dirs are mounted at /host/home/<user>/.gitconfig
 */
function readHostGitConfig(key: string): string {
  try {
    // Try /host/home/*/.gitconfig
    const hostHome = '/host/home';
    if (existsSync(hostHome)) {
      for (const user of readdirSync(hostHome)) {
        const cfgPath = join(hostHome, user, '.gitconfig');
        if (existsSync(cfgPath)) {
          const result = execSync(
            `git config --file '${cfgPath}' '${key}'`,
            { encoding: 'utf-8' }
          ).trim();
          if (result) return result;
        }
      }
    }
  } catch { /* not found */ }
  return '';
}

function getGit(repoPath: string): SimpleGit {
  const normalized = normalizePath(repoPath);
  return simpleGit(normalized);
}

export async function getStatus(repoPath: string): Promise<GitStatus> {
  const git = getGit(repoPath);
  const status = await git.status();

  const mapFile = (f: { path: string; index: string; working_dir: string }): GitFileStatus => ({
    path: f.path,
    index: f.index,
    workingDir: f.working_dir,
    isStaged: f.index !== ' ' && f.index !== '?' && f.index !== '!',
    isConflicted: f.working_dir === 'U' || f.index === 'U',
  });

  const files = status.files.map(mapFile);

  return {
    current: status.current,
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    files,
    staged: files.filter(f => f.isStaged),
    unstaged: files.filter(f => f.workingDir !== ' ' && f.workingDir !== '?' && f.workingDir !== '!'),
    untracked: status.not_added,
    conflicted: status.conflicted,
  };
}

export async function getLog(
  repoPath: string,
  limit = 200,
  skip = 0
): Promise<GitCommit[]> {
  const git = getGit(repoPath);

  const log = await git.log({
    maxCount: limit,
    '--skip': skip,
    '--decorate': 'full',
  });

  // Get branches and tags for decoration
  const [branchResult, tagResult] = await Promise.all([
    git.branch(['-a', '--format=%(refname:short) %(objectname:short)']),
    git.tag(['-l']),
  ]);

  const branchMap = new Map<string, string[]>();
  for (const b of branchResult.all) {
    const info = branchResult.branches[b];
    if (info) {
      const existing = branchMap.get(info.commit) || [];
      existing.push(b);
      branchMap.set(info.commit, existing);
    }
  }

  const tagMap = new Map<string, string[]>();
  if (tagResult) {
    const tags = tagResult.split('\n').filter(Boolean);
    for (const tag of tags) {
      try {
        const result = await git.raw(['rev-parse', '--short', tag]);
        const hash = result.trim();
        const existing = tagMap.get(hash) || [];
        existing.push(tag);
        tagMap.set(hash, existing);
      } catch {
        // skip invalid tags
      }
    }
  }

  const headResult = await git.revparse(['HEAD']);
  const headHash = headResult.trim();

  return log.all.map(entry => ({
    hash: entry.hash,
    abbreviatedHash: entry.hash.substring(0, 7),
    authorName: entry.author_name,
    authorEmail: entry.author_email,
    authorDate: entry.date,
    message: entry.message,
    body: entry.body,
    parentHashes: (entry as any).refs
      ? []
      : [],
    branches: branchMap.get(entry.hash.substring(0, 7)) || branchMap.get(entry.hash) || [],
    tags: tagMap.get(entry.hash.substring(0, 7)) || tagMap.get(entry.hash) || [],
    isHead: entry.hash === headHash || entry.hash.startsWith(headHash),
  }));
}

export async function getLogWithParents(
  repoPath: string,
  limit = 200,
  skip = 0
): Promise<GitCommit[]> {
  const git = getGit(repoPath);

  // Use raw log to get parent hashes
  const format = '%H%n%h%n%an%n%ae%n%aI%n%s%n%b%n%P%n%D%n---END---';
  let result: string;
  let headHash = '';
  try {
    result = await git.raw([
      'log',
      `--max-count=${limit}`,
      `--skip=${skip}`,
      `--format=${format}`,
    ]);
    headHash = (await git.revparse(['HEAD'])).trim();
  } catch {
    // No commits yet
    return [];
  }

  if (!result || !result.trim()) return [];

  const entries = result.split('---END---\n').filter(Boolean);

  return entries.map(entry => {
    const lines = entry.split('\n');
    const hash = lines[0];
    const abbreviatedHash = lines[1];
    const authorName = lines[2];
    const authorEmail = lines[3];
    const authorDate = lines[4];
    const message = lines[5];
    const body = lines.slice(6, -3).join('\n');
    const parentHashes = lines[lines.length - 3]?.split(' ').filter(Boolean) || [];
    const refs = lines[lines.length - 2] || '';

    const branches: string[] = [];
    const tags: string[] = [];
    if (refs) {
      refs.split(',').map(r => r.trim()).forEach(ref => {
        if (ref.startsWith('tag: ')) {
          tags.push(ref.replace('tag: ', '').replace('refs/tags/', ''));
        } else if (ref && ref !== 'HEAD') {
          const cleaned = ref
            .replace('HEAD -> ', '')
            .replace('refs/heads/', '')
            .replace('refs/remotes/', '');
          if (cleaned) branches.push(cleaned);
        }
      });
    }

    return {
      hash,
      abbreviatedHash,
      authorName,
      authorEmail,
      authorDate,
      message,
      body,
      parentHashes,
      branches,
      tags,
      isHead: hash === headHash,
    };
  });
}

export async function getBranches(repoPath: string): Promise<GitBranch[]> {
  const git = getGit(repoPath);
  const result = await git.branch(['-a', '-vv']);

  return result.all.map(name => {
    const info = result.branches[name];
    return {
      name,
      current: info.current,
      commit: info.commit,
      tracking: info.label?.match(/\[([^\]]+)\]/)?.[1]?.split(':')[0],
      ahead: 0,
      behind: 0,
      isRemote: name.startsWith('remotes/'),
    };
  });
}

export async function getTags(repoPath: string): Promise<GitTag[]> {
  const git = getGit(repoPath);
  const result = await git.tags(['--sort=-creatordate']);

  const tags: GitTag[] = [];
  for (const tagName of result.all) {
    try {
      const commit = await git.raw(['rev-parse', '--short', tagName]);
      tags.push({
        name: tagName,
        commit: commit.trim(),
      });
    } catch {
      tags.push({ name: tagName, commit: '' });
    }
  }

  return tags;
}

export async function getDiff(
  repoPath: string,
  commitHash?: string,
  filePath?: string
): Promise<string> {
  const git = getGit(repoPath);
  const args: string[] = [];

  if (commitHash) {
    args.push(`${commitHash}~1`, commitHash);
  }

  if (filePath) {
    args.push('--', filePath);
  }

  const diff = await git.diff(args);

  // If no diff and we have a file path, it might be untracked — generate synthetic diff
  if (!diff && filePath && !commitHash) {
    return generateUntrackedDiff(repoPath, filePath);
  }

  return diff;
}

function generateUntrackedDiff(repoPath: string, filePath: string): string {
  const normalized = normalizePath(repoPath);
  try {
    const fullPath = join(normalized, filePath);
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    // Remove trailing empty line if file ends with newline
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    const header = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n`;
    const hunk = `@@ -0,0 +1,${lines.length} @@\n`;
    const body = lines.map(l => `+${l}`).join('\n') + '\n';

    return header + hunk + body;
  } catch {
    return '';
  }
}

export async function getStagedDiff(repoPath: string, filePath?: string): Promise<string> {
  const git = getGit(repoPath);
  const args = ['--cached'];
  if (filePath) {
    args.push('--', filePath);
  }
  return git.diff(args);
}

export async function stageHunk(repoPath: string, patch: string): Promise<void> {
  const normalized = normalizePath(repoPath);
  execSync('git apply --cached -', { input: patch, cwd: normalized });
}

export async function discardHunk(repoPath: string, patch: string): Promise<void> {
  const normalized = normalizePath(repoPath);
  execSync('git apply --reverse -', { input: patch, cwd: normalized });
}

export async function stageFiles(repoPath: string, files: string[]): Promise<void> {
  const git = getGit(repoPath);
  await git.add(files);
}

export async function unstageFiles(repoPath: string, files: string[]): Promise<void> {
  const git = getGit(repoPath);
  await git.reset(['HEAD', '--', ...files]);
}

export async function commit(repoPath: string, message: string, amend = false): Promise<string> {
  const git = getGit(repoPath);

  // Read author identity: local repo config → container global → host global gitconfig
  const getVal = async (key: string): Promise<string> => {
    try {
      const local = (await git.raw(['config', '--local', key])).trim();
      if (local) return local;
    } catch { /* not set locally */ }
    try {
      const global = (await git.raw(['config', '--global', key])).trim();
      if (global) return global;
    } catch { /* not set globally */ }
    return readHostGitConfig(key);
  };

  const authorName = await getVal('user.name');
  const authorEmail = await getVal('user.email');

  if (!authorName || !authorEmail) {
    throw new Error('Author identity not configured. Please set Author Name and Email in Repository Settings before committing.');
  }

  // Use execSync with -c flags to pass author identity directly, bypassing container's missing global config
  const normalized = normalizePath(repoPath);
  const amendFlag = amend ? ' --amend' : '';
  const escapedMessage = message.replace(/'/g, "'\\''");
  const cmd = `git -c user.name='${authorName.replace(/'/g, "'\\''")}' -c user.email='${authorEmail.replace(/'/g, "'\\''")}' commit -m '${escapedMessage}'${amendFlag}`;
  const result = execSync(cmd, { cwd: normalized, encoding: 'utf-8' });
  // Extract commit hash from output like "[branch abc1234] message"
  const match = result.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
  return match ? match[1] : '';
}

export async function discardChanges(repoPath: string, files: string[]): Promise<void> {
  const git = getGit(repoPath);
  await git.checkout(['--', ...files]);
}

export async function deleteUntrackedFiles(repoPath: string, files: string[]): Promise<void> {
  const normalized = normalizePath(repoPath);
  const { unlinkSync } = await import('fs');
  for (const file of files) {
    try {
      unlinkSync(join(normalized, file));
    } catch { /* file may already be gone */ }
  }
}

export async function getConfig(repoPath: string): Promise<import('@sikagit/shared').RepoConfig> {
  const git = getGit(repoPath);
  const getVal = async (key: string) => {
    try {
      const local = (await git.raw(['config', '--local', key])).trim();
      if (local) return local;
    } catch { /* not set */ }
    try {
      const global = (await git.raw(['config', '--global', key])).trim();
      if (global) return global;
    } catch { /* not set */ }
    return readHostGitConfig(key) || undefined;
  };
  const remoteUrl = await getVal('remote.origin.url');
  const userName = await getVal('user.name');
  const userEmail = await getVal('user.email');
  const defaultBranch = await getVal('init.defaultBranch');
  return { userName, userEmail, defaultBranch, remoteUrl };
}

export async function setConfig(repoPath: string, key: string, value: string): Promise<void> {
  const git = getGit(repoPath);
  await git.raw(['config', '--local', key, value]);
}

export async function unsetConfig(repoPath: string, key: string): Promise<void> {
  const git = getGit(repoPath);
  try { await git.raw(['config', '--local', '--unset', key]); } catch { /* already unset */ }
}
