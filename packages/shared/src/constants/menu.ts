import type { Platform } from './platform';

export type UserRole = 'user' | 'admin' | 'domain_admin';

export type MenuGroup = 'main' | 'admin' | 'domain-admin';

export interface MenuItem {
  id: string;
  label: string;
  labelTh?: string;
  icon: string;
  path: string;
  platforms: Platform[];
  roles?: UserRole[];
  group?: MenuGroup;
  section?: 'documents' | 'private';
  parentId?: string;
  external?: boolean;
  requiresFeature?: string;
  children?: MenuItem[];
  sortOrder: number;
}

export const defaultMenuItems: MenuItem[] = [
  // === Main group (shared across web & desktop) ===
  { id: 'dashboard',     label: 'Dashboard',      labelTh: 'แดชบอร์ด',      icon: 'TrendingUp',      path: '/dashboard',      platforms: ['web', 'desktop'], group: 'main', sortOrder: 0 },
  { id: 'chat',          label: 'Chat (LLM)',     labelTh: 'แชท AI',        icon: 'MessageSquare',   path: '/chat',           platforms: ['web', 'desktop'], group: 'main', sortOrder: 1 },
  { id: 'work-request',  label: 'Start Work',     labelTh: 'เริ่มงาน',      icon: 'PenLine',         path: '/work/request',   platforms: ['web', 'desktop'], group: 'main', sortOrder: 1.05 },
  { id: 'my-requests',   label: 'My Requests',    labelTh: 'งานของฉัน',     icon: 'ClipboardCheck',  path: '/work/requests',  platforms: ['web', 'desktop'], group: 'main', sortOrder: 1.06 },
  { id: 'finance',       label: 'Finance',        labelTh: 'การเงิน',       icon: 'Wallet',          path: '/finance',        platforms: ['web', 'desktop'], group: 'main', sortOrder: 1.1 },
  { id: 'finance-reports', label: 'Finance Reports', labelTh: 'รายงานการเงิน', icon: 'BarChart3', path: '/finance/reports', platforms: ['web', 'desktop'], group: 'main', sortOrder: 1.2 },
  { id: 'media',         label: 'Media Studio',   labelTh: 'สตูดิโอ',       icon: 'Sparkles',        path: '/media-studio',   platforms: ['web', 'desktop'], group: 'main', sortOrder: 2 },
  { id: 'skills',        label: 'Skills',         labelTh: 'ทักษะ',         icon: 'Sparkles',        path: '/settings/skills', platforms: ['web', 'desktop'], group: 'main', sortOrder: 3 },
  { id: 'workflows',     label: 'Workflows',      labelTh: 'เวิร์กโฟลว์',    icon: 'GitBranch',       path: '/workflows',      platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.5 },
  { id: 'webhook-triggers', label: 'Webhook Triggers', labelTh: 'เว็บฮุก', icon: 'Webhook', path: '/webhook-triggers', platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.6, requiresFeature: 'webhookTriggers' },
  { id: 'agencies',      label: 'Agencies',       labelTh: 'เอเจนซี่',       icon: 'Users',           path: '/agencies',       platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.7, requiresFeature: 'AGENCY_SWARM_ENABLED' },
  { id: 'teams',         label: 'Teams',          labelTh: 'ทีม AI',         icon: 'UsersRound',      path: '/teams',          platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.75, requiresFeature: 'orchestratorEnabled' },
  { id: 'role-monitor',  label: 'Role Monitor',   labelTh: 'มอนิเตอร์บทบาท', icon: 'Radar',         path: '/role-monitor',   platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.76, requiresFeature: 'orchestratorEnabled' },
  { id: 'automation',    label: 'Automation Copilot', labelTh: 'ระบบอัตโนมัติ', icon: 'Bot', path: '/automation', platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.8, requiresFeature: 'automationCopilot' },
  { id: 'social-channels', label: 'Social Channels', icon: 'Share2', path: '/social/channels', platforms: ['web', 'desktop'], group: 'main', sortOrder: 7.0, requiresFeature: 'META_CHANNELS_ENABLED' },
  { id: 'social-inbox', label: 'Social Inbox', icon: 'MessageCircleMore', path: '/social/inbox', platforms: ['web', 'desktop'], group: 'main', sortOrder: 7.1, requiresFeature: 'META_CHANNELS_ENABLED' },
  { id: 'social-publishing', label: 'Social Publishing', icon: 'Send', path: '/social/publishing', platforms: ['web', 'desktop'], group: 'main', sortOrder: 7.2, requiresFeature: 'META_CHANNELS_ENABLED' },
  { id: 'social-moderation', label: 'Social Moderation', icon: 'ShieldCheck', path: '/social/moderation', platforms: ['web', 'desktop'], group: 'main', sortOrder: 7.3, requiresFeature: 'META_CHANNELS_ENABLED' },
  { id: 'social-automation', label: 'Social Automation', icon: 'Workflow', path: '/social/automation', platforms: ['web', 'desktop'], group: 'main', sortOrder: 7.4, requiresFeature: 'META_CHANNELS_ENABLED' },
  { id: 'media-history', label: 'Media History',  labelTh: 'ประวัติมีเดีย',  icon: 'Clock',           path: '/media-history',  platforms: ['web', 'desktop'], group: 'main', sortOrder: 4 },
  { id: 'document-management', label: 'Library', labelTh: 'คลังเอกสาร', icon: 'FileText', path: '/document-management', platforms: ['web', 'desktop'], group: 'main', section: 'documents', sortOrder: 4.2 },
  { id: 'private-files', label: 'Private Files', labelTh: 'ไฟล์ส่วนตัว', icon: 'Lock', path: '/document-management?scope=private_vault&sort=updated_desc', platforms: ['web', 'desktop'], group: 'main', parentId: 'document-management', sortOrder: 4.21 },
  { id: 'presentations', label: 'Presentations', labelTh: 'พรีเซนเทชัน', icon: 'GalleryHorizontal', path: '/presentations', platforms: ['web', 'desktop'], group: 'main', sortOrder: 4.25 },
  { id: 'groups',              label: 'Groups',              labelTh: 'กลุ่ม',          icon: 'Users',    path: '/groups',              platforms: ['web', 'desktop'], group: 'main', sortOrder: 4.3 },
  { id: 'factory',       label: 'SaaS Factory',   labelTh: 'โรงงาน',        icon: 'Factory',         path: '/factory',        platforms: ['web', 'desktop'], group: 'main', sortOrder: 5 },
  { id: 'terminal',      label: 'Terminal',        labelTh: 'เทอร์มินัล',    icon: 'Terminal',        path: '/terminal',       platforms: ['web', 'desktop'], group: 'main', sortOrder: 6 },
  { id: 'kilo',          label: 'CLI',             labelTh: 'CLI',           icon: 'Terminal',        path: '/kilo',           platforms: ['web', 'desktop'], group: 'main', sortOrder: 7 },
  { id: 'docker',        label: 'Docker Sandbox',  labelTh: 'แซนด์บ็อกซ์',   icon: 'Container',       path: '/docker',         platforms: ['web', 'desktop'], group: 'main', sortOrder: 8 },
  { id: 'video-editor',  label: 'Video Editor',    labelTh: 'ตัดต่อวีดีโอ',   icon: 'Film',            path: '/video-editor',   platforms: ['web', 'desktop'], group: 'main', sortOrder: 8.5 },
  { id: 'credits',       label: 'Credits',         labelTh: 'เครดิต',        icon: 'CreditCard',      path: '/credits',        platforms: ['web', 'desktop'], group: 'main', sortOrder: 9 },
  { id: 'usage-analytics', label: 'Usage Analytics', labelTh: 'สถิติการใช้งาน', icon: 'BarChart3',       path: '/usage',          platforms: ['web', 'desktop'], group: 'main', sortOrder: 9.5 },
  { id: 'my-feedback',   label: 'My Feedback',     labelTh: 'ข้อเสนอของฉัน',  icon: 'MessageSquare',   path: '/my-feedback',    platforms: ['web', 'desktop'], group: 'main', sortOrder: 98 },
  { id: 'settings',      label: 'Settings',        labelTh: 'ตั้งค่า',       icon: 'Settings',        path: '/settings',       platforms: ['web', 'desktop'], group: 'main', sortOrder: 99 },

  // === Admin group ===
  { id: 'admin-overview',       label: 'Admin Command Center', labelTh: 'ศูนย์บัญชาการระบบ', icon: 'LayoutDashboard', path: '/admin/dashboard', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 18 },
  { id: 'admin-ops',            label: 'Advanced Ops Panels', labelTh: 'แผงวิเคราะห์เชิงลึก', icon: 'Activity', path: '/admin/ops', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 19 },
  { id: 'admin-funnel',         label: 'Funnel Analytics',  labelTh: 'วิเคราะห์ Funnel', icon: 'TrendingUp', path: '/admin/funnel',             platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 19.5, requiresFeature: 'FUNNEL_DASHBOARD' },
  { id: 'admin-approvals',      label: 'Approvals',         labelTh: 'อนุมัติ',        icon: 'ClipboardCheck', path: '/admin/approvals',       platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 19.8 },
  { id: 'admin-tenants',        label: 'Tenants',           icon: 'Building2',   path: '/admin/tenants',            platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 20 },
  { id: 'admin-services',       label: 'Services',          icon: 'Server',      path: '/admin/services',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21 },
  { id: 'admin-queues',         label: 'Queue Dashboard',   icon: 'Gauge',       path: '/admin/queues',             platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.5 },
  { id: 'admin-queues-llm',     label: 'LLM Monitor',       icon: 'Brain',       path: '/admin/queues/llm',         platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.6 },
  { id: 'admin-queues-media',   label: 'Media Monitor',     icon: 'PlayCircle',  path: '/admin/queues/media',       platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.7 },
  { id: 'admin-scheduled-jobs', label: 'Scheduled Jobs',    labelTh: 'งานตั้งเวลา', icon: 'Clock', path: '/admin/scheduled-jobs', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.72 },
  { id: 'admin-audit-logs',     label: 'Audit Logs',        labelTh: 'บันทึกตรวจสอบ', icon: 'Activity', path: '/admin/audit-logs', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.75 },
  { id: 'admin-orchestration-logs', label: 'Orchestration Logs', labelTh: 'บันทึก Orchestrator', icon: 'Workflow', path: '/admin/orchestration-logs', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.8 },
  { id: 'admin-work-os',        label: 'Work OS',          labelTh: 'เวิร์กโอเอส', icon: 'ClipboardList', path: '/admin/work-os', platforms: ['web', 'desktop'], roles: ['admin', 'domain_admin'], group: 'admin', sortOrder: 21.82 },
  { id: 'admin-notifications', label: 'Notifications', labelTh: 'การแจ้งเตือน', icon: 'Bell', path: '/admin/notifications', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.85, requiresFeature: 'notificationUnifiedCenter' },
  { id: 'admin-alert-rules', label: 'Alert Rules', labelTh: 'กฎแจ้งเตือน', icon: 'BellRing', path: '/admin/alert-rules', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.9, requiresFeature: 'notificationPreferencesEnabled' },
  { id: 'admin-task-queue',     label: 'Task Queue',        labelTh: 'คิวงาน',  icon: 'ListChecks', path: '/tasks',                    platforms: ['web', 'desktop'], group: 'main', sortOrder: 9.6 },
  { id: 'admin-docker',         label: 'Docker Status',     icon: 'Activity',    path: 'https://docker.smartaihub.app',    platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 22,   external: true },
  { id: 'admin-glitchtip',      label: 'Error Tracking',    icon: 'Bug',         path: 'https://glitchtip.smartaihub.app', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 22.5, external: true },
  { id: 'admin-users',          label: 'Users',             icon: 'Users',       path: '/admin/users',              platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 23 },
  { id: 'admin-packages',       label: 'Packages',          icon: 'Package',     path: '/admin/packages',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 24 },
  { id: 'admin-providers',      label: 'LLM Providers',     icon: 'Brain',       path: '/admin/llm-providers',      platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 25 },
  { id: 'admin-media-providers',label: 'Media Providers',   icon: 'Layers',      path: '/admin/media-providers',    platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 26 },
  { id: 'admin-media-models',   label: 'Media AI Models',   icon: 'Sparkles',    path: '/admin/media-models',       platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 27 },
  { id: 'admin-skills',         label: 'Skills',            icon: 'Wand2',       path: '/admin/skills',             platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 28 },
  { id: 'admin-skill-repos',    label: 'Skill Repos',       icon: 'GitBranch',   path: '/admin/skill-repositories', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 29 },
  { id: 'admin-personas',       label: 'Personas',          icon: 'UserCircle',  path: '/admin/personas',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 30.5, requiresFeature: 'personaSystem' },
  { id: 'admin-agencies',       label: 'Agencies',          icon: 'Bot',         path: '/admin/agencies',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 30 },
  { id: 'admin-mcp-servers',   label: 'MCP Servers',       labelTh: 'MCP เซิร์ฟเวอร์', icon: 'Plug',    path: '/admin/mcp-servers',        platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 30.1, requiresFeature: 'mcpServerRegistry' },
  { id: 'admin-channel-router', label: 'Channel Router',    labelTh: 'ตัวกำหนดเส้นทาง', icon: 'GitFork', path: '/admin/channel-router', platforms: ['web', 'desktop'], roles: ['admin', 'domain_admin'], group: 'admin', sortOrder: 30.2, requiresFeature: 'channelRouter' },
  { id: 'admin-guardian',       label: 'System Guardian',   labelTh: 'ผู้พิทักษ์ระบบ', icon: 'ShieldCheck', path: '/admin/system-guardian', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 19, requiresFeature: 'VIRTUAL_ADMIN_ENABLED' },
  { id: 'admin-monitoring',     label: 'Server Monitoring', labelTh: 'ตรวจสอบ Server', icon: 'Activity', path: '/admin/monitoring', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 19.3 },
  { id: 'admin-feedback',       label: 'Feedback Hub',      labelTh: 'ศูนย์รวมข้อเสนอ', icon: 'MessageSquare', path: '/admin/feedback-hub', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 19.5 },
  { id: 'admin-content-quality', label: 'Content Quality',   labelTh: 'คุณภาพเนื้อหา', icon: 'ShieldCheck', path: '/admin/content-quality', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 30.8 },
  { id: 'admin-gallery',        label: 'Gallery Admin',     icon: 'Images',      path: '/admin/gallery',            platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 31 },
  { id: 'admin-api-keys',       label: 'API Oversight',     labelTh: 'ตรวจสอบ API', icon: 'ShieldAlert', path: '/admin/api-keys',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 31.5 },
  { id: 'desktop-host',         label: 'Desktop Release',   labelTh: 'รีลีสเดสก์ท็อป', icon: 'Download', path: '/desktop-host', platforms: ['web', 'desktop'], roles: ['admin', 'domain_admin'], group: 'admin', sortOrder: 31.7 },
  { id: 'desktop-host-governance', label: 'Desktop Governance', labelTh: 'กำกับดูแลเดสก์ท็อป', icon: 'ShieldCheck', path: '/admin/desktop-host/governance', platforms: ['web', 'desktop'], roles: ['admin', 'domain_admin'], group: 'admin', sortOrder: 31.8 },
  { id: 'admin-settings',       label: 'Platform Settings', icon: 'Settings',    path: '/admin/settings',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 32 },

  // === Domain admin group ===
  { id: 'domain-users',    label: 'Manage Users',    labelTh: 'จัดการผู้ใช้',   icon: 'UserCog',   path: '/domain-admin/users',    platforms: ['web', 'desktop'], roles: ['domain_admin', 'admin'], group: 'domain-admin', sortOrder: 40 },
  { id: 'domain-content',  label: 'Edit Content',    labelTh: 'แก้ไขเนื้อหา',  icon: 'FileText',  path: '/domain-admin/content',  platforms: ['web', 'desktop'], roles: ['domain_admin', 'admin'], group: 'domain-admin', sortOrder: 41 },
  { id: 'domain-docs',     label: 'Manage Docs',     labelTh: 'จัดการเอกสาร',  icon: 'BookOpen',  path: '/domain-admin/docs',     platforms: ['web', 'desktop'], roles: ['domain_admin', 'admin'], group: 'domain-admin', sortOrder: 42 },
  { id: 'domain-theme',    label: 'Edit Theme',      labelTh: 'แก้ไขธีม',      icon: 'Palette',   path: '/domain-admin/theme',    platforms: ['web', 'desktop'], roles: ['domain_admin', 'admin'], group: 'domain-admin', sortOrder: 43 },
  { id: 'domain-blog',     label: 'Manage Blog',     labelTh: 'จัดการบล็อก',   icon: 'PenLine',   path: '/domain-admin/blog',     platforms: ['web', 'desktop'], roles: ['domain_admin', 'admin'], group: 'domain-admin', sortOrder: 44 },
  { id: 'domain-settings', label: 'Tenant Settings', labelTh: 'ตั้งค่าโดเมน', icon: 'FileText',  path: '/domain-admin/settings', platforms: ['web', 'desktop'], roles: ['domain_admin', 'admin'], group: 'domain-admin', sortOrder: 45 },
];

