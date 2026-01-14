// Enterprise Service - Frontend service for Enterprise Features
//
// Provides:
// - SSO management
// - RBAC management
// - Audit logging
// - Compliance settings

import { invoke } from '@tauri-apps/api/core';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface SsoConfig {
  id: string;
  provider: SsoProvider;
  enabled: boolean;
  client_id: string;
  tenant_id?: string;
  domain?: string;
  metadata_url?: string;
  created_at: number;
  updated_at: number;
}

export type SsoProvider = 'saml' | 'oidc' | 'azure_ad' | 'okta' | 'google' | 'github';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  is_system: boolean;
  created_at: number;
  updated_at: number;
}

export interface Permission {
  id: string;
  resource: string;
  action: PermissionAction;
  conditions?: PermissionConditions;
}

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'execute' | 'admin' | 'all';

export interface PermissionConditions {
  own_only: boolean;
  workspace_only: boolean;
  time_restricted?: TimeRestriction;
}

export interface TimeRestriction {
  start_hour: number;
  end_hour: number;
  days: number[];
}

export interface UserRole {
  user_id: string;
  role_id: string;
  scope: RoleScope;
  assigned_at: number;
  assigned_by: string;
}

export type RoleScope = 
  | { type: 'global' }
  | { type: 'organization'; org_id: string }
  | { type: 'workspace'; workspace_id: string }
  | { type: 'project'; project_id: string };

export interface AuditLog {
  id: string;
  timestamp: number;
  user_id: string;
  user_email: string;
  action: AuditAction;
  resource_type: string;
  resource_id: string;
  details: unknown;
  ip_address?: string;
  user_agent?: string;
  status: AuditStatus;
  error_message?: string;
}

export type AuditAction = 
  | 'login' | 'logout' | 'password_change' | 'mfa_enabled' | 'mfa_disabled'
  | 'create' | 'read' | 'update' | 'delete' | 'export' | 'import'
  | 'role_assigned' | 'role_revoked' | 'settings_changed' | 'user_invited' | 'user_removed'
  | 'api_key_created' | 'api_key_revoked' | 'webhook_created' | 'webhook_deleted';

export type AuditStatus = 'success' | 'failure' | 'pending';

export interface AuditQuery {
  user_id?: string;
  action?: AuditAction;
  resource_type?: string;
  start_time?: number;
  end_time?: number;
  status?: AuditStatus;
  page: number;
  per_page: number;
}

