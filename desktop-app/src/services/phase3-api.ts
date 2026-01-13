/**
 * SmartSpec Pro - Phase 3 API Services
 * Frontend services for Multi-tenancy, RBAC, and Approvals
 */

import { apiClient, ApiResponse } from './api-client';

// ==========================================
// Types
// ==========================================

// Tenant Types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  display_name: string;
  plan: 'free' | 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'suspended' | 'pending';
  settings: TenantSettings;
  usage: TenantUsage;
  created_at: string;
  updated_at?: string;
}

export interface TenantSettings {
  isolation_level: 'row' | 'schema' | 'database';
  custom_domain?: string;
  branding?: TenantBranding;
  features: string[];
}

export interface TenantBranding {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

export interface TenantUsage {
  users_count: number;
  projects_count: number;
  storage_used_gb: number;
  api_calls_this_month: number;
}

export interface TenantLimits {
  max_users: number;
  max_projects: number;
  max_storage_gb: number;
  max_api_calls_per_month: number;
}

export interface CreateTenantRequest {
  name: string;
  display_name: string;
  plan?: 'free' | 'starter' | 'professional' | 'enterprise';
  settings?: Partial<TenantSettings>;
}

export interface UpdateTenantRequest {
  display_name?: string;
  settings?: Partial<TenantSettings>;
}

// RBAC Types
export interface Role {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  tenant_id?: string;
  scope: 'system' | 'tenant' | 'project';
  permissions: string[];
  is_system: boolean;
  is_default: boolean;
  priority: number;
  created_at: string;
  updated_at?: string;
}

export interface Permission {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  resource: string;
  action: string;
  scope: 'system' | 'tenant' | 'project';
  is_system: boolean;
}

export interface RoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  tenant_id?: string;
  project_id?: string;
  assigned_by?: string;
  reason?: string;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
}

export interface CreateRoleRequest {
  name: string;
  display_name: string;
  description?: string;
  permissions: string[];
  parent_role_id?: string;
}

export interface UpdateRoleRequest {
  display_name?: string;
  description?: string;
  permissions?: string[];
}

export interface AssignRoleRequest {
  user_id: string;
  role_id: string;
  project_id?: string;
  reason?: string;
  expires_at?: string;
}

export interface PermissionCheckRequest {
  permission: string;
  resource_id?: string;
}

export interface PermissionCheckResponse {
  allowed: boolean;
  permission: string;
  reason?: string;
}

// Approval Types
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
export type ApprovalDecision = 'approve' | 'reject';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  request_type: string;
  title: string;
  description?: string;
  tenant_id?: string;
  project_id?: string;
  execution_id?: string;
  requester_id?: string;
  requester_type: string;
  status: ApprovalStatus;
  payload: Record<string, any>;
  risk_level: RiskLevel;
  required_approvers: number;
  current_approvals: number;
  expires_at?: string;
  created_at: string;
  resolved_at?: string;
}

export interface ApprovalResponse {
  id: string;
  request_id: string;
  approver_id: string;
  decision: string;
  comment?: string;
  created_at: string;
}

