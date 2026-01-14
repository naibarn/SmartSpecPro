// Enterprise Commands - Tauri IPC Commands for Enterprise Features
//
// Provides commands for:
// - SSO configuration
// - RBAC management
// - Audit logging
// - Compliance settings

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::enterprise::{
    EnterpriseService, SsoConfig, SsoProvider, Role, Permission, UserRole,
    RoleScope, AuditLog, AuditAction, AuditStatus, AuditQuery, AuditQueryResult,
    ComplianceSettings, DataExportRequest, ExportType,
};

// ============================================
// State Types
// ============================================

pub struct EnterpriseState {
    pub service: EnterpriseService,
}

impl EnterpriseState {
    pub fn new() -> Self {
        Self {
            service: EnterpriseService::new(),
        }
    }
}

// ============================================
// SSO Commands
// ============================================

#[tauri::command]
pub async fn ent_configure_sso(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    provider: String,
    client_id: String,
    tenant_id: Option<String>,
    domain: Option<String>,
) -> Result<SsoConfig, String> {
    let mut state = state.lock().await;
    let sso_provider = parse_sso_provider(&provider)?;
    Ok(state.service.configure_sso(sso_provider, &client_id, tenant_id.as_deref(), domain.as_deref()))
}

#[tauri::command]
pub async fn ent_get_sso_configs(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
) -> Result<Vec<SsoConfig>, String> {
    let state = state.lock().await;
    Ok(state.service.get_sso_configs().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn ent_disable_sso(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    config_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.disable_sso(&config_id)
}

// ============================================
// RBAC Commands
// ============================================

#[tauri::command]
pub async fn ent_create_role(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    name: String,
    description: String,
    permissions: Vec<Permission>,
) -> Result<Role, String> {
    let mut state = state.lock().await;
    Ok(state.service.create_role(&name, &description, permissions))
}

#[tauri::command]
pub async fn ent_get_roles(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
) -> Result<Vec<Role>, String> {
    let state = state.lock().await;
    Ok(state.service.get_roles().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn ent_assign_role(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    user_id: String,
    role_id: String,
    scope_type: String,
    scope_id: Option<String>,
    assigned_by: String,
) -> Result<UserRole, String> {
    let mut state = state.lock().await;
    let scope = parse_role_scope(&scope_type, scope_id)?;
    state.service.assign_role(&user_id, &role_id, scope, &assigned_by)
}

#[tauri::command]
pub async fn ent_revoke_role(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    user_id: String,
    role_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.revoke_role(&user_id, &role_id)
}

#[tauri::command]
pub async fn ent_get_user_roles(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    user_id: String,
) -> Result<Vec<UserRole>, String> {
    let state = state.lock().await;
    Ok(state.service.get_user_roles(&user_id).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn ent_check_permission(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    user_id: String,
    resource: String,
    action: String,
) -> Result<bool, String> {
    let state = state.lock().await;
    let perm_action = parse_permission_action(&action)?;
    Ok(state.service.check_permission(&user_id, &resource, &perm_action))
}

// ============================================
// Audit Log Commands
// ============================================

#[tauri::command]
pub async fn ent_log_action(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    user_id: String,
    user_email: String,
    action: String,
    resource_type: String,
    resource_id: String,
    details: serde_json::Value,
    status: String,
) -> Result<AuditLog, String> {
    let mut state = state.lock().await;
    let audit_action = parse_audit_action(&action)?;
    let audit_status = parse_audit_status(&status)?;
    Ok(state.service.log_action(&user_id, &user_email, audit_action, &resource_type, &resource_id, details, audit_status))
}

#[tauri::command]
pub async fn ent_query_audit_logs(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    query: AuditQuery,
) -> Result<AuditQueryResult, String> {
    let state = state.lock().await;
    Ok(state.service.query_audit_logs(&query))
}

// ============================================
// Compliance Commands
// ============================================

#[tauri::command]
pub async fn ent_get_compliance_settings(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
) -> Result<ComplianceSettings, String> {
    let state = state.lock().await;
    Ok(state.service.get_compliance_settings().clone())
}

#[tauri::command]
pub async fn ent_update_compliance_settings(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    settings: ComplianceSettings,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.update_compliance_settings(settings);
    Ok(())
}

#[tauri::command]
pub async fn ent_request_data_export(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    user_id: String,
    export_type: String,
) -> Result<DataExportRequest, String> {
    let mut state = state.lock().await;
    let exp_type = parse_export_type(&export_type)?;
    Ok(state.service.request_data_export(&user_id, exp_type))
}

#[tauri::command]
pub async fn ent_get_export_request(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    request_id: String,
) -> Result<DataExportRequest, String> {
    let state = state.lock().await;
    state.service.get_export_request(&request_id)
        .cloned()
        .ok_or_else(|| format!("Export request not found: {}", request_id))
}

#[tauri::command]
pub async fn ent_delete_user_data(
    state: State<'_, Arc<Mutex<EnterpriseState>>>,
    user_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.delete_user_data(&user_id)
}

// ============================================
// Helper Functions
// ============================================

fn parse_sso_provider(s: &str) -> Result<SsoProvider, String> {
    match s.to_lowercase().as_str() {
        "saml" => Ok(SsoProvider::Saml),
        "oidc" => Ok(SsoProvider::Oidc),
        "azure_ad" | "azuread" => Ok(SsoProvider::AzureAd),
        "okta" => Ok(SsoProvider::Okta),
        "google" => Ok(SsoProvider::Google),
        "github" => Ok(SsoProvider::Github),
        _ => Err(format!("Invalid SSO provider: {}", s)),
    }
}

fn parse_role_scope(scope_type: &str, scope_id: Option<String>) -> Result<RoleScope, String> {
    match scope_type.to_lowercase().as_str() {
        "global" => Ok(RoleScope::Global),
        "organization" => Ok(RoleScope::Organization { 
            org_id: scope_id.ok_or("Organization ID required")? 
        }),
        "workspace" => Ok(RoleScope::Workspace { 
            workspace_id: scope_id.ok_or("Workspace ID required")? 
        }),
        "project" => Ok(RoleScope::Project { 
            project_id: scope_id.ok_or("Project ID required")? 
        }),
        _ => Err(format!("Invalid role scope: {}", scope_type)),
    }
}

fn parse_permission_action(s: &str) -> Result<crate::enterprise::PermissionAction, String> {
    match s.to_lowercase().as_str() {
        "create" => Ok(crate::enterprise::PermissionAction::Create),
        "read" => Ok(crate::enterprise::PermissionAction::Read),
        "update" => Ok(crate::enterprise::PermissionAction::Update),
        "delete" => Ok(crate::enterprise::PermissionAction::Delete),
        "execute" => Ok(crate::enterprise::PermissionAction::Execute),
        "admin" => Ok(crate::enterprise::PermissionAction::Admin),
        "all" => Ok(crate::enterprise::PermissionAction::All),
        _ => Err(format!("Invalid permission action: {}", s)),
    }
}

fn parse_audit_action(s: &str) -> Result<AuditAction, String> {
    match s.to_lowercase().as_str() {
        "login" => Ok(AuditAction::Login),
        "logout" => Ok(AuditAction::Logout),
        "password_change" => Ok(AuditAction::PasswordChange),
        "create" => Ok(AuditAction::Create),
        "read" => Ok(AuditAction::Read),
        "update" => Ok(AuditAction::Update),
        "delete" => Ok(AuditAction::Delete),
        "export" => Ok(AuditAction::Export),
        "import" => Ok(AuditAction::Import),
        "role_assigned" => Ok(AuditAction::RoleAssigned),
        "role_revoked" => Ok(AuditAction::RoleRevoked),
        "settings_changed" => Ok(AuditAction::SettingsChanged),
        "user_invited" => Ok(AuditAction::UserInvited),
        "user_removed" => Ok(AuditAction::UserRemoved),
        _ => Err(format!("Invalid audit action: {}", s)),
    }
}

fn parse_audit_status(s: &str) -> Result<AuditStatus, String> {
    match s.to_lowercase().as_str() {
        "success" => Ok(AuditStatus::Success),
        "failure" => Ok(AuditStatus::Failure),
        "pending" => Ok(AuditStatus::Pending),
        _ => Err(format!("Invalid audit status: {}", s)),
    }
}

fn parse_export_type(s: &str) -> Result<ExportType, String> {
    match s.to_lowercase().as_str() {
        "user_data" => Ok(ExportType::UserData),
        "workspace_data" => Ok(ExportType::WorkspaceData),
        "audit_logs" => Ok(ExportType::AuditLogs),
        "full_export" => Ok(ExportType::FullExport),
        _ => Err(format!("Invalid export type: {}", s)),
    }
}
