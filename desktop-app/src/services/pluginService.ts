// Plugin Service - Frontend service for Plugin System
//
// Provides:
// - Plugin management
// - Settings configuration
// - Hook and event handling
// - Permission management

import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface Plugin {
  id: string;
  manifest: PluginManifest;
  state: PluginState;
  settings: Record<string, unknown>;
  permissions: Permission[];
  installed_at: number;
  updated_at: number;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  icon?: string;
  category: PluginCategory;
  tags: string[];
  min_app_version: string;
  entry_point: string;
  permissions: Permission[];
  settings_schema?: SettingsSchema;
  hooks: HookRegistration[];
  commands: CommandRegistration[];
  ui_contributions: UiContribution[];
}

export type PluginCategory =
  | 'templates'
  | 'integrations'
  | 'ai'
  | 'ui'
  | 'analytics'
  | 'export'
  | 'other';

export type PluginState =
  | { type: 'installed' }
  | { type: 'enabled' }
  | { type: 'disabled' }
  | { type: 'error'; message: string }
  | { type: 'updating' };

export type Permission =
  | 'read_files'
  | 'write_files'
  | 'network_access'
  | 'read_workspace'
  | 'write_workspace'
  | 'create_ui'
  | 'modify_ui'
  | 'system_info'
  | 'notifications'
  | 'read_settings'
  | 'write_settings'
  | 'read_database'
  | 'write_database';

export interface SettingsSchema {
  properties: Record<string, SettingProperty>;
  required: string[];
}

export interface SettingProperty {
  property_type: string;
  title: string;
  description?: string;
  default?: unknown;
  enum_values?: unknown[];
}

export interface HookRegistration {
  hook_name: string;
  handler: string;
  priority: number;
}

export interface CommandRegistration {
  name: string;
  title: string;
  description?: string;
  handler: string;
  keybinding?: string;
}

export interface UiContribution {
  contribution_type: UiContributionType;
  location: string;
  component: string;
}

export type UiContributionType =
  | 'panel'
  | 'toolbar'
  | 'status_bar'
  | 'context_menu'
  | 'settings';

export interface PluginApi {
  version: string;
  available_hooks: string[];
  available_events: string[];
  available_services: string[];
}

export interface PluginContext {
  plugin_id: string;
  workspace_id?: string;
  settings: Record<string, unknown>;
}

// ============================================
// API Functions
// ============================================

export async function installPlugin(manifest: PluginManifest, wasmPath: string): Promise<Plugin> {
  return invoke('plugin_install', { manifest, wasmPath });
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  return invoke('plugin_uninstall', { pluginId });
}

export async function enablePlugin(pluginId: string): Promise<void> {
  return invoke('plugin_enable', { pluginId });
}

export async function disablePlugin(pluginId: string): Promise<void> {
  return invoke('plugin_disable', { pluginId });
}

export async function getPlugin(pluginId: string): Promise<Plugin> {
  return invoke('plugin_get', { pluginId });
}

export async function listPlugins(): Promise<Plugin[]> {
  return invoke('plugin_list');
}

export async function listEnabledPlugins(): Promise<Plugin[]> {
  return invoke('plugin_list_enabled');
}

export async function getPluginSettings(pluginId: string): Promise<Record<string, unknown>> {
  return invoke('plugin_get_settings', { pluginId });
}

export async function updatePluginSettings(
  pluginId: string,
  settings: Record<string, unknown>
): Promise<void> {
  return invoke('plugin_update_settings', { pluginId, settings });
}

export async function checkPermission(pluginId: string, permission: Permission): Promise<boolean> {
  return invoke('plugin_check_permission', { pluginId, permission });
}

export async function requestPermission(pluginId: string, permission: Permission): Promise<void> {
  return invoke('plugin_request_permission', { pluginId, permission });
}

export async function getPluginApi(): Promise<PluginApi> {
  return invoke('plugin_get_api');
}

export async function getPluginContext(
  pluginId: string,
  workspaceId?: string
): Promise<PluginContext> {
  return invoke('plugin_get_context', { pluginId, workspaceId });
}

export async function getPluginTemplate(): Promise<string> {
  return invoke('plugin_get_template');
}

// ============================================
// Plugin Context
// ============================================

interface PluginContextValue {
  plugins: Plugin[];
  enabledPlugins: Plugin[];
  isLoading: boolean;
  error: string | null;
  api: PluginApi | null;
  
