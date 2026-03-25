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
  Webhook,
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
  Gauge,
  Bot,
  ClipboardCheck,
  Bug,
  ShieldCheck,
  Workflow,
  Lock,
} from 'lucide-react';
import {
  getMenuItemsByGroup,
  detectPlatform,
  type MenuItem,
  type MenuGroup,
  type UserRole,
} from '@smartspec/shared';
import i18next from 'i18next';

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
  Gauge,
  Bot,
  ClipboardCheck,
  Webhook,
  Bug,
  ShieldCheck,
  Workflow,
  Lock,
};

export interface ResolvedMenuItem extends MenuItem {
  IconComponent: LucideIcon;
}

export function getResolvedMenuItems(
  role: UserRole,
  group: MenuGroup,
  overrides?: Array<{ menuItemId: string; visible: boolean; sortOrder?: number }>,
  enabledFeatures?: Record<string, boolean>,
): ResolvedMenuItem[] {
  const platform = detectPlatform();
  const items = getMenuItemsByGroup(platform, role, group, overrides, enabledFeatures);
  return items.map(item => {
    const navKey = `nav:sidebar.${item.id}`;
    const translatedLabel = i18next.exists(navKey) ? i18next.t(navKey) : item.label;
    return {
      ...item,
      label: translatedLabel,
      IconComponent: iconMap[item.icon] || Sparkles,
    };
  });
}
