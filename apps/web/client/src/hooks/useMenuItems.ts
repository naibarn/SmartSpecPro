import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp,
  MessageSquare,
  Sparkles,
  Settings,
  Image,
  Clock,
  CreditCard,
  Building2,
  Server,
  Activity,
  Users,
  Package,
  Brain,
  Layers,
  Wand2,
  GitBranch,
  Cloud,
  Images,
  UserCog,
  FileText,
  Palette,
  PenLine,
  Terminal,
  Container,
  Factory,
  Store,
  GalleryHorizontal,
  Coins,
  ExternalLink,
  Film,
} from 'lucide-react';
import {
  getMenuItemsByGroup,
  detectPlatform,
  type MenuItem,
  type MenuGroup,
  type UserRole,
} from '@smartspec/shared';

const iconMap: Record<string, LucideIcon> = {
  TrendingUp,
  MessageSquare,
  Sparkles,
  Settings,
  Image,
  Clock,
  CreditCard,
  Building2,
  Server,
  Activity,
  Users,
  Package,
  Brain,
  Layers,
  Wand2,
  GitBranch,
  Cloud,
  Images,
  UserCog,
  FileText,
  Palette,
  PenLine,
  Terminal,
  Container,
  Factory,
  Store,
  GalleryHorizontal,
  Coins,
  ExternalLink,
  Film,
};

export interface ResolvedMenuItem extends MenuItem {
  IconComponent: LucideIcon;
}

export function getResolvedMenuItems(
  role: UserRole,
  group: MenuGroup,
  overrides?: Array<{ menuItemId: string; visible: boolean; sortOrder?: number }>,
): ResolvedMenuItem[] {
  const platform = detectPlatform();
  const items = getMenuItemsByGroup(platform, role, group, overrides);
  return items.map(item => ({
    ...item,
    IconComponent: iconMap[item.icon] || Sparkles,
  }));
}