  // Actions
  loadPlugins: () => Promise<void>;
  installNewPlugin: (manifest: PluginManifest, wasmPath: string) => Promise<void>;
  uninstallPluginById: (pluginId: string) => Promise<void>;
  enablePluginById: (pluginId: string) => Promise<void>;
  disablePluginById: (pluginId: string) => Promise<void>;
  updateSettings: (pluginId: string, settings: Record<string, unknown>) => Promise<void>;
  
  // Utilities
  getPluginById: (pluginId: string) => Plugin | undefined;
  getPluginsByCategory: (category: PluginCategory) => Plugin[];
}

const PluginContext = createContext<PluginContextValue | null>(null);

export function PluginProvider({ children }: { children: ReactNode }) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [enabledPlugins, setEnabledPlugins] = useState<Plugin[]>([]);
  const [api, setApi] = useState<PluginApi | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allPlugins, enabled, pluginApi] = await Promise.all([
        listPlugins(),
        listEnabledPlugins(),
        getPluginApi(),
      ]);
      setPlugins(allPlugins);
      setEnabledPlugins(enabled);
      setApi(pluginApi);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const installNewPlugin = useCallback(async (manifest: PluginManifest, wasmPath: string) => {
    setIsLoading(true);
    try {
      await installPlugin(manifest, wasmPath);
      await loadPlugins();
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [loadPlugins]);

  const uninstallPluginById = useCallback(async (pluginId: string) => {
    try {
      await uninstallPlugin(pluginId);
      await loadPlugins();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadPlugins]);

  const enablePluginById = useCallback(async (pluginId: string) => {
    try {
      await enablePlugin(pluginId);
      await loadPlugins();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadPlugins]);

  const disablePluginById = useCallback(async (pluginId: string) => {
    try {
      await disablePlugin(pluginId);
      await loadPlugins();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadPlugins]);

  const updateSettings = useCallback(async (pluginId: string, settings: Record<string, unknown>) => {
    try {
      await updatePluginSettings(pluginId, settings);
      await loadPlugins();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadPlugins]);

  const getPluginById = useCallback((pluginId: string) => {
    return plugins.find(p => p.id === pluginId);
  }, [plugins]);

  const getPluginsByCategory = useCallback((category: PluginCategory) => {
    return plugins.filter(p => p.manifest.category === category);
  }, [plugins]);

  const value: PluginContextValue = {
    plugins,
    enabledPlugins,
    isLoading,
    error,
    api,
    loadPlugins,
    installNewPlugin,
    uninstallPluginById,
    enablePluginById,
    disablePluginById,
    updateSettings,
    getPluginById,
    getPluginsByCategory,
  };

  return (
    <PluginContext.Provider value={value}>
      {children}
    </PluginContext.Provider>
  );
}

export function usePlugins() {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error('usePlugins must be used within a PluginProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getCategoryIcon(category: PluginCategory): string {
  const icons: Record<PluginCategory, string> = {
    templates: '📄',
    integrations: '🔗',
    ai: '🤖',
    ui: '🎨',
    analytics: '📊',
    export: '📤',
    other: '📦',
  };
  return icons[category];
}

export function getCategoryLabel(category: PluginCategory): string {
  const labels: Record<PluginCategory, string> = {
    templates: 'Templates',
    integrations: 'Integrations',
    ai: 'AI & ML',
    ui: 'UI & Themes',
    analytics: 'Analytics',
    export: 'Export',
    other: 'Other',
  };
  return labels[category];
}

export function getPermissionLabel(permission: Permission): string {
  const labels: Record<Permission, string> = {
    read_files: 'Read Files',
    write_files: 'Write Files',
    network_access: 'Network Access',
    read_workspace: 'Read Workspace',
    write_workspace: 'Write Workspace',
    create_ui: 'Create UI',
    modify_ui: 'Modify UI',
    system_info: 'System Info',
    notifications: 'Notifications',
    read_settings: 'Read Settings',
    write_settings: 'Write Settings',
    read_database: 'Read Database',
    write_database: 'Write Database',
  };
  return labels[permission];
}

export function getStateLabel(state: PluginState): string {
  if (typeof state === 'string') {
    return state.charAt(0).toUpperCase() + state.slice(1);
  }
  switch (state.type) {
    case 'installed': return 'Installed';
    case 'enabled': return 'Enabled';
    case 'disabled': return 'Disabled';
    case 'error': return `Error: ${state.message}`;
    case 'updating': return 'Updating...';
  }
}

export function isPluginEnabled(plugin: Plugin): boolean {
  return typeof plugin.state === 'object' && plugin.state.type === 'enabled';
}
