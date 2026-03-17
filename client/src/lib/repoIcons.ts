import {
  Server, Layout, Smartphone, Monitor, Globe, Package,
  Terminal, Database, Cloud, BookOpen, Gamepad2, Brain,
  ShoppingCart, FileCode2, Blocks, Palette, Music, Cog,
  GitBranch,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface RepoIconEntry {
  name: string;
  label: string;
  Icon: LucideIcon;
}

export const REPO_ICONS: RepoIconEntry[] = [
  { name: 'backend', label: 'Backend', Icon: Server },
  { name: 'frontend', label: 'Frontend', Icon: Layout },
  { name: 'mobile', label: 'Mobile App', Icon: Smartphone },
  { name: 'desktop', label: 'Desktop App', Icon: Monitor },
  { name: 'api', label: 'API', Icon: Globe },
  { name: 'library', label: 'Library / Package', Icon: Package },
  { name: 'cli', label: 'CLI Tool', Icon: Terminal },
  { name: 'database', label: 'Database', Icon: Database },
  { name: 'devops', label: 'DevOps / Infra', Icon: Cloud },
  { name: 'docs', label: 'Documentation', Icon: BookOpen },
  { name: 'game', label: 'Game', Icon: Gamepad2 },
  { name: 'ai', label: 'AI / ML', Icon: Brain },
  { name: 'ecommerce', label: 'E-commerce', Icon: ShoppingCart },
  { name: 'scripts', label: 'Scripts', Icon: FileCode2 },
  { name: 'microservice', label: 'Microservice', Icon: Blocks },
  { name: 'design', label: 'Design', Icon: Palette },
  { name: 'media', label: 'Media', Icon: Music },
  { name: 'config', label: 'Config / Tools', Icon: Cog },
];

const ICON_MAP = new Map(REPO_ICONS.map(e => [e.name, e]));

export function getRepoIcon(iconName?: string): { Icon: LucideIcon; label: string } {
  if (iconName && !iconName.startsWith('data:')) {
    const entry = ICON_MAP.get(iconName);
    if (entry) return { Icon: entry.Icon, label: entry.label };
  }
  return { Icon: GitBranch, label: 'Repository' };
}

export function isCustomImage(avatar?: string): boolean {
  return !!avatar && avatar.startsWith('data:');
}
