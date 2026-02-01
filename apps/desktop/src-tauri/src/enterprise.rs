// Enterprise Features Service - Enterprise-grade Features
//
// Provides:
// - SSO (Single Sign-On)
// - RBAC (Role-Based Access Control)
// - Audit Logging
// - Compliance (GDPR, SOC2)

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================
// SSO Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoConfig {
    pub id: String,
    pub provider: SsoProvider,
    pub enabled: bool,
    pub client_id: String,
    pub tenant_id: Option<String>,
    pub domain: Option<String>,
    pub metadata_url: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SsoProvider {
    Saml,
    Oidc,
    AzureAd,
    Okta,
    Google,
    Github,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SsoSession {
    pub session_id: String,
    pub user_id: String,
    pub provider: SsoProvider,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub created_at: i64,
}

// ============================================
// RBAC Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub description: String,
    pub permissions: Vec<Permission>,
    pub is_system: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permission {
    pub id: String,
    pub resource: String,
    pub action: PermissionAction,
    pub conditions: Option<PermissionConditions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionAction {
    Create,
    Read,
    Update,
    Delete,
    Execute,
    Admin,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionConditions {
    pub own_only: bool,
    pub workspace_only: bool,
    pub time_restricted: Option<TimeRestriction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRestriction {
    pub start_hour: u8,
    pub end_hour: u8,
    pub days: Vec<u8>, // 0-6, Sunday = 0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRole {
    pub user_id: String,
    pub role_id: String,
    pub scope: RoleScope,
    pub assigned_at: i64,
    pub assigned_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoleScope {
    Global,
    Organization { org_id: String },
    Workspace { workspace_id: String },
    Project { project_id: String },
}

// ============================================
// Audit Log Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: String,
    pub timestamp: i64,
    pub user_id: String,
    pub user_email: String,
    pub action: AuditAction,
    pub resource_type: String,
    pub resource_id: String,
    pub details: serde_json::Value,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub status: AuditStatus,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditAction {
    // Auth
    Login,
    Logout,
    PasswordChange,
    MfaEnabled,
    MfaDisabled,
    
    // Data
    Create,
    Read,
    Update,
    Delete,
    Export,
    Import,
    
    // Admin
    RoleAssigned,
    RoleRevoked,
    SettingsChanged,
    UserInvited,
    UserRemoved,
    
    // System
    ApiKeyCreated,
    ApiKeyRevoked,
    WebhookCreated,
    WebhookDeleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditStatus {
    Success,
    Failure,
    Pending,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditQuery {
    pub user_id: Option<String>,
    pub action: Option<AuditAction>,
    pub resource_type: Option<String>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub status: Option<AuditStatus>,
    pub page: u32,
    pub per_page: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditQueryResult {
    pub logs: Vec<AuditLog>,
    pub total: u64,
    pub page: u32,
    pub per_page: u32,
    pub total_pages: u32,
}

// ============================================
// Compliance Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceSettings {
    pub gdpr_enabled: bool,
    pub data_retention_days: u32,
    pub data_encryption_enabled: bool,
    pub audit_retention_days: u32,
    pub mfa_required: bool,
    pub password_policy: PasswordPolicy,
    pub session_timeout_minutes: u32,
    pub ip_whitelist: Vec<String>,
}

impl Default for ComplianceSettings {
    fn default() -> Self {
        Self {
            gdpr_enabled: true,
            data_retention_days: 365,
            data_encryption_enabled: true,
            audit_retention_days: 90,
            mfa_required: false,
            password_policy: PasswordPolicy::default(),
            session_timeout_minutes: 60,
            ip_whitelist: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordPolicy {
    pub min_length: u8,
    pub require_uppercase: bool,
    pub require_lowercase: bool,
    pub require_numbers: bool,
    pub require_special: bool,
    pub max_age_days: u32,
    pub history_count: u8,
}

impl Default for PasswordPolicy {
    fn default() -> Self {
        Self {
            min_length: 12,
            require_uppercase: true,
            require_lowercase: true,
            require_numbers: true,
            require_special: true,
            max_age_days: 90,
            history_count: 5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataExportRequest {
    pub id: String,
    pub user_id: String,
    pub request_type: ExportType,
    pub status: ExportStatus,
    pub download_url: Option<String>,
    pub expires_at: Option<i64>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportType {
    UserData,
    WorkspaceData,
    AuditLogs,
    FullExport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Expired,
}

// ============================================
// Enterprise Service
// ============================================

pub struct EnterpriseService {
    pub sso_configs: HashMap<String, SsoConfig>,
    pub roles: HashMap<String, Role>,
    pub user_roles: Vec<UserRole>,
    pub audit_logs: Vec<AuditLog>,
    pub compliance_settings: ComplianceSettings,
    pub export_requests: HashMap<String, DataExportRequest>,
}

impl EnterpriseService {
    pub fn new() -> Self {
        let mut service = Self {
            sso_configs: HashMap::new(),
            roles: HashMap::new(),
            user_roles: Vec::new(),
            audit_logs: Vec::new(),
            compliance_settings: ComplianceSettings::default(),
            export_requests: HashMap::new(),
        };
        service.create_default_roles();
        service
    }

    fn create_default_roles(&mut self) {
        let now = chrono::Utc::now().timestamp();

        let default_roles = vec![
            Role {
                id: "admin".to_string(),
                name: "Administrator".to_string(),
                description: "Full system access".to_string(),
                permissions: vec![
                    Permission {
                        id: "admin-all".to_string(),
                        resource: "*".to_string(),
                        action: PermissionAction::All,
                        conditions: None,
                    },
                ],
                is_system: true,
                created_at: now,
                updated_at: now,
            },
            Role {
                id: "manager".to_string(),
                name: "Manager".to_string(),
                description: "Manage workspaces and users".to_string(),
                permissions: vec![
                    Permission {
                        id: "manager-workspace".to_string(),
                        resource: "workspace".to_string(),
                        action: PermissionAction::All,
                        conditions: None,
                    },
                    Permission {
                        id: "manager-user".to_string(),
                        resource: "user".to_string(),
                        action: PermissionAction::Read,
                        conditions: None,
                    },
                ],
                is_system: true,
                created_at: now,
                updated_at: now,
            },
            Role {
                id: "developer".to_string(),
                name: "Developer".to_string(),
                description: "Create and edit projects".to_string(),
                permissions: vec![
                    Permission {
                        id: "dev-project".to_string(),
                        resource: "project".to_string(),
                        action: PermissionAction::All,
                        conditions: Some(PermissionConditions {
                            own_only: false,
                            workspace_only: true,
                            time_restricted: None,
                        }),
                    },
                ],
                is_system: true,
                created_at: now,
                updated_at: now,
            },
            Role {
                id: "viewer".to_string(),
                name: "Viewer".to_string(),
                description: "Read-only access".to_string(),
                permissions: vec![
                    Permission {
                        id: "viewer-read".to_string(),
                        resource: "*".to_string(),
                        action: PermissionAction::Read,
                        conditions: Some(PermissionConditions {
                            own_only: false,
                            workspace_only: true,
                            time_restricted: None,
                        }),
                    },
                ],
                is_system: true,
                created_at: now,
                updated_at: now,
            },
        ];

        for role in default_roles {
            self.roles.insert(role.id.clone(), role);
        }
    }

    // ============================================
    // SSO Methods
    // ============================================

    pub fn configure_sso(&mut self, provider: SsoProvider, client_id: &str, tenant_id: Option<&str>, domain: Option<&str>) -> SsoConfig {
        let now = chrono::Utc::now().timestamp();
        let config = SsoConfig {
            id: Uuid::new_v4().to_string(),
            provider,
            enabled: true,
            client_id: client_id.to_string(),
            tenant_id: tenant_id.map(|s| s.to_string()),
            domain: domain.map(|s| s.to_string()),
            metadata_url: None,
            created_at: now,
            updated_at: now,
        };
        self.sso_configs.insert(config.id.clone(), config.clone());
        config
    }

    pub fn get_sso_configs(&self) -> Vec<&SsoConfig> {
        self.sso_configs.values().collect()
    }

    pub fn disable_sso(&mut self, config_id: &str) -> Result<(), String> {
        let config = self.sso_configs.get_mut(config_id)
            .ok_or_else(|| format!("SSO config not found: {}", config_id))?;
        config.enabled = false;
        config.updated_at = chrono::Utc::now().timestamp();
        Ok(())
    }

    // ============================================
    // RBAC Methods
    // ============================================

    pub fn create_role(&mut self, name: &str, description: &str, permissions: Vec<Permission>) -> Role {
        let now = chrono::Utc::now().timestamp();
        let role = Role {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            description: description.to_string(),
            permissions,
            is_system: false,
            created_at: now,
            updated_at: now,
        };
        self.roles.insert(role.id.clone(), role.clone());
        role
    }

    pub fn get_roles(&self) -> Vec<&Role> {
        self.roles.values().collect()
    }

    pub fn assign_role(&mut self, user_id: &str, role_id: &str, scope: RoleScope, assigned_by: &str) -> Result<UserRole, String> {
        if !self.roles.contains_key(role_id) {
            return Err(format!("Role not found: {}", role_id));
        }

        let user_role = UserRole {
            user_id: user_id.to_string(),
            role_id: role_id.to_string(),
            scope,
            assigned_at: chrono::Utc::now().timestamp(),
            assigned_by: assigned_by.to_string(),
        };

        self.user_roles.push(user_role.clone());
        Ok(user_role)
    }

    pub fn revoke_role(&mut self, user_id: &str, role_id: &str) -> Result<(), String> {
        let initial_len = self.user_roles.len();
        self.user_roles.retain(|ur| !(ur.user_id == user_id && ur.role_id == role_id));
        
        if self.user_roles.len() == initial_len {
            return Err(format!("Role assignment not found for user: {}", user_id));
        }
        Ok(())
    }

    pub fn get_user_roles(&self, user_id: &str) -> Vec<&UserRole> {
        self.user_roles.iter().filter(|ur| ur.user_id == user_id).collect()
    }

    pub fn check_permission(&self, user_id: &str, resource: &str, action: &PermissionAction) -> bool {
        let user_roles = self.get_user_roles(user_id);
        
        for user_role in user_roles {
            if let Some(role) = self.roles.get(&user_role.role_id) {
                for perm in &role.permissions {
                    if (perm.resource == "*" || perm.resource == resource) &&
                       matches!(&perm.action, PermissionAction::All) || std::mem::discriminant(&perm.action) == std::mem::discriminant(action) {
                        return true;
                    }
                }
            }
        }
        false
    }

    // ============================================
    // Audit Log Methods
    // ============================================

    pub fn log_action(&mut self, user_id: &str, user_email: &str, action: AuditAction, resource_type: &str, resource_id: &str, details: serde_json::Value, status: AuditStatus) -> AuditLog {
        let log = AuditLog {
            id: Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().timestamp(),
            user_id: user_id.to_string(),
            user_email: user_email.to_string(),
            action,
            resource_type: resource_type.to_string(),
            resource_id: resource_id.to_string(),
            details,
            ip_address: None,
            user_agent: None,
            status,
            error_message: None,
        };
        self.audit_logs.push(log.clone());
        log
    }

    pub fn query_audit_logs(&self, query: &AuditQuery) -> AuditQueryResult {
        let mut filtered: Vec<&AuditLog> = self.audit_logs.iter()
            .filter(|log| {
                if let Some(ref user_id) = query.user_id {
                    if &log.user_id != user_id { return false; }
                }
                if let Some(ref resource_type) = query.resource_type {
                    if &log.resource_type != resource_type { return false; }
                }
                if let Some(start) = query.start_time {
                    if log.timestamp < start { return false; }
                }
                if let Some(end) = query.end_time {
                    if log.timestamp > end { return false; }
                }
                true
            })
            .collect();

        filtered.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

        let total = filtered.len() as u64;
        let start = ((query.page - 1) * query.per_page) as usize;
        let end = (start + query.per_page as usize).min(filtered.len());
        
        let logs: Vec<AuditLog> = filtered[start..end].iter().map(|l| (*l).clone()).collect();
        let total_pages = ((total as f64) / (query.per_page as f64)).ceil() as u32;

        AuditQueryResult {
            logs,
            total,
            page: query.page,
            per_page: query.per_page,
            total_pages,
        }
    }

    // ============================================
    // Compliance Methods
    // ============================================

    pub fn get_compliance_settings(&self) -> &ComplianceSettings {
        &self.compliance_settings
    }

    pub fn update_compliance_settings(&mut self, settings: ComplianceSettings) {
        self.compliance_settings = settings;
    }

    pub fn request_data_export(&mut self, user_id: &str, export_type: ExportType) -> DataExportRequest {
        let request = DataExportRequest {
            id: Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            request_type: export_type,
            status: ExportStatus::Pending,
            download_url: None,
            expires_at: None,
            created_at: chrono::Utc::now().timestamp(),
            completed_at: None,
        };
        self.export_requests.insert(request.id.clone(), request.clone());
        request
    }

    pub fn get_export_request(&self, request_id: &str) -> Option<&DataExportRequest> {
        self.export_requests.get(request_id)
    }

    pub fn delete_user_data(&mut self, user_id: &str) -> Result<(), String> {
        // Remove user roles
        self.user_roles.retain(|ur| ur.user_id != user_id);
        
        // In production, this would also delete user data from database
        Ok(())
    }
}
