import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

export function truncateHash(hash: string, length = 7): string {
  return hash.substring(0, length);
}

export function getStatusColor(index: string, workingDir: string): string {
  if (index === 'U' || workingDir === 'U') return 'text-[var(--color-status-conflict)]';
  if (index === 'M' || workingDir === 'M') return 'text-[var(--color-status-modified)]';
  if (index === 'A' || index === '?') return 'text-[var(--color-status-added)]';
  if (index === 'D' || workingDir === 'D') return 'text-[var(--color-status-deleted)]';
  if (index === 'R') return 'text-[var(--color-status-renamed)]';
  return 'text-[var(--color-status-untracked)]';
}

export function getStatusLabel(index: string, workingDir: string): string {
  if (index === 'U' || workingDir === 'U') return 'C';
  if (index === 'M' || workingDir === 'M') return 'M';
  if (index === 'A') return 'A';
  if (index === '?') return 'U';
  if (index === 'D' || workingDir === 'D') return 'D';
  if (index === 'R') return 'R';
  return '?';
}

export interface CommitType {
  label: string;
  color: string; // tailwind text color class
  bg: string;    // tailwind bg color class
}

const COMMIT_TYPES: { prefix: RegExp; type: CommitType }[] = [
  { prefix: /^feat(\(.*?\))?[!:]/, type: { label: 'Feature', color: 'text-success', bg: 'bg-success/12' } },
  { prefix: /^fix(\(.*?\))?[!:]/, type: { label: 'Fix', color: 'text-danger', bg: 'bg-danger/12' } },
  { prefix: /^refactor(\(.*?\))?[!:]/, type: { label: 'Refactor', color: 'text-accent', bg: 'bg-accent/12' } },
  { prefix: /^perf(\(.*?\))?[!:]/, type: { label: 'Perf', color: 'text-warning', bg: 'bg-warning/12' } },
  { prefix: /^docs(\(.*?\))?[!:]/, type: { label: 'Docs', color: 'text-[#5ccfd6]', bg: 'bg-[#5ccfd6]/12' } },
  { prefix: /^test(\(.*?\))?[!:]/, type: { label: 'Test', color: 'text-[#b88cf5]', bg: 'bg-[#b88cf5]/12' } },
  { prefix: /^style(\(.*?\))?[!:]/, type: { label: 'Style', color: 'text-[#e88ab8]', bg: 'bg-[#e88ab8]/12' } },
  { prefix: /^chore(\(.*?\))?[!:]/, type: { label: 'Chore', color: 'text-text-muted', bg: 'bg-text-muted/12' } },
  { prefix: /^ci(\(.*?\))?[!:]/, type: { label: 'CI', color: 'text-[#d4854a]', bg: 'bg-[#d4854a]/12' } },
  { prefix: /^build(\(.*?\))?[!:]/, type: { label: 'Build', color: 'text-[#d4854a]', bg: 'bg-[#d4854a]/12' } },
  { prefix: /^revert(\(.*?\))?[!:]/, type: { label: 'Revert', color: 'text-danger', bg: 'bg-danger/12' } },
  { prefix: /^hotfix(\(.*?\))?[!:]/, type: { label: 'Hotfix', color: 'text-danger', bg: 'bg-danger/12' } },
];

// Keyword-based fallback detection
const KEYWORD_TYPES: { keywords: RegExp; type: CommitType }[] = [
  { keywords: /^(add|implement|introduce|create|new)\b/i, type: { label: 'Feature', color: 'text-success', bg: 'bg-success/12' } },
  { keywords: /^(fix|resolve|patch|repair|correct)\b/i, type: { label: 'Fix', color: 'text-danger', bg: 'bg-danger/12' } },
  { keywords: /^(refactor|restructure|reorganize|clean|simplify)\b/i, type: { label: 'Refactor', color: 'text-accent', bg: 'bg-accent/12' } },
  { keywords: /^(update|change|modify|adjust|improve|enhance|optimize)\b/i, type: { label: 'Update', color: 'text-warning', bg: 'bg-warning/12' } },
  { keywords: /^(remove|delete|drop|deprecate)\b/i, type: { label: 'Remove', color: 'text-danger', bg: 'bg-danger/12' } },
  { keywords: /^(rename|move|migrate)\b/i, type: { label: 'Refactor', color: 'text-accent', bg: 'bg-accent/12' } },
  { keywords: /^(test|spec)\b/i, type: { label: 'Test', color: 'text-[#b88cf5]', bg: 'bg-[#b88cf5]/12' } },
  { keywords: /^(doc|readme|comment)\b/i, type: { label: 'Docs', color: 'text-[#5ccfd6]', bg: 'bg-[#5ccfd6]/12' } },
  { keywords: /^(merge|revert)\b/i, type: { label: 'Merge', color: 'text-text-muted', bg: 'bg-text-muted/12' } },
  { keywords: /^(initial|init|setup|bootstrap)\b/i, type: { label: 'Init', color: 'text-success', bg: 'bg-success/12' } },
  { keywords: /^(release|version|bump|v\d)/i, type: { label: 'Release', color: 'text-[#e88ab8]', bg: 'bg-[#e88ab8]/12' } },
];

export function detectCommitType(message: string): CommitType | null {
  const msg = message.trim();

  // 1. Check conventional commit prefixes
  for (const { prefix, type } of COMMIT_TYPES) {
    if (prefix.test(msg)) return type;
  }

  // 2. Keyword-based fallback
  for (const { keywords, type } of KEYWORD_TYPES) {
    if (keywords.test(msg)) return type;
  }

  return null;
}
