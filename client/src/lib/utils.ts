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
