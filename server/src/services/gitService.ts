import simpleGit, { SimpleGit } from 'simple-git';
import { execSync } from 'child_process';
import { readFileSync, readdirSync, existsSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { GitCommit, GitBranch, GitTag, GitFileStatus, GitStatus } from '@sikagit/shared';
import { normalizePath } from './pathService';

/**
 * Per-repo mutex to serialize git operations and prevent index.lock conflicts.
 * Uses a queue-based approach to guarantee strict sequential execution.
 */
const repoQueues = new Map<string, { queue: Array<() => void>; running: boolean }>();

export function withRepoLock<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
  const key = normalizePath(repoPath);
  if (!repoQueues.has(key)) {
    repoQueues.set(key, { queue: [], running: false });
  }
  const state = repoQueues.get(key)!;

  return new Promise<T>((resolve, reject) => {
    const run = async () => {
      state.running = true;
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        const next = state.queue.shift();
        if (next) {
          next();
        } else {
          state.running = false;
        }
      }
    };

    if (state.running) {
      state.queue.push(run);
    } else {
      run();
    }
  });
}

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
  // core.quotepath=false makes git emit non-ASCII paths (Arabic, CJK, accents…)
  // as raw UTF-8 instead of octal escapes like "\330\261\331\210...". Simple-git
  // forwards this to every command as `-c core.quotepath=false`, so status,
  // diff, log, etc. all return human-readable paths.
  return simpleGit(normalized, {
    config: ['core.quotepath=false'],
  });
}

/**
 * Returns true if HEAD points to an existing commit. A freshly-initialized repo
 * with zero commits has an "unborn" HEAD, and any git command that references
 * HEAD (rev-parse, log, reset, checkout, diff) fails with
 * `fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree`.
 * Guard callers with this helper and branch to an empty-repo path instead.
 */
async function hasCommits(repoPath: string): Promise<boolean> {
  const git = getGit(repoPath);
  try {
    await git.revparse(['HEAD']);
    return true;
  } catch {
    return false;
  }
}

export async function getStatus(repoPath: string): Promise<GitStatus> {
  const git = getGit(repoPath);
  const status = await git.status();

  const normalized = normalizePath(repoPath);
  const mapFile = (f: { path: string; index: string; working_dir: string }): GitFileStatus => {
    let size: number | undefined;
    // Only get size for files that exist on disk (not deleted)
    if (f.working_dir !== 'D' && f.index !== 'D') {
      try {
        const fullPath = join(normalized, f.path);
        size = statSync(fullPath).size;
      } catch { /* file may not exist */ }
    }
    return {
      path: f.path,
      index: f.index,
      workingDir: f.working_dir,
      isStaged: f.index !== ' ' && f.index !== '?' && f.index !== '!',
      isConflicted: f.working_dir === 'U' || f.index === 'U',
      size,
    };
  };

  const files = status.files.map(mapFile);

  // Get remote URL for platform detection
  let remoteUrl: string | null = null;
  try {
    const url = (await git.raw(['remote', 'get-url', 'origin'])).trim();
    if (url) remoteUrl = url;
  } catch { /* no remote */ }

  return {
    current: status.current,
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    remoteUrl: remoteUrl || undefined,
    files,
    staged: files.filter(f => f.isStaged),
    unstaged: files.filter(f => f.workingDir !== ' ' && f.workingDir !== '?' && f.workingDir !== '!'),
    untracked: files.filter(f => f.index === '?' && f.workingDir === '?'),
    conflicted: status.conflicted,
  };
}

export async function getStatusSummary(repoPath: string): Promise<{
  ahead: number;
  behind: number;
  hasChanges: boolean;
  hasRemote: boolean;
}> {
  const git = getGit(repoPath);
  const status = await git.status();
  let hasRemote = false;
  try {
    const url = (await git.raw(['config', '--local', 'remote.origin.url'])).trim();
    hasRemote = url.length > 0;
  } catch {
    // No remote.origin.url configured
  }
  return {
    ahead: status.ahead,
    behind: status.behind,
    hasChanges: status.files.length > 0,
    hasRemote,
  };
}