export interface ApprovalRule {
  id: string;
  name: string;
  description?: string;
  tenant_id?: string;
  project_id?: string;
  trigger_type: string;
  conditions: Record<string, any>;
  approver_roles: string[];
  approver_users: string[];
  required_approvals: number;
  timeout_minutes: number;
  timeout_action: 'approve' | 'reject' | 'escalate';
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateApprovalRequestRequest {
  request_type: string;
  title: string;
  description?: string;
  project_id?: string;
  execution_id?: string;
  payload?: Record<string, any>;
  risk_level?: RiskLevel;
  required_approvers?: number;
  timeout_minutes?: number;
}

export interface RespondToApprovalRequest {
  decision: ApprovalDecision;
  comment?: string;
}

export interface CreateApprovalRuleRequest {
  name: string;
  description?: string;
  project_id?: string;
  trigger_type: string;
  conditions?: Record<string, any>;
  approver_roles?: string[];
  approver_users?: string[];
  required_approvals?: number;
  timeout_minutes?: number;
  timeout_action?: 'approve' | 'reject' | 'escalate';
}

export interface ApprovalListResponse {
  requests: ApprovalRequest[];
  total: number;
  page: number;
  page_size: number;
}

// ==========================================
// Tenant Service
// ==========================================

export const tenantService = {
  /**
   * Get current tenant
   */
  async getCurrent(): Promise<ApiResponse<Tenant>> {
    return apiClient.get('/api/v1/tenants/current');
  },

  /**
   * List all tenants (admin only)
   */
  async list(params?: {
    status?: string;
    plan?: string;
    page?: number;
    page_size?: number;
  }): Promise<ApiResponse<Tenant[]>> {
    return apiClient.get('/api/v1/tenants', { params });
  },

  /**
   * Get tenant by ID
   */
  async get(tenantId: string): Promise<ApiResponse<Tenant>> {
    return apiClient.get(`/api/v1/tenants/${tenantId}`);
  },

  /**
   * Create a new tenant
   */
  async create(data: CreateTenantRequest): Promise<ApiResponse<Tenant>> {
    return apiClient.post('/api/v1/tenants', data);
  },

  /**
   * Update tenant
   */
  async update(tenantId: string, data: UpdateTenantRequest): Promise<ApiResponse<Tenant>> {
    return apiClient.patch(`/api/v1/tenants/${tenantId}`, data);
  },

  /**
   * Get tenant usage
   */
  async getUsage(tenantId: string): Promise<ApiResponse<TenantUsage>> {
    return apiClient.get(`/api/v1/tenants/${tenantId}/usage`);
  },

  /**
   * Get tenant limits
   */
  async getLimits(tenantId: string): Promise<ApiResponse<TenantLimits>> {
    return apiClient.get(`/api/v1/tenants/${tenantId}/limits`);
  },

  /**
   * Invite user to tenant
   */
  async inviteUser(tenantId: string, email: string, roleId: string): Promise<ApiResponse<void>> {
    return apiClient.post(`/api/v1/tenants/${tenantId}/invitations`, { email, role_id: roleId });
  },

  /**
   * List tenant members
   */
  async listMembers(tenantId: string): Promise<ApiResponse<any[]>> {
    return apiClient.get(`/api/v1/tenants/${tenantId}/members`);
  },
};

// ==========================================
// RBAC Service
// ==========================================

export const rbacService = {
  /**
   * List available roles
   */
  async listRoles(includeSystem: boolean = true): Promise<ApiResponse<Role[]>> {
    return apiClient.get('/api/v1/rbac/roles', { params: { include_system: includeSystem } });
  },

  /**
   * Get role by ID
   */
  async getRole(roleId: string): Promise<ApiResponse<Role>> {
    return apiClient.get(`/api/v1/rbac/roles/${roleId}`);
  },

  /**
   * Create a custom role
   */
  async createRole(data: CreateRoleRequest): Promise<ApiResponse<Role>> {
    return apiClient.post('/api/v1/rbac/roles', data);
  },

  /**
   * Update a role
   */
  async updateRole(roleId: string, data: UpdateRoleRequest): Promise<ApiResponse<Role>> {
    return apiClient.patch(`/api/v1/rbac/roles/${roleId}`, data);
  },

  /**
   * Delete a role
   */
  async deleteRole(roleId: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`/api/v1/rbac/roles/${roleId}`);
  },

  /**
   * Assign role to user
   */
  async assignRole(data: AssignRoleRequest): Promise<ApiResponse<RoleAssignment>> {
    return apiClient.post('/api/v1/rbac/assignments', data);
  },

  /**
   * List role assignments
   */
  async listAssignments(params?: {
    user_id?: string;
    role_id?: string;
    project_id?: string;
  }): Promise<ApiResponse<RoleAssignment[]>> {
    return apiClient.get('/api/v1/rbac/assignments', { params });
  },

