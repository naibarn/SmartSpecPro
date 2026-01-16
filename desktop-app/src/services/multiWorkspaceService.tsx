// Multi-workspace Service - Frontend service for Multi-workspace
//
// Provides:
// - Workspace management
// - Workspace switching
// - Member management
// - Sync operations

import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  workspace_type: WorkspaceType;
  owner_id: string;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
  storage_path: string;
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
  is_active: boolean;
  sync_enabled: boolean;
  sync_status: SyncStatus;
}

export type WorkspaceType = 'personal' | 'team' | 'organization' | 'shared';

export interface WorkspaceMember {
  user_id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joined_at: number;
  last_active_at: number;
}

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface WorkspaceSettings {
  default_template?: string;
  auto_backup: boolean;
  backup_frequency: BackupFrequency;
  retention_days: number;
  notifications_enabled: boolean;
  theme?: string;
  custom_settings: Record<string, unknown>;
}

export type BackupFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface SyncStatus {
  is_syncing: boolean;
  last_sync_at?: number;
  pending_changes: number;
  sync_error?: string;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: string;
  structure: TemplateStructure;
  default_settings: WorkspaceSettings;
  is_official: boolean;
}

export interface TemplateStructure {
  folders: string[];
  files: TemplateFile[];
  default_projects: string[];
}

export interface TemplateFile {
  path: string;
  content: string;
}

export interface RecentWorkspace {
  workspace_id: string;
  name: string;
  icon?: string;
  color?: string;
  workspace_type: WorkspaceType;
  last_accessed_at: number;
  project_count: number;
}

// ============================================
// API Functions
// ============================================

export async function createWorkspace(
  name: string,
  workspaceType: WorkspaceType,
  ownerId: string,
  templateId?: string
): Promise<Workspace> {
  return invoke('mw_create_workspace', { name, workspaceType, ownerId, templateId });
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  return invoke('mw_get_workspace', { workspaceId });
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return invoke('mw_list_workspaces');
}

export async function updateWorkspace(
  workspaceId: string,
  updates: { name?: string; description?: string; icon?: string; color?: string }
): Promise<Workspace> {
  return invoke('mw_update_workspace', { workspaceId, ...updates });
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  return invoke('mw_delete_workspace', { workspaceId });
}

export async function switchWorkspace(workspaceId: string): Promise<Workspace> {
  return invoke('mw_switch_workspace', { workspaceId });
}

export async function getActiveWorkspace(): Promise<Workspace | null> {
  return invoke('mw_get_active_workspace');
}

export async function getRecentWorkspaces(limit?: number): Promise<RecentWorkspace[]> {
  return invoke('mw_get_recent_workspaces', { limit });
}

export async function addMember(
  workspaceId: string,
  userId: string,
  name: string,
  email: string,
  role: WorkspaceRole
): Promise<WorkspaceMember> {
  return invoke('mw_add_member', { workspaceId, userId, name, email, role });
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  return invoke('mw_remove_member', { workspaceId, userId });
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  return invoke('mw_update_member_role', { workspaceId, userId, role });
}

export async function enableSync(workspaceId: string): Promise<void> {
  return invoke('mw_enable_sync', { workspaceId });
}

export async function disableSync(workspaceId: string): Promise<void> {
  return invoke('mw_disable_sync', { workspaceId });
}

export async function triggerSync(workspaceId: string): Promise<SyncStatus> {
  return invoke('mw_trigger_sync', { workspaceId });
}

export async function listTemplates(): Promise<WorkspaceTemplate[]> {
  return invoke('mw_list_templates');
}

export async function getTemplate(templateId: string): Promise<WorkspaceTemplate> {
  return invoke('mw_get_template', { templateId });
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  settings: WorkspaceSettings
): Promise<void> {
  return invoke('mw_update_workspace_settings', { workspaceId, settings });
}

// ============================================
// Multi-workspace Context
// ============================================

