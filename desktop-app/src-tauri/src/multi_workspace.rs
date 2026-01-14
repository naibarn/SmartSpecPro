// Multi-workspace Service - Multiple Workspace Management
//
// Provides:
// - Workspace switching
// - Cross-workspace sync
// - Team workspaces
// - Workspace templates

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================
// Multi-workspace Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub workspace_type: WorkspaceType,
    pub owner_id: String,
    pub members: Vec<WorkspaceMember>,
    pub settings: WorkspaceSettings,
    pub storage_path: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_accessed_at: i64,
    pub is_active: bool,
    pub sync_enabled: bool,
    pub sync_status: SyncStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceType {
    Personal,
    Team,
    Organization,
    Shared,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMember {
    pub user_id: String,
    pub name: String,
    pub email: String,
    pub role: WorkspaceRole,
    pub joined_at: i64,
    pub last_active_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceRole {
    Owner,
    Admin,
    Editor,
    Viewer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSettings {
    pub default_template: Option<String>,
    pub auto_backup: bool,
    pub backup_frequency: BackupFrequency,
    pub retention_days: u32,
    pub notifications_enabled: bool,
    pub theme: Option<String>,
    pub custom_settings: HashMap<String, serde_json::Value>,
}

impl Default for WorkspaceSettings {
    fn default() -> Self {
        Self {
            default_template: None,
            auto_backup: true,
            backup_frequency: BackupFrequency::Daily,
            retention_days: 30,
            notifications_enabled: true,
            theme: None,
            custom_settings: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupFrequency {
    Hourly,
    Daily,
    Weekly,
    Monthly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_syncing: bool,
    pub last_sync_at: Option<i64>,
    pub pending_changes: u32,
    pub sync_error: Option<String>,
}

impl Default for SyncStatus {
    fn default() -> Self {
        Self {
            is_syncing: false,
            last_sync_at: None,
            pending_changes: 0,
            sync_error: None,
        }
    }
}

// ============================================
// Workspace Template Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub category: String,
    pub structure: TemplateStructure,
    pub default_settings: WorkspaceSettings,
    pub is_official: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateStructure {
    pub folders: Vec<String>,
    pub files: Vec<TemplateFile>,
    pub default_projects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateFile {
    pub path: String,
    pub content: String,
}

// ============================================
// Recent Workspace
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentWorkspace {
    pub workspace_id: String,
    pub name: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub workspace_type: WorkspaceType,
    pub last_accessed_at: i64,
    pub project_count: u32,
}

// ============================================
// Multi-workspace Service
// ============================================

pub struct MultiWorkspaceService {
    pub workspaces: HashMap<String, Workspace>,
    pub templates: HashMap<String, WorkspaceTemplate>,
    pub active_workspace_id: Option<String>,
    pub recent_workspaces: Vec<RecentWorkspace>,
}

impl MultiWorkspaceService {
    pub fn new() -> Self {
        let mut service = Self {
            workspaces: HashMap::new(),
            templates: HashMap::new(),
            active_workspace_id: None,
            recent_workspaces: Vec::new(),
        };
        service.load_default_templates();
        service
    }

    fn load_default_templates(&mut self) {
        let templates = vec![
            WorkspaceTemplate {
                id: "personal".to_string(),
                name: "Personal Workspace".to_string(),
                description: "A workspace for personal projects".to_string(),
                icon: Some("👤".to_string()),
                category: "personal".to_string(),
                structure: TemplateStructure {
                    folders: vec!["projects".to_string(), "archives".to_string()],
                    files: vec![],
                    default_projects: vec![],
                },
                default_settings: WorkspaceSettings::default(),
                is_official: true,
            },
            WorkspaceTemplate {
                id: "team".to_string(),
                name: "Team Workspace".to_string(),
                description: "A collaborative workspace for teams".to_string(),
                icon: Some("👥".to_string()),
                category: "team".to_string(),
                structure: TemplateStructure {
                    folders: vec!["projects".to_string(), "shared".to_string(), "templates".to_string()],
                    files: vec![],
                    default_projects: vec![],
                },
                default_settings: WorkspaceSettings {
                    notifications_enabled: true,
                    ..WorkspaceSettings::default()
                },
                is_official: true,
            },
            WorkspaceTemplate {
                id: "startup".to_string(),
                name: "Startup Workspace".to_string(),
                description: "Optimized for fast-moving startup teams".to_string(),
                icon: Some("🚀".to_string()),
                category: "organization".to_string(),
                structure: TemplateStructure {
                    folders: vec![
                        "products".to_string(),
                        "roadmap".to_string(),
                        "research".to_string(),
                        "archives".to_string(),
                    ],
                    files: vec![],
                    default_projects: vec![],
                },
                default_settings: WorkspaceSettings::default(),
                is_official: true,
            },
        ];

        for template in templates {
            self.templates.insert(template.id.clone(), template);
        }
    }

    // ============================================
    // Workspace CRUD
    // ============================================

    pub fn create_workspace(&mut self, name: &str, workspace_type: WorkspaceType, owner_id: &str, template_id: Option<&str>) -> Result<Workspace, String> {
        let now = chrono::Utc::now().timestamp();
        let id = Uuid::new_v4().to_string();

        let settings = template_id
            .and_then(|tid| self.templates.get(tid))
            .map(|t| t.default_settings.clone())
            .unwrap_or_default();

        let workspace = Workspace {
            id: id.clone(),
            name: name.to_string(),
            description: None,
            icon: None,
            color: None,
            workspace_type,
            owner_id: owner_id.to_string(),
            members: vec![WorkspaceMember {
                user_id: owner_id.to_string(),
                name: "Owner".to_string(),
                email: "owner@example.com".to_string(),
                role: WorkspaceRole::Owner,
                joined_at: now,
                last_active_at: now,
            }],
            settings,
            storage_path: format!("workspaces/{}", id),
            created_at: now,
            updated_at: now,
            last_accessed_at: now,
            is_active: true,
            sync_enabled: false,
            sync_status: SyncStatus::default(),
        };

        self.workspaces.insert(id.clone(), workspace.clone());
        self.update_recent(&workspace);

        Ok(workspace)
    }

    pub fn get_workspace(&self, workspace_id: &str) -> Option<&Workspace> {
        self.workspaces.get(workspace_id)
    }

    pub fn list_workspaces(&self) -> Vec<&Workspace> {
        self.workspaces.values().collect()
    }

    pub fn update_workspace(&mut self, workspace_id: &str, name: Option<&str>, description: Option<&str>, icon: Option<&str>, color: Option<&str>) -> Result<Workspace, String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        if let Some(n) = name {
            workspace.name = n.to_string();
        }
        if let Some(d) = description {
            workspace.description = Some(d.to_string());
        }
        if let Some(i) = icon {
            workspace.icon = Some(i.to_string());
        }
        if let Some(c) = color {
            workspace.color = Some(c.to_string());
        }

        workspace.updated_at = chrono::Utc::now().timestamp();
        Ok(workspace.clone())
    }

    pub fn delete_workspace(&mut self, workspace_id: &str) -> Result<(), String> {
        self.workspaces.remove(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        self.recent_workspaces.retain(|r| r.workspace_id != workspace_id);

        if self.active_workspace_id.as_deref() == Some(workspace_id) {
            self.active_workspace_id = None;
        }

        Ok(())
    }

    // ============================================
    // Workspace Switching
    // ============================================

    pub fn switch_workspace(&mut self, workspace_id: &str) -> Result<&Workspace, String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        workspace.last_accessed_at = chrono::Utc::now().timestamp();
        self.active_workspace_id = Some(workspace_id.to_string());

        let workspace = self.workspaces.get(workspace_id).unwrap();
        self.update_recent(workspace);

        Ok(workspace)
    }

    pub fn get_active_workspace(&self) -> Option<&Workspace> {
        self.active_workspace_id.as_ref()
            .and_then(|id| self.workspaces.get(id))
    }

    pub fn get_recent_workspaces(&self, limit: usize) -> Vec<&RecentWorkspace> {
        self.recent_workspaces.iter().take(limit).collect()
    }

    fn update_recent(&mut self, workspace: &Workspace) {
        self.recent_workspaces.retain(|r| r.workspace_id != workspace.id);

        self.recent_workspaces.insert(0, RecentWorkspace {
            workspace_id: workspace.id.clone(),
            name: workspace.name.clone(),
            icon: workspace.icon.clone(),
            color: workspace.color.clone(),
            workspace_type: workspace.workspace_type.clone(),
            last_accessed_at: workspace.last_accessed_at,
            project_count: 0, // Would be calculated from actual projects
        });

        // Keep only last 10 recent workspaces
        self.recent_workspaces.truncate(10);
    }

    // ============================================
    // Members
    // ============================================

    pub fn add_member(&mut self, workspace_id: &str, user_id: &str, name: &str, email: &str, role: WorkspaceRole) -> Result<WorkspaceMember, String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        if workspace.members.iter().any(|m| m.user_id == user_id) {
            return Err(format!("User {} is already a member", user_id));
        }

        let now = chrono::Utc::now().timestamp();
        let member = WorkspaceMember {
            user_id: user_id.to_string(),
            name: name.to_string(),
            email: email.to_string(),
            role,
            joined_at: now,
            last_active_at: now,
        };

        workspace.members.push(member.clone());
        workspace.updated_at = now;

        Ok(member)
    }

    pub fn remove_member(&mut self, workspace_id: &str, user_id: &str) -> Result<(), String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        if workspace.owner_id == user_id {
            return Err("Cannot remove workspace owner".to_string());
        }

        workspace.members.retain(|m| m.user_id != user_id);
        workspace.updated_at = chrono::Utc::now().timestamp();

        Ok(())
    }

    pub fn update_member_role(&mut self, workspace_id: &str, user_id: &str, role: WorkspaceRole) -> Result<(), String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        let member = workspace.members.iter_mut()
            .find(|m| m.user_id == user_id)
            .ok_or_else(|| format!("Member not found: {}", user_id))?;

        member.role = role;
        workspace.updated_at = chrono::Utc::now().timestamp();

        Ok(())
    }

    // ============================================
    // Sync
    // ============================================

    pub fn enable_sync(&mut self, workspace_id: &str) -> Result<(), String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        workspace.sync_enabled = true;
        workspace.updated_at = chrono::Utc::now().timestamp();

        Ok(())
    }

    pub fn disable_sync(&mut self, workspace_id: &str) -> Result<(), String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        workspace.sync_enabled = false;
        workspace.updated_at = chrono::Utc::now().timestamp();

        Ok(())
    }

    pub fn trigger_sync(&mut self, workspace_id: &str) -> Result<SyncStatus, String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        if !workspace.sync_enabled {
            return Err("Sync is not enabled for this workspace".to_string());
        }

        // Simulate sync
        workspace.sync_status.is_syncing = true;
        workspace.sync_status.last_sync_at = Some(chrono::Utc::now().timestamp());
        workspace.sync_status.pending_changes = 0;
        workspace.sync_status.sync_error = None;
        workspace.sync_status.is_syncing = false;

        Ok(workspace.sync_status.clone())
    }

    // ============================================
    // Templates
    // ============================================

    pub fn list_templates(&self) -> Vec<&WorkspaceTemplate> {
        self.templates.values().collect()
    }

    pub fn get_template(&self, template_id: &str) -> Option<&WorkspaceTemplate> {
        self.templates.get(template_id)
    }

    // ============================================
    // Settings
    // ============================================

    pub fn update_workspace_settings(&mut self, workspace_id: &str, settings: WorkspaceSettings) -> Result<(), String> {
        let workspace = self.workspaces.get_mut(workspace_id)
            .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

        workspace.settings = settings;
        workspace.updated_at = chrono::Utc::now().timestamp();

        Ok(())
    }
}