  /**
   * Revoke role assignment
   */
  async revokeAssignment(assignmentId: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`/api/v1/rbac/assignments/${assignmentId}`);
  },

  /**
   * List available permissions
   */
  async listPermissions(resource?: string): Promise<ApiResponse<Permission[]>> {
    return apiClient.get('/api/v1/rbac/permissions', { params: { resource } });
  },

  /**
   * Check if current user has permission
   */
  async checkPermission(data: PermissionCheckRequest): Promise<ApiResponse<PermissionCheckResponse>> {
    return apiClient.post('/api/v1/rbac/check', data);
  },

  /**
   * Get current user's roles
   */
  async getMyRoles(): Promise<ApiResponse<Role[]>> {
    return apiClient.get('/api/v1/rbac/me/roles');
  },

  /**
   * Get current user's permissions
   */
  async getMyPermissions(): Promise<ApiResponse<string[]>> {
    return apiClient.get('/api/v1/rbac/me/permissions');
  },
};

// ==========================================
// Approval Service
// ==========================================

export const approvalService = {
  /**
   * Create approval request
   */
  async createRequest(data: CreateApprovalRequestRequest): Promise<ApiResponse<ApprovalRequest>> {
    return apiClient.post('/api/v1/approvals/requests', data);
  },

  /**
   * List approval requests
   */
  async listRequests(params?: {
    status_filter?: ApprovalStatus;
    request_type?: string;
    project_id?: string;
    page?: number;
    page_size?: number;
  }): Promise<ApiResponse<ApprovalListResponse>> {
    return apiClient.get('/api/v1/approvals/requests', { params });
  },

  /**
   * List pending approvals for current user
   */
  async listPendingApprovals(): Promise<ApiResponse<ApprovalRequest[]>> {
    return apiClient.get('/api/v1/approvals/requests/pending');
  },

  /**
   * Get approval request by ID
   */
  async getRequest(requestId: string): Promise<ApiResponse<ApprovalRequest>> {
    return apiClient.get(`/api/v1/approvals/requests/${requestId}`);
  },

  /**
   * Respond to approval request
   */
  async respond(requestId: string, data: RespondToApprovalRequest): Promise<ApiResponse<ApprovalRequest>> {
    return apiClient.post(`/api/v1/approvals/requests/${requestId}/respond`, data);
  },

  /**
   * Cancel approval request
   */
  async cancelRequest(requestId: string): Promise<ApiResponse<ApprovalRequest>> {
    return apiClient.post(`/api/v1/approvals/requests/${requestId}/cancel`);
  },

  /**
   * List responses for a request
   */
  async listResponses(requestId: string): Promise<ApiResponse<ApprovalResponse[]>> {
    return apiClient.get(`/api/v1/approvals/requests/${requestId}/responses`);
  },

  /**
   * Create approval rule
   */
  async createRule(data: CreateApprovalRuleRequest): Promise<ApiResponse<ApprovalRule>> {
    return apiClient.post('/api/v1/approvals/rules', data);
  },

  /**
   * List approval rules
   */
  async listRules(params?: {
    project_id?: string;
    trigger_type?: string;
    is_active?: boolean;
  }): Promise<ApiResponse<ApprovalRule[]>> {
    return apiClient.get('/api/v1/approvals/rules', { params });
  },

  /**
   * Get approval rule by ID
   */
  async getRule(ruleId: string): Promise<ApiResponse<ApprovalRule>> {
    return apiClient.get(`/api/v1/approvals/rules/${ruleId}`);
  },

  /**
   * Update approval rule
   */
  async updateRule(ruleId: string, data: CreateApprovalRuleRequest): Promise<ApiResponse<ApprovalRule>> {
    return apiClient.patch(`/api/v1/approvals/rules/${ruleId}`, data);
  },

  /**
   * Delete approval rule
   */
  async deleteRule(ruleId: string): Promise<ApiResponse<void>> {
    return apiClient.delete(`/api/v1/approvals/rules/${ruleId}`);
  },

  /**
   * Toggle approval rule
   */
  async toggleRule(ruleId: string, isActive: boolean): Promise<ApiResponse<ApprovalRule>> {
    return apiClient.post(`/api/v1/approvals/rules/${ruleId}/toggle`, null, {
      params: { is_active: isActive },
    });
  },
};

// ==========================================
// Hooks (for React)
// ==========================================

export const usePhase3Api = () => ({
  tenant: tenantService,
  rbac: rbacService,
  approval: approvalService,
});

export default {
  tenantService,
  rbacService,
  approvalService,
};