interface MultiWorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  recentWorkspaces: RecentWorkspace[];
  templates: WorkspaceTemplate[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadWorkspaces: () => Promise<void>;
  create: (name: string, type: WorkspaceType, templateId?: string) => Promise<void>;
  update: (workspaceId: string, updates: { name?: string; description?: string; icon?: string; color?: string }) => Promise<void>;
  remove: (workspaceId: string) => Promise<void>;
  switchTo: (workspaceId: string) => Promise<void>;
  
  // Members
  inviteMember: (workspaceId: string, email: string, role: WorkspaceRole) => Promise<void>;
  removeMemberById: (workspaceId: string, userId: string) => Promise<void>;
  changeMemberRole: (workspaceId: string, userId: string, role: WorkspaceRole) => Promise<void>;
  
  // Sync
  toggleSync: (workspaceId: string, enabled: boolean) => Promise<void>;
  sync: (workspaceId: string) => Promise<void>;
}

const MultiWorkspaceContext = createContext<MultiWorkspaceContextValue | null>(null);

export function MultiWorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ws, active, recent, tmpl] = await Promise.all([
        listWorkspaces(),
        getActiveWorkspace(),
        getRecentWorkspaces(),
        listTemplates(),
      ]);
      setWorkspaces(ws);
      setActiveWorkspace(active);
      setRecentWorkspaces(recent);
      setTemplates(tmpl);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const create = useCallback(async (name: string, type: WorkspaceType, templateId?: string) => {
    try {
      await createWorkspace(name, type, 'current-user', templateId);
      await loadWorkspaces();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadWorkspaces]);

  const update = useCallback(async (workspaceId: string, updates: { name?: string; description?: string; icon?: string; color?: string }) => {
    try {
      await updateWorkspace(workspaceId, updates);
      await loadWorkspaces();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadWorkspaces]);

  const remove = useCallback(async (workspaceId: string) => {
    try {
      await deleteWorkspace(workspaceId);
      await loadWorkspaces();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadWorkspaces]);

  const switchTo = useCallback(async (workspaceId: string) => {
    try {
      const ws = await switchWorkspace(workspaceId);
      setActiveWorkspace(ws);
      const recent = await getRecentWorkspaces();
      setRecentWorkspaces(recent);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const inviteMember = useCallback(async (workspaceId: string, email: string, role: WorkspaceRole) => {
    try {
      await addMember(workspaceId, `user-${Date.now()}`, email.split('@')[0], email, role);
      await loadWorkspaces();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadWorkspaces]);

  const removeMemberById = useCallback(async (workspaceId: string, userId: string) => {
    try {
      await removeMember(workspaceId, userId);
      await loadWorkspaces();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadWorkspaces]);

  const changeMemberRole = useCallback(async (workspaceId: string, userId: string, role: WorkspaceRole) => {
    try {
      await updateMemberRole(workspaceId, userId, role);
      await loadWorkspaces();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadWorkspaces]);

  const toggleSync = useCallback(async (workspaceId: string, enabled: boolean) => {
    try {
      if (enabled) {
        await enableSync(workspaceId);
      } else {
        await disableSync(workspaceId);
      }
      await loadWorkspaces();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadWorkspaces]);

  const sync = useCallback(async (workspaceId: string) => {
    try {
      await triggerSync(workspaceId);
      await loadWorkspaces();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadWorkspaces]);

  const value: MultiWorkspaceContextValue = {
    workspaces,
    activeWorkspace,
    recentWorkspaces,
    templates,
    isLoading,
    error,
    loadWorkspaces,
    create,
    update,
    remove,
    switchTo,
    inviteMember,
    removeMemberById,
    changeMemberRole,
    toggleSync,
    sync,
  };

  return (
    <MultiWorkspaceContext.Provider value={value}>
      {children}
    </MultiWorkspaceContext.Provider>
  );
}

export function useMultiWorkspace() {
  const context = useContext(MultiWorkspaceContext);
  if (!context) {
    throw new Error('useMultiWorkspace must be used within a MultiWorkspaceProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getWorkspaceTypeIcon(type: WorkspaceType): string {
  const icons: Record<WorkspaceType, string> = {
    personal: '👤',
    team: '👥',
    organization: '🏢',
    shared: '🔗',
  };
  return icons[type];
}

export function getWorkspaceTypeLabel(type: WorkspaceType): string {
  const labels: Record<WorkspaceType, string> = {
    personal: 'Personal',
    team: 'Team',
    organization: 'Organization',
    shared: 'Shared',
  };
  return labels[type];
}

export function getRoleLabel(role: WorkspaceRole): string {
  const labels: Record<WorkspaceRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    editor: 'Editor',
    viewer: 'Viewer',
  };
  return labels[role];
}

export function formatLastAccessed(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}