export interface AuditQueryResult {
  logs: AuditLog[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ComplianceSettings {
  gdpr_enabled: boolean;
  data_retention_days: number;
  data_encryption_enabled: boolean;
  audit_retention_days: number;
  mfa_required: boolean;
  password_policy: PasswordPolicy;
  session_timeout_minutes: number;
  ip_whitelist: string[];
}

export interface PasswordPolicy {
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_numbers: boolean;
  require_special: boolean;
  max_age_days: number;
  history_count: number;
}

export interface DataExportRequest {
  id: string;
  user_id: string;
  request_type: ExportType;
  status: ExportStatus;
  download_url?: string;
  expires_at?: number;
  created_at: number;
  completed_at?: number;
}

export type ExportType = 'user_data' | 'workspace_data' | 'audit_logs' | 'full_export';
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

// ============================================
// API Functions
// ============================================

// SSO
export async function configureSso(
  provider: SsoProvider,
  clientId: string,
  tenantId?: string,
  domain?: string
): Promise<SsoConfig> {
  return invoke('ent_configure_sso', { provider, clientId, tenantId, domain });
}

export async function getSsoConfigs(): Promise<SsoConfig[]> {
  return invoke('ent_get_sso_configs');
}

export async function disableSso(configId: string): Promise<void> {
  return invoke('ent_disable_sso', { configId });
}

// RBAC
export async function createRole(
  name: string,
  description: string,
  permissions: Permission[]
): Promise<Role> {
  return invoke('ent_create_role', { name, description, permissions });
}

export async function getRoles(): Promise<Role[]> {
  return invoke('ent_get_roles');
}

export async function assignRole(
  userId: string,
  roleId: string,
  scopeType: string,
  scopeId?: string,
  assignedBy?: string
): Promise<UserRole> {
  return invoke('ent_assign_role', { userId, roleId, scopeType, scopeId, assignedBy: assignedBy || 'system' });
}

export async function revokeRole(userId: string, roleId: string): Promise<void> {
  return invoke('ent_revoke_role', { userId, roleId });
}

export async function getUserRoles(userId: string): Promise<UserRole[]> {
  return invoke('ent_get_user_roles', { userId });
}

export async function checkPermission(
  userId: string,
  resource: string,
  action: PermissionAction
): Promise<boolean> {
  return invoke('ent_check_permission', { userId, resource, action });
}

// Audit
export async function logAction(params: {
  userId: string;
  userEmail: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  details: unknown;
  status: AuditStatus;
}): Promise<AuditLog> {
  return invoke('ent_log_action', params);
}

export async function queryAuditLogs(query: AuditQuery): Promise<AuditQueryResult> {
  return invoke('ent_query_audit_logs', { query });
}

// Compliance
export async function getComplianceSettings(): Promise<ComplianceSettings> {
  return invoke('ent_get_compliance_settings');
}

export async function updateComplianceSettings(settings: ComplianceSettings): Promise<void> {
  return invoke('ent_update_compliance_settings', { settings });
}

export async function requestDataExport(userId: string, exportType: ExportType): Promise<DataExportRequest> {
  return invoke('ent_request_data_export', { userId, exportType });
}

export async function getExportRequest(requestId: string): Promise<DataExportRequest> {
  return invoke('ent_get_export_request', { requestId });
}

export async function deleteUserData(userId: string): Promise<void> {
  return invoke('ent_delete_user_data', { userId });
}

// ============================================
// Enterprise Context
// ============================================

interface EnterpriseContextValue {
  ssoConfigs: SsoConfig[];
  roles: Role[];
  complianceSettings: ComplianceSettings | null;
  isLoading: boolean;
  error: string | null;
  
  // SSO
  loadSsoConfigs: () => Promise<void>;
  addSsoConfig: (provider: SsoProvider, clientId: string, tenantId?: string, domain?: string) => Promise<void>;
  removeSsoConfig: (configId: string) => Promise<void>;
  
  // RBAC
  loadRoles: () => Promise<void>;
  addRole: (name: string, description: string, permissions: Permission[]) => Promise<void>;
  assignUserRole: (userId: string, roleId: string, scopeType: string, scopeId?: string) => Promise<void>;
  revokeUserRole: (userId: string, roleId: string) => Promise<void>;
  hasPermission: (userId: string, resource: string, action: PermissionAction) => Promise<boolean>;
  
  // Compliance
  loadComplianceSettings: () => Promise<void>;
  saveComplianceSettings: (settings: ComplianceSettings) => Promise<void>;
  exportData: (userId: string, type: ExportType) => Promise<DataExportRequest>;
  deleteData: (userId: string) => Promise<void>;
}

const EnterpriseContext = createContext<EnterpriseContextValue | null>(null);

export function EnterpriseProvider({ children }: { children: ReactNode }) {
  const [ssoConfigs, setSsoConfigs] = useState<SsoConfig[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [complianceSettings, setComplianceSettings] = useState<ComplianceSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSsoConfigs = useCallback(async () => {
    try {
      const configs = await getSsoConfigs();
      setSsoConfigs(configs);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const addSsoConfig = useCallback(async (provider: SsoProvider, clientId: string, tenantId?: string, domain?: string) => {
    try {
      await configureSso(provider, clientId, tenantId, domain);
      await loadSsoConfigs();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadSsoConfigs]);

  const removeSsoConfig = useCallback(async (configId: string) => {
    try {
      await disableSso(configId);
      await loadSsoConfigs();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadSsoConfigs]);

  const loadRoles = useCallback(async () => {
    try {
      const data = await getRoles();
      setRoles(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const addRole = useCallback(async (name: string, description: string, permissions: Permission[]) => {
    try {
      await createRole(name, description, permissions);
      await loadRoles();
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, [loadRoles]);

  const assignUserRole = useCallback(async (userId: string, roleId: string, scopeType: string, scopeId?: string) => {
    try {
      await assignRole(userId, roleId, scopeType, scopeId);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const revokeUserRole = useCallback(async (userId: string, roleId: string) => {
    try {
      await revokeRole(userId, roleId);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const hasPermission = useCallback(async (userId: string, resource: string, action: PermissionAction) => {
    try {
      return await checkPermission(userId, resource, action);
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, []);

  const loadComplianceSettings = useCallback(async () => {
    try {
      const settings = await getComplianceSettings();
      setComplianceSettings(settings);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const saveComplianceSettings = useCallback(async (settings: ComplianceSettings) => {
    try {
      await updateComplianceSettings(settings);
      setComplianceSettings(settings);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const exportData = useCallback(async (userId: string, type: ExportType) => {
    try {
      return await requestDataExport(userId, type);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  const deleteData = useCallback(async (userId: string) => {
    try {
      await deleteUserData(userId);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }, []);

  useEffect(() => {
    loadSsoConfigs();
    loadRoles();
    loadComplianceSettings();
  }, [loadSsoConfigs, loadRoles, loadComplianceSettings]);

  const value: EnterpriseContextValue = {
    ssoConfigs,
    roles,
    complianceSettings,
    isLoading,
    error,
    loadSsoConfigs,
    addSsoConfig,
    removeSsoConfig,
    loadRoles,
    addRole,
    assignUserRole,
    revokeUserRole,
    hasPermission,
    loadComplianceSettings,
    saveComplianceSettings,
    exportData,
    deleteData,
  };

  return (
    <EnterpriseContext.Provider value={value}>
      {children}
    </EnterpriseContext.Provider>
  );
}

export function useEnterprise() {
  const context = useContext(EnterpriseContext);
  if (!context) {
    throw new Error('useEnterprise must be used within an EnterpriseProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getSsoProviderIcon(provider: SsoProvider): string {
  const icons: Record<SsoProvider, string> = {
    saml: '🔐',
    oidc: '🔑',
    azure_ad: '☁️',
    okta: '🛡️',
    google: '🔴',
    github: '🐙',
  };
  return icons[provider];
}

export function getSsoProviderLabel(provider: SsoProvider): string {
  const labels: Record<SsoProvider, string> = {
    saml: 'SAML 2.0',
    oidc: 'OpenID Connect',
    azure_ad: 'Azure AD',
    okta: 'Okta',
    google: 'Google Workspace',
    github: 'GitHub',
  };
  return labels[provider];
}

export function getAuditActionIcon(action: AuditAction): string {
  const icons: Record<string, string> = {
    login: '🔓',
    logout: '🔒',
    create: '➕',
    read: '👁️',
    update: '✏️',
    delete: '🗑️',
    export: '📤',
    import: '📥',
  };
  return icons[action] || '📝';
}

export function formatAuditAction(action: AuditAction): string {
  return action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