/**
 * Get visible menu items for a given platform and user role
 */
export function getVisibleMenuItems(
  platform: Platform,
  role: UserRole,
  overrides?: Array<{ menuItemId: string; visible: boolean; sortOrder?: number }>,
  enabledFeatures?: Record<string, boolean>
): MenuItem[] {
  return defaultMenuItems
    .filter(item => item.platforms.includes(platform))
    .filter(item => !item.roles || item.roles.includes(role))
    .filter(item => {
      if (!item.requiresFeature) return true;
      if (!enabledFeatures) return true; // No feature info = show all (backward compat)
      // Default to true — features are shown unless explicitly disabled
      return enabledFeatures[item.requiresFeature] !== false;
    })
    .map(item => {
      const override = overrides?.find(o => o.menuItemId === item.id);
      if (override) {
        return {
          ...item,
          sortOrder: override.sortOrder ?? item.sortOrder,
        };
      }
      return item;
    })
    .filter(item => {
      const override = overrides?.find(o => o.menuItemId === item.id);
      return override ? override.visible !== false : true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get visible menu items filtered by group
 */
export function getMenuItemsByGroup(
  platform: Platform,
  role: UserRole,
  group: MenuGroup,
  overrides?: Array<{ menuItemId: string; visible: boolean; sortOrder?: number }>,
  enabledFeatures?: Record<string, boolean>
): MenuItem[] {
  return getVisibleMenuItems(platform, role, overrides, enabledFeatures)
    .filter(item => item.group === group);
}