export async function getLog(
  repoPath: string,
  limit = 200,
  skip = 0
): Promise<GitCommit[]> {
  const git = getGit(repoPath);

  if (!(await hasCommits(repoPath))) return [];

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
      '--all',
      '--reflog',
      '--date-order',
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

  // Deduplicate — reflog can show the same commit multiple times
  const seen = new Set<string>();
  const allCommits = entries.map(entry => {
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

  // Deduplicate commits (reflog may include the same hash multiple times)
  return allCommits.filter(c => {
    if (seen.has(c.hash)) return false;
    seen.add(c.hash);
    return true;
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

/**
 * Maximum size of a full diff payload we're willing to return to the client.
 * Diffs larger than this crash the browser tab when parsed/rendered (millions
 * of DOM nodes, huge JSON payloads). Anything beyond this is replaced with
 * a sentinel the client recognizes and renders as "diff too large".
 */
const MAX_DIFF_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Maximum size of an individual untracked file we'll read into memory and
 * convert to a synthetic diff. Beyond this we emit a "Binary files differ"
 * stub so the UI shows a placeholder instead of loading audio/video/huge
 * blobs into the browser.
 */
const MAX_UNTRACKED_DIFF_FILE_BYTES = 512 * 1024; // 512 KB

/** Sentinel returned to the client when the diff would be too large to render. */
export const DIFF_TOO_LARGE_MARKER = '__SIKAGIT_DIFF_TOO_LARGE__';

/**
 * Cheap binary detection: look for NUL bytes in the first ~8KB of the buffer.
 * This is how git itself decides whether a file is binary.
 */
function isBinaryBuffer(buf: Buffer, sampleSize = 8192): boolean {
  const n = Math.min(buf.length, sampleSize);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Emit a synthetic "Binary files differ" diff stub for an untracked file.
 * The client parser recognizes the `Binary files ... differ` line and
 * renders a "Binary file — preview not available" placeholder.
 */
function syntheticBinaryUntrackedDiff(filePath: string): string {
  return (
    `diff --git a/${filePath} b/${filePath}\n` +
    `new file mode 100644\n` +
    `--- /dev/null\n` +
    `+++ b/${filePath}\n` +
    `Binary files /dev/null and b/${filePath} differ\n`
  );
}

function capDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_BYTES) return diff;
  return `${DIFF_TOO_LARGE_MARKER} ${diff.length}\n`;
}

export async function getDiff(
  repoPath: string,
  commitHash?: string,
  filePath?: string
): Promise<string> {
  const git = getGit(repoPath);
  const args: string[] = [];

  if (commitHash) {
    // Root commits have no parent, so `commitHash~1` errors out. Detect that
    // case and diff against Git's canonical empty tree instead.
    const parents = execSync(`git rev-list --parents -n 1 ${commitHash}`, {
      cwd: normalizePath(repoPath),
      encoding: 'utf-8',
    }).trim().split(/\s+/);
    const hasParent = parents.length > 1;
    const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    args.push(hasParent ? `${commitHash}~1` : EMPTY_TREE, commitHash);
  }

  if (filePath) {
    args.push('--', filePath);
  }

  const diff = await git.diff(args);

  // If no diff and we have a file path, it might be untracked — generate synthetic diff
  if (!diff && filePath && !commitHash) {
    return capDiff(generateUntrackedDiff(repoPath, filePath));
  }

  return capDiff(diff);
}

function generateUntrackedDiff(repoPath: string, filePath: string): string {
  const normalized = normalizePath(repoPath);
  try {
    const fullPath = join(normalized, filePath);
    const stat = statSync(fullPath);
    if (!stat.isFile()) return '';

    // Oversized file — never read into memory. Emit a binary-style stub so the
    // client short-circuits rendering and shows a placeholder.
    if (stat.size > MAX_UNTRACKED_DIFF_FILE_BYTES) {
      return syntheticBinaryUntrackedDiff(filePath);
    }

    // Read as Buffer first so we can binary-sniff without an invalid UTF-8
    // decode turning audio/video bytes into millions of replacement chars.
    const buf = readFileSync(fullPath);
    if (isBinaryBuffer(buf)) {
      return syntheticBinaryUntrackedDiff(filePath);
    }

    const content = buf.toString('utf-8');
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

export async function getCommitFiles(repoPath: string, commitHash: string): Promise<{ path: string; status: string }[]> {
  const normalized = normalizePath(repoPath);
  // -c core.quotepath=false keeps non-ASCII paths (Arabic, CJK…) as raw UTF-8
  // instead of octal escapes in the --name-status output.
  const output = execSync(`git -c core.quotepath=false diff-tree --no-commit-id -r --name-status ${commitHash}`, { cwd: normalized, encoding: 'utf-8' }).trim();
  if (!output) return [];
  return output.split('\n').map(line => {
    const [status, ...pathParts] = line.split('\t');
    return { path: pathParts.join('\t'), status: status.charAt(0) };
  });
}

export async function getStagedDiff(repoPath: string, filePath?: string): Promise<string> {
  const git = getGit(repoPath);
  const args = ['--cached'];
  if (filePath) {
    args.push('--', filePath);
  }
  return capDiff(await git.diff(args));
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
  if (!(await hasCommits(repoPath))) {
    // No HEAD to reset to. Remove the entries from the index directly; --cached
    // leaves the working-tree copy on disk. -f bypasses the safety check that
    // fires when the working-tree copy differs from the index entry — since we
    // are only unstaging (not deleting), that divergence is exactly the state
    // we intend to preserve.
    await git.raw(['rm', '--cached', '-f', '--', ...files]);
    return;
  }
  await git.reset(['HEAD', '--', ...files]);
}

export async function unstageAll(repoPath: string): Promise<void> {
  const git = getGit(repoPath);
  if (!(await hasCommits(repoPath))) {
    const status = await git.status();
    const staged = Array.from(new Set([...status.staged, ...status.created]));
    if (staged.length > 0) {
      await git.raw(['rm', '--cached', '-f', '--', ...staged]);
    }
    return;
  }
  await git.reset(['HEAD']);
}

export async function commit(repoPath: string, message: string, amend = false): Promise<string> {
  const author = await getAuthorIdentity(repoPath);

  if (!author.name || !author.email) {
    throw new Error('Author identity not configured. Please set Author Name and Email in Repository Settings before committing.');
  }

  const normalized = normalizePath(repoPath);
  const amendFlag = amend ? ' --amend' : '';
  const escapedMessage = message.replace(/'/g, "'\\''");
  const escapedName = author.name.replace(/'/g, "'\\''");
  const escapedEmail = author.email.replace(/'/g, "'\\''");
  const cmd = `git -c user.name='${escapedName}' -c user.email='${escapedEmail}' commit -m '${escapedMessage}'${amendFlag}`;
  const result = execSync(cmd, { cwd: normalized, encoding: 'utf-8' });
  const match = result.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
  return match ? match[1] : '';
}

export async function uncommit(repoPath: string, commitHash: string): Promise<void> {
  const git = getGit(repoPath);
  const head = (await git.revparse(['HEAD'])).trim();
  if (head !== commitHash) {
    throw new Error('Can only uncommit the most recent commit (HEAD)');
  }
  await git.reset(['--mixed', 'HEAD~1']);
}

export async function mergeBranch(
  repoPath: string,
  sourceBranch: string
): Promise<{ message: string; merged: boolean; conflicts?: string[] }> {
  const git = getGit(repoPath);
  const status = await git.status();
  const currentBranch = status.current || 'HEAD';

  try {
    await git.merge([sourceBranch]);
    return {
      merged: true,
      message: `Merged ${sourceBranch} into ${currentBranch}`,
    };
  } catch (err: any) {
    // Check if it's a merge conflict
    const postStatus = await git.status();
    if (postStatus.conflicted.length > 0) {
      return {
        merged: false,
        message: `Merge conflict: ${postStatus.conflicted.length} file(s) need resolution`,
        conflicts: postStatus.conflicted,
      };
    }
    throw err;
  }
}

export async function abortMerge(repoPath: string): Promise<void> {
  const git = getGit(repoPath);
  await git.merge(['--abort']);
}

export async function deleteBranch(repoPath: string, branchName: string, force = false): Promise<void> {
  const git = getGit(repoPath);
  await git.branch([force ? '-D' : '-d', branchName]);
}

export async function checkoutCommit(repoPath: string, commitHash: string): Promise<{ branch: string }> {
  const git = getGit(repoPath);
  const status = await git.status();

  // Check if any local branch points at this commit — if so, switch to it
  const branches = await git.branchLocal();
  let targetBranch: string | null = null;

  for (const b of branches.all) {
    try {
      const branchHash = (await git.raw(['rev-parse', b])).trim();
      if (branchHash === commitHash || branchHash.startsWith(commitHash) || commitHash.startsWith(branchHash)) {
        targetBranch = b;
        break;
      }
    } catch { /* ignore */ }
  }

  // Also check if any remote branch points at this commit and create a local tracking branch
  if (!targetBranch) {
    try {
      const remoteRefs = (await git.raw(['branch', '-r', '--points-at', commitHash])).trim();
      if (remoteRefs) {
        const firstRef = remoteRefs.split('\n')[0].trim();
        // e.g. "origin/feature/post-production-daw" → "feature/post-production-daw"
        const match = firstRef.match(/^origin\/(.+)$/);
        if (match && !branches.all.includes(match[1])) {
          // Create local tracking branch
          await git.raw(['checkout', '-b', match[1], firstRef]);
          return { branch: match[1] };
        } else if (match) {
          targetBranch = match[1];
        }
      }
    } catch { /* ignore */ }
  }

  if (targetBranch && targetBranch !== status.current) {
    // Switch to the branch that points at this commit
    await git.checkout([targetBranch]);
    return { branch: targetBranch };
  }

  // No branch at this commit — move the current branch to it
  let branch = status.current;
  if (!branch || branch === 'HEAD') {
    let remoteBranch: string | null = null;
    try {
      const remoteInfo = await git.raw(['remote', 'show', 'origin']);
      const headMatch = remoteInfo.match(/HEAD branch:\s*(\S+)/);
      if (headMatch) remoteBranch = headMatch[1];
    } catch { /* no remote configured */ }
    branch = (remoteBranch && branches.all.find(b => b === remoteBranch))
      || branches.all[0]
      || null;
    if (!branch) {
      throw new Error('No local branch found to move.');
    }
    await git.raw(['branch', '-f', branch, commitHash]);
    await git.checkout([branch]);
  } else {
    await git.reset(['--hard', commitHash]);
  }

  return { branch };
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

export async function saveForLater(
  repoPath: string,
  files: string[],
  branchName: string,
  message: string
): Promise<{ branch: string; commitHash: string }> {
  const git = getGit(repoPath);
  const normalized = normalizePath(repoPath);
  const status = await git.status();
  const currentBranch = status.current;

  if (!currentBranch) {
    throw new Error('Cannot save for later in detached HEAD state');
  }
  if (status.conflicted.length > 0) {
    throw new Error('Cannot save for later while there are merge conflicts');
  }

  // Validate branch name doesn't exist
  const branches = await git.branchLocal();
  if (branches.all.includes(branchName)) {
    throw new Error(`Branch "${branchName}" already exists`);
  }

  // Categorize files
  const statusMap = new Map<string, GitFileStatus>();
  const allFiles = [...(status.files || [])];
  for (const f of allFiles) {
    statusMap.set(f.path, f as unknown as GitFileStatus);
  }

  // Remember currently staged files to restore after
  const savedStaged = status.staged || [];

  // Create the save branch from HEAD
  await git.branch([branchName]);

  try {
    // Switch to save branch (carries working tree changes along)
    await git.checkout([branchName]);

    // Clear index, then stage only selected files
    await git.reset(['HEAD']);
    await git.add(files);

    // Commit using execSync with author identity (matching existing commit() pattern)
    const author = await getAuthorIdentity(repoPath);
    if (!author.name || !author.email) {
      throw new Error('Author identity not configured. Please set Author Name and Email in Repository Settings.');
    }
    const escapedMessage = message.replace(/'/g, "'\\''");
    const escapedName = author.name.replace(/'/g, "'\\''");
    const escapedEmail = author.email.replace(/'/g, "'\\''");
    const cmd = `git -c user.name='${escapedName}' -c user.email='${escapedEmail}' commit -m '${escapedMessage}'`;
    const result = execSync(cmd, { cwd: normalized, encoding: 'utf-8' });
    const match = result.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
    const commitHash = match ? match[1] : '';

    // Switch back to original branch
    await git.checkout([currentBranch]);

    // Clean up saved files from working tree
    const trackedFiles: string[] = [];
    const untrackedFiles: string[] = [];
    for (const file of files) {
      const fileStatus = statusMap.get(file);
      if (fileStatus && (fileStatus as any).index === '?') {
        untrackedFiles.push(file);
      } else {
        trackedFiles.push(file);
      }
    }

    // Restore tracked files to HEAD version
    if (trackedFiles.length > 0) {
      await git.checkout(['HEAD', '--', ...trackedFiles]);
    }

    // Delete untracked files
    for (const file of untrackedFiles) {
      try {
        unlinkSync(join(normalized, file));
      } catch { /* file may already be gone */ }
    }

    // Re-stage originally staged files (minus any that were saved)
    const savedSet = new Set(files);
    const toRestage = savedStaged.filter((f: string) => !savedSet.has(f));
    if (toRestage.length > 0) {
      await git.add(toRestage);
    }

    return { branch: branchName, commitHash };
  } catch (err) {
    // Rollback: try to get back to original branch and delete save branch
    try { await git.checkout([currentBranch]); } catch { /* best effort */ }
    try { await git.branch(['-D', branchName]); } catch { /* best effort */ }
    // Re-stage saved staged files
    if (savedStaged.length > 0) {
      try { await git.add(savedStaged); } catch { /* best effort */ }
    }
    throw err;
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

export async function setRemoteUrl(repoPath: string, url: string): Promise<void> {
  const git = getGit(repoPath);
  if (!url.trim()) {
    // Remove remote if URL is empty
    try { await git.raw(['remote', 'remove', 'origin']); } catch { /* no remote to remove */ }
    return;
  }
  try {
    // Try set-url first (works if remote already exists)
    await git.raw(['remote', 'set-url', 'origin', url.trim()]);
  } catch {
    // Remote doesn't exist, add it
    await git.raw(['remote', 'add', 'origin', url.trim()]);
  }
}

export async function testRemoteConnection(repoPath: string, url?: string): Promise<{ ok: boolean; error?: string }> {
  const normalized = normalizePath(repoPath);
  try {
    // Test URL directly if provided, otherwise test origin
    const target = url ? `'${url.replace(/'/g, "'\\''")}'` : 'origin';
    execSync(`git ls-remote ${target}`, { cwd: normalized, encoding: 'utf-8', timeout: 15000, stdio: 'pipe' });
    return { ok: true };
  } catch (err: any) {
    const msg = err.stderr?.trim() || err.message || 'Connection failed';
    return { ok: false, error: msg };
  }
}

export async function gitFetch(repoPath: string): Promise<void> {
  const git = getGit(repoPath);
  await git.fetch('origin');
}

async function getAuthorIdentity(repoPath: string): Promise<{ name: string; email: string }> {
  const git = getGit(repoPath);
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
  return { name: await getVal('user.name'), email: await getVal('user.email') };
}

export async function gitPull(
  repoPath: string,
  strategy?: 'merge' | 'rebase',
  allowUnrelatedHistories?: boolean,
): Promise<string> {
  const git = getGit(repoPath);
  const normalized = normalizePath(repoPath);
  const status = await git.status();

  const doPull = async (remote?: string, branch?: string) => {
    try {
      // For merge strategy, we need author identity for the merge commit
      const needsIdentity = strategy === 'merge';
      const pullArgs: string[] = [];

      if (strategy === 'rebase') pullArgs.push('--rebase');
      else if (strategy === 'merge') pullArgs.push('--no-rebase');
      if (allowUnrelatedHistories) pullArgs.push('--allow-unrelated-histories');

      if (remote) pullArgs.push(remote);
      if (branch) pullArgs.push(branch);

      let output: string;
      if (needsIdentity) {
        const author = await getAuthorIdentity(repoPath);
        if (!author.name || !author.email) {
          throw new Error('Author identity not configured. Please set Author Name and Email in Repository Settings.');
        }
        const escapedName = author.name.replace(/'/g, "'\\''");
        const escapedEmail = author.email.replace(/'/g, "'\\''");
        const cmd = `git -c user.name='${escapedName}' -c user.email='${escapedEmail}' pull ${pullArgs.join(' ')}`;
        output = execSync(cmd, { cwd: normalized, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      } else {
        output = await git.raw(['pull', ...pullArgs]);
      }

      if (output.includes('Already up to date')) return 'Already up to date';
      const changesMatch = output.match(/(\d+) files? changed/);
      return changesMatch ? `${changesMatch[1]} file(s) changed` : 'Pulled successfully';
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Need to specify how to reconcile divergent branches') ||
          msg.includes('need to specify how to reconcile divergent branches')) {
        throw new Error('DIVERGED');
      }
      if (msg.includes('refusing to merge unrelated histories') ||
          msg.includes('fatal: no common commits')) {
        throw new Error('UNRELATED_HISTORIES');
      }
      throw err;
    }
  };

  if (status.tracking) {
    return doPull();
  }

  // Get current branch — on a fresh repo with no commits, HEAD doesn't exist
  let branch: string;
  try {
    branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
  } catch {
    // Fresh repo with no commits — detect the remote's default branch
    branch = 'main';
    try {
      const remoteInfo = await git.raw(['remote', 'show', 'origin']);
      const headMatch = remoteInfo.match(/HEAD branch:\s*(\S+)/);
      if (headMatch) branch = headMatch[1];
    } catch {
      // No remote or unreachable — try git config default
      try {
        const configured = (await git.raw(['config', 'init.defaultBranch'])).trim();
        if (configured) branch = configured;
      } catch { /* use 'main' as last resort */ }
    }
  }

  try {
    return await doPull('origin', branch);
  } catch (err: any) {
    if (err.message?.includes("couldn't find remote ref")) {
      throw new Error(`Branch "${branch}" does not exist on the remote. Push first to create it, or set an upstream branch.`);
    }
    throw err;
  }
}

function isNonFastForwardError(msg: string): boolean {
  if (!msg) return false;
  return (
    msg.includes('! [rejected]') ||
    msg.includes('(fetch first)') ||
    msg.includes('(non-fast-forward)') ||
    msg.includes('Updates were rejected because the remote contains work') ||
    msg.includes('Updates were rejected because the tip of your current branch is behind')
  );
}

export async function gitPush(repoPath: string, setUpstream?: boolean, upToCommit?: string, force?: boolean): Promise<string> {
  const git = getGit(repoPath);
  if (!(await hasCommits(repoPath))) {
    throw new Error('Nothing to push — repository has no commits yet. Make your first commit before pushing.');
  }
  const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();

  try {
    if (upToCommit) {
      // Push only up to a specific commit: git push origin <hash>:refs/heads/<branch>
      const args = ['origin', `${upToCommit}:refs/heads/${branch}`];
      if (force) args.unshift('--force-with-lease');
      await git.push(args);
      return `Pushed up to ${upToCommit.slice(0, 7)}`;
    }

    if (setUpstream) {
      const args = ['--set-upstream', 'origin', branch];
      if (force) args.unshift('--force-with-lease');
      await git.push(args);
      return `Pushed and set upstream for ${branch}`;
    }
    if (force) {
      await git.push(['--force-with-lease', 'origin', branch]);
    } else {
      await git.push('origin');
    }
    return force ? `Force pushed ${branch} successfully` : 'Pushed successfully';
  } catch (err: any) {
    if (!force && isNonFastForwardError(err?.message || '')) {
      throw new Error('REJECTED_NON_FAST_FORWARD');
    }
    throw err;
  }
}

export async function getFileContent(repoPath: string, filePath: string, commitHash?: string): Promise<Buffer> {
  const normalized = normalizePath(repoPath);
  if (commitHash) {
    // Get file content from a specific commit
    const result = execSync(`git show ${commitHash}:${filePath}`, { cwd: normalized, maxBuffer: 10 * 1024 * 1024 });
    return result;
  }
  // Working tree file
  return readFileSync(join(normalized, filePath));
}
