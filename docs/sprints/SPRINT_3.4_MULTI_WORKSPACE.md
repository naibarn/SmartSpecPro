# Sprint 3.4: Multi-workspace

**Duration:** 1.5 สัปดาห์ (7-10 วันทำงาน)  
**Priority:** High  
**Dependencies:** Phase 1 (SQLite per Workspace)  

---

## 🎯 Sprint Goal

สร้างระบบ Multi-workspace ที่ช่วยให้:
1. สลับระหว่าง workspaces ได้ง่าย
2. Sync workspaces ข้ามอุปกรณ์
3. แชร์ workspaces กับทีม
4. Import/export workspaces

---

## 📋 User Stories

### US-3.4.1: Workspace Switching
> **As a** user  
> **I want** to switch between workspaces easily  
> **So that** I can work on multiple projects

**Acceptance Criteria:**
- [ ] Workspace list
- [ ] Quick switch (keyboard shortcut)
- [ ] Recent workspaces
- [ ] Workspace search
- [ ] Create new workspace

### US-3.4.2: Workspace Sync
> **As a** user  
> **I want** to sync workspaces across devices  
> **So that** I can work from anywhere

**Acceptance Criteria:**
- [ ] Cloud sync setup
- [ ] Automatic sync
- [ ] Conflict resolution
- [ ] Offline support
- [ ] Sync status indicator

### US-3.4.3: Team Workspaces
> **As a** team lead  
> **I want** to share workspaces with my team  
> **So that** we can collaborate

**Acceptance Criteria:**
- [ ] Invite team members
- [ ] Permission levels
- [ ] Activity visibility
- [ ] Team settings
- [ ] Leave workspace

### US-3.4.4: Import/Export
> **As a** user  
> **I want** to import/export workspaces  
> **So that** I can backup and share

**Acceptance Criteria:**
- [ ] Export to file
- [ ] Import from file
- [ ] Workspace templates
- [ ] Selective export
- [ ] Version compatibility

---

## 🏗️ Technical Architecture

### Multi-workspace Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MULTI-WORKSPACE ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  WORKSPACE MANAGER                                                           │
    │                                                                              │
    │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
    │  │   Registry    │  │   Switcher    │  │   Creator     │  │   Importer    │ │
    │  │               │  │               │  │               │  │               │ │
    │  │ • List all    │  │ • Switch      │  │ • From scratch│  │ • From file   │ │
    │  │ • Metadata    │  │ • Recent      │  │ • From        │  │ • From cloud  │ │
    │  │ • Status      │  │ • Search      │  │   template    │  │ • From URL    │ │
    │  │               │  │               │  │ • Clone       │  │               │ │
    │  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
    └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  SYNC ENGINE                                                                 │
    │                                                                              │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
    │  │  │   Local       │  │   Cloud       │  │   Conflict    │               ││
    │  │  │   Store       │◄─┼──►  Store     │──►│   Resolver    │               ││
    │  │  │               │  │               │  │               │               ││
    │  │  │ • SQLite      │  │ • S3/GCS      │  │ • Auto-merge  │               ││
    │  │  │ • Files       │  │ • Metadata    │  │ • Manual      │               ││
    │  │  │ • Cache       │  │ • Versions    │  │ • History     │               ││
    │  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  TEAM COLLABORATION                                                          │
    │                                                                              │
    │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
    │  │   Members     │  │   Permissions │  │   Activity    │  │   Settings    │ │
    │  │               │  │               │  │               │  │               │ │
    │  │ • Invite      │  │ • Owner       │  │ • Real-time   │  │ • Name        │ │
    │  │ • Remove      │  │ • Admin       │  │ • History     │  │ • Icon        │ │
    │  │ • Roles       │  │ • Member      │  │ • Presence    │  │ • Visibility  │ │
    │  │               │  │ • Viewer      │  │               │  │               │ │
    │  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
    └──────────────────────────────────────────────────────────────────────────────┘
```

### Data Models

```typescript
// Workspace
interface Workspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  type: 'personal' | 'team';
  ownerId: string;
  members: WorkspaceMember[];
  settings: WorkspaceSettings;
  sync: SyncSettings;
  stats: WorkspaceStats;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
}

// Workspace Member
interface WorkspaceMember {
  userId: string;
  userName: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
  lastActiveAt: string;
}

// Sync Settings
interface SyncSettings {
  enabled: boolean;
  provider: 'smartspecpro' | 's3' | 'gcs' | 'custom';
  autoSync: boolean;
  syncInterval: number;
  lastSyncAt: string;
  status: 'synced' | 'syncing' | 'pending' | 'error';
}

// Workspace Export
interface WorkspaceExport {
  version: string;
  exportedAt: string;
  workspace: {
    name: string;
    description: string;
    settings: WorkspaceSettings;
  };
  data: {
    tasks: Task[];
    specs: Spec[];
    knowledge: Knowledge[];
    templates: Template[];
  };
  assets: {
    files: ExportedFile[];
  };
}
```

---

## 📁 Implementation Tasks

### Week 1: Core & Sync

#### Task 3.4.1: Workspace Manager (Rust)
**File:** `desktop-app/src-tauri/src/workspace/manager.rs`

```rust
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct WorkspaceManager {
    workspaces: Arc<RwLock<HashMap<String, Workspace>>>,
    current_id: Arc<RwLock<Option<String>>>,
    workspaces_dir: PathBuf,
    sync_engine: Arc<SyncEngine>,
}

impl WorkspaceManager {
    pub fn new(workspaces_dir: PathBuf) -> Result<Self, Error> {
        let sync_engine = Arc::new(SyncEngine::new()?);
        
        Ok(Self {
            workspaces: Arc::new(RwLock::new(HashMap::new())),
            current_id: Arc::new(RwLock::new(None)),
            workspaces_dir,
            sync_engine,
        })
    }
    
    pub async fn initialize(&self) -> Result<(), Error> {
        // Discover existing workspaces
        let workspaces = self.discover_workspaces().await?;
        
        let mut ws_map = self.workspaces.write().await;
        for workspace in workspaces {
            ws_map.insert(workspace.id.clone(), workspace);
        }
        
        // Set current to last accessed
        if let Some(last) = self.get_last_accessed().await? {
            *self.current_id.write().await = Some(last);
        }
        
        Ok(())
    }
    
    async fn discover_workspaces(&self) -> Result<Vec<Workspace>, Error> {
        let mut workspaces = Vec::new();
        
        let entries = std::fs::read_dir(&self.workspaces_dir)?;
        
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_dir() {
                let metadata_path = path.join("workspace.json");
                if metadata_path.exists() {
                    let content = std::fs::read_to_string(&metadata_path)?;
                    let workspace: Workspace = serde_json::from_str(&content)?;
                    workspaces.push(workspace);
                }
            }
        }
        
        Ok(workspaces)
    }
    
    pub async fn list_workspaces(&self) -> Result<Vec<WorkspaceSummary>, Error> {
        let workspaces = self.workspaces.read().await;
        
        let mut summaries: Vec<_> = workspaces
            .values()
            .map(|w| WorkspaceSummary {
                id: w.id.clone(),
                name: w.name.clone(),
                description: w.description.clone(),
                icon: w.icon.clone(),
                color: w.color.clone(),
                type_: w.type_.clone(),
                member_count: w.members.len(),
                sync_status: w.sync.status.clone(),
                last_accessed_at: w.last_accessed_at.clone(),
            })
            .collect();
        
        // Sort by last accessed
        summaries.sort_by(|a, b| b.last_accessed_at.cmp(&a.last_accessed_at));
        
        Ok(summaries)
    }
    
    pub async fn get_current(&self) -> Result<Option<Workspace>, Error> {
        let current_id = self.current_id.read().await;
        
        if let Some(id) = current_id.as_ref() {
            let workspaces = self.workspaces.read().await;
            Ok(workspaces.get(id).cloned())
        } else {
            Ok(None)
        }
    }
    
    pub async fn switch_workspace(&self, id: &str) -> Result<Workspace, Error> {
        let workspaces = self.workspaces.read().await;
        let workspace = workspaces.get(id).ok_or(Error::WorkspaceNotFound)?;
        
        // Update current
        *self.current_id.write().await = Some(id.to_string());
        
        // Update last accessed
        drop(workspaces);
        self.update_last_accessed(id).await?;
        
        // Trigger sync if enabled
        if workspace.sync.enabled && workspace.sync.auto_sync {
            self.sync_engine.sync_workspace(id).await?;
        }
        
        let workspaces = self.workspaces.read().await;
        Ok(workspaces.get(id).unwrap().clone())
    }
    
    pub async fn create_workspace(&self, request: CreateWorkspaceRequest) -> Result<Workspace, Error> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        
        let workspace = Workspace {
            id: id.clone(),
            name: request.name,
            description: request.description,
            icon: request.icon.unwrap_or_else(|| "📁".to_string()),
            color: request.color.unwrap_or_else(|| "#6366f1".to_string()),
            type_: request.type_.unwrap_or(WorkspaceType::Personal),
            owner_id: request.owner_id,
            members: vec![],
            settings: WorkspaceSettings::default(),
            sync: SyncSettings::default(),
            stats: WorkspaceStats::default(),
            created_at: now.clone(),
            updated_at: now.clone(),
            last_accessed_at: now,
        };
        
        // Create directory structure
        let workspace_dir = self.workspaces_dir.join(&id);
        std::fs::create_dir_all(&workspace_dir)?;
        
        // Create SQLite database
        self.create_workspace_db(&workspace_dir).await?;
        
        // Save metadata
        let metadata_path = workspace_dir.join("workspace.json");
        std::fs::write(&metadata_path, serde_json::to_string_pretty(&workspace)?)?;
        
        // Add to registry
        let mut workspaces = self.workspaces.write().await;
        workspaces.insert(id.clone(), workspace.clone());
        
        Ok(workspace)
    }
    
    pub async fn clone_workspace(&self, source_id: &str, name: &str) -> Result<Workspace, Error> {
        let source = {
            let workspaces = self.workspaces.read().await;
            workspaces.get(source_id).ok_or(Error::WorkspaceNotFound)?.clone()
        };
        
        // Create new workspace
        let new_workspace = self.create_workspace(CreateWorkspaceRequest {
            name: name.to_string(),
            description: format!("Cloned from {}", source.name),
            icon: Some(source.icon.clone()),
            color: Some(source.color.clone()),
            type_: Some(WorkspaceType::Personal),
            owner_id: source.owner_id.clone(),
        }).await?;
        
        // Copy data
        self.copy_workspace_data(&source.id, &new_workspace.id).await?;
        
        Ok(new_workspace)
    }
    
    pub async fn delete_workspace(&self, id: &str) -> Result<(), Error> {
        // Check if current
        let current_id = self.current_id.read().await;
        if current_id.as_ref() == Some(&id.to_string()) {
            return Err(Error::CannotDeleteCurrentWorkspace);
        }
        drop(current_id);
        
        // Remove from registry
        let mut workspaces = self.workspaces.write().await;
        workspaces.remove(id);
        
        // Delete files
        let workspace_dir = self.workspaces_dir.join(id);
        std::fs::remove_dir_all(&workspace_dir)?;
        
        Ok(())
    }
    
    pub async fn search_workspaces(&self, query: &str) -> Result<Vec<WorkspaceSummary>, Error> {
        let workspaces = self.workspaces.read().await;
        let query_lower = query.to_lowercase();
        
        let results: Vec<_> = workspaces
            .values()
            .filter(|w| {
                w.name.to_lowercase().contains(&query_lower) ||
                w.description.to_lowercase().contains(&query_lower)
            })
            .map(|w| WorkspaceSummary {
                id: w.id.clone(),
                name: w.name.clone(),
                description: w.description.clone(),
                icon: w.icon.clone(),
                color: w.color.clone(),
                type_: w.type_.clone(),
                member_count: w.members.len(),
                sync_status: w.sync.status.clone(),
                last_accessed_at: w.last_accessed_at.clone(),
            })
            .collect();
        
        Ok(results)
    }
    
    pub async fn get_recent_workspaces(&self, limit: usize) -> Result<Vec<WorkspaceSummary>, Error> {
        let mut workspaces = self.list_workspaces().await?;
        workspaces.truncate(limit);
        Ok(workspaces)
    }
}
```

**Deliverables:**
- [ ] Workspace registry
- [ ] Switch workspace
- [ ] Create workspace
- [ ] Clone workspace
- [ ] Delete workspace
- [ ] Search workspaces

#### Task 3.4.2: Sync Engine
**File:** `desktop-app/src-tauri/src/workspace/sync.rs`

```rust
pub struct SyncEngine {
    providers: HashMap<String, Box<dyn SyncProvider>>,
    queue: Arc<RwLock<SyncQueue>>,
}

impl SyncEngine {
    pub fn new() -> Result<Self, Error> {
        let mut providers: HashMap<String, Box<dyn SyncProvider>> = HashMap::new();
        
        // Register providers
        providers.insert("smartspecpro".to_string(), Box::new(SmartSpecProSync::new()?));
        providers.insert("s3".to_string(), Box::new(S3Sync::new()?));
        
        Ok(Self {
            providers,
            queue: Arc::new(RwLock::new(SyncQueue::new())),
        })
    }
    
    pub async fn sync_workspace(&self, workspace_id: &str) -> Result<SyncResult, Error> {
        let workspace = self.get_workspace(workspace_id).await?;
        
        if !workspace.sync.enabled {
            return Err(Error::SyncDisabled);
        }
        
        let provider = self.providers
            .get(&workspace.sync.provider)
            .ok_or(Error::ProviderNotFound)?;
        
        // Get local changes
        let local_changes = self.get_local_changes(workspace_id).await?;
        
        // Get remote changes
        let remote_changes = provider.get_changes(workspace_id, &workspace.sync.last_sync_at).await?;
        
        // Resolve conflicts
        let (to_upload, to_download, conflicts) = self.resolve_changes(
            local_changes,
            remote_changes,
        )?;
        
        // Upload local changes
        for change in to_upload {
            provider.upload(workspace_id, &change).await?;
        }
        
        // Download remote changes
        for change in to_download {
            self.apply_change(workspace_id, &change).await?;
        }
        
        // Update sync status
        self.update_sync_status(workspace_id, SyncStatus::Synced).await?;
        
        Ok(SyncResult {
            uploaded: to_upload.len(),
            downloaded: to_download.len(),
            conflicts: conflicts.len(),
            conflict_details: conflicts,
        })
    }
    
    fn resolve_changes(
        &self,
        local: Vec<Change>,
        remote: Vec<Change>,
    ) -> Result<(Vec<Change>, Vec<Change>, Vec<Conflict>), Error> {
        let mut to_upload = Vec::new();
        let mut to_download = Vec::new();
        let mut conflicts = Vec::new();
        
        let remote_map: HashMap<_, _> = remote.iter()
            .map(|c| (c.id.clone(), c))
            .collect();
        
        let local_map: HashMap<_, _> = local.iter()
            .map(|c| (c.id.clone(), c))
            .collect();
        
        // Process local changes
        for change in &local {
            if let Some(remote_change) = remote_map.get(&change.id) {
                // Both modified - conflict
                if change.timestamp != remote_change.timestamp {
                    conflicts.push(Conflict {
                        id: change.id.clone(),
                        local: change.clone(),
                        remote: (*remote_change).clone(),
                        resolution: None,
                    });
                }
            } else {
                // Only local - upload
                to_upload.push(change.clone());
            }
        }
        
        // Process remote-only changes
        for change in &remote {
            if !local_map.contains_key(&change.id) {
                to_download.push(change.clone());
            }
        }
        
        Ok((to_upload, to_download, conflicts))
    }
    
    pub async fn resolve_conflict(&self, workspace_id: &str, conflict_id: &str, resolution: ConflictResolution) -> Result<(), Error> {
        match resolution {
            ConflictResolution::KeepLocal => {
                // Upload local version
            }
            ConflictResolution::KeepRemote => {
                // Download remote version
            }
            ConflictResolution::Merge(merged) => {
                // Apply merged version
            }
        }
        
        Ok(())
    }
    
    pub async fn enable_sync(&self, workspace_id: &str, settings: SyncSettings) -> Result<(), Error> {
        // Validate provider
        if !self.providers.contains_key(&settings.provider) {
            return Err(Error::ProviderNotFound);
        }
        
        // Initialize sync
        let provider = self.providers.get(&settings.provider).unwrap();
        provider.initialize(workspace_id).await?;
        
        // Update workspace settings
        self.update_workspace_sync_settings(workspace_id, settings).await?;
        
        // Perform initial sync
        self.sync_workspace(workspace_id).await?;
        
        Ok(())
    }
    
    pub async fn disable_sync(&self, workspace_id: &str) -> Result<(), Error> {
        let settings = SyncSettings {
            enabled: false,
            ..Default::default()
        };
        
        self.update_workspace_sync_settings(workspace_id, settings).await?;
        
        Ok(())
    }
}

#[async_trait]
trait SyncProvider: Send + Sync {
    async fn initialize(&self, workspace_id: &str) -> Result<(), Error>;
    async fn get_changes(&self, workspace_id: &str, since: &str) -> Result<Vec<Change>, Error>;
    async fn upload(&self, workspace_id: &str, change: &Change) -> Result<(), Error>;
    async fn download(&self, workspace_id: &str, change_id: &str) -> Result<Change, Error>;
}
```

**Deliverables:**
- [ ] Sync engine
- [ ] Multiple providers
- [ ] Conflict resolution
- [ ] Auto-sync

#### Task 3.4.3: Team Collaboration
**File:** `desktop-app/src-tauri/src/workspace/team.rs`

```rust
pub struct TeamManager {
    workspace_manager: Arc<WorkspaceManager>,
}

impl TeamManager {
    pub async fn invite_member(&self, workspace_id: &str, email: &str, role: MemberRole) -> Result<Invitation, Error> {
        // Create invitation
        let invitation = Invitation {
            id: uuid::Uuid::new_v4().to_string(),
            workspace_id: workspace_id.to_string(),
            email: email.to_string(),
            role,
            status: InvitationStatus::Pending,
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: (chrono::Utc::now() + chrono::Duration::days(7)).to_rfc3339(),
        };
        
        // Store invitation
        self.store_invitation(&invitation).await?;
        
        // Send email
        self.send_invitation_email(&invitation).await?;
        
        Ok(invitation)
    }
    
    pub async fn accept_invitation(&self, invitation_id: &str, user_id: &str) -> Result<WorkspaceMember, Error> {
        let invitation = self.get_invitation(invitation_id).await?;
        
        if invitation.status != InvitationStatus::Pending {
            return Err(Error::InvitationNotPending);
        }
        
        // Add member to workspace
        let member = WorkspaceMember {
            user_id: user_id.to_string(),
            user_name: self.get_user_name(user_id).await?,
            email: invitation.email.clone(),
            role: invitation.role.clone(),
            joined_at: chrono::Utc::now().to_rfc3339(),
            last_active_at: chrono::Utc::now().to_rfc3339(),
        };
        
        self.add_member(&invitation.workspace_id, &member).await?;
        
        // Update invitation status
        self.update_invitation_status(invitation_id, InvitationStatus::Accepted).await?;
        
        Ok(member)
    }
    
    pub async fn remove_member(&self, workspace_id: &str, user_id: &str) -> Result<(), Error> {
        // Check permissions
        self.check_can_remove_member(workspace_id, user_id).await?;
        
        // Remove member
        self.workspace_manager.remove_member(workspace_id, user_id).await?;
        
        Ok(())
    }
    
    pub async fn update_member_role(&self, workspace_id: &str, user_id: &str, role: MemberRole) -> Result<(), Error> {
        // Check permissions
        self.check_can_update_role(workspace_id, user_id).await?;
        
        // Update role
        self.workspace_manager.update_member_role(workspace_id, user_id, role).await?;
        
        Ok(())
    }
    
    pub async fn get_members(&self, workspace_id: &str) -> Result<Vec<WorkspaceMember>, Error> {
        self.workspace_manager.get_members(workspace_id).await
    }
    
    pub async fn leave_workspace(&self, workspace_id: &str, user_id: &str) -> Result<(), Error> {
        // Check if owner
        let workspace = self.workspace_manager.get_workspace(workspace_id).await?;
        if workspace.owner_id == user_id {
            return Err(Error::OwnerCannotLeave);
        }
        
        // Remove self
        self.workspace_manager.remove_member(workspace_id, user_id).await?;
        
        Ok(())
    }
    
    pub async fn transfer_ownership(&self, workspace_id: &str, new_owner_id: &str) -> Result<(), Error> {
        // Verify new owner is a member
        let members = self.get_members(workspace_id).await?;
        if !members.iter().any(|m| m.user_id == new_owner_id) {
            return Err(Error::UserNotMember);
        }
        
        // Transfer ownership
        self.workspace_manager.transfer_ownership(workspace_id, new_owner_id).await?;
        
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum MemberRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

impl MemberRole {
    pub fn can_edit(&self) -> bool {
        matches!(self, MemberRole::Owner | MemberRole::Admin | MemberRole::Member)
    }
    
    pub fn can_manage_members(&self) -> bool {
        matches!(self, MemberRole::Owner | MemberRole::Admin)
    }
    
    pub fn can_delete_workspace(&self) -> bool {
        matches!(self, MemberRole::Owner)
    }
}
```

**Deliverables:**
- [ ] Invite members
- [ ] Accept invitation
- [ ] Remove members
- [ ] Update roles
- [ ] Leave workspace
- [ ] Transfer ownership

---

### Week 1.5: Import/Export & Frontend

#### Task 3.4.4: Import/Export
**File:** `desktop-app/src-tauri/src/workspace/export.rs`

```rust
pub struct WorkspaceExporter {
    workspace_manager: Arc<WorkspaceManager>,
}

impl WorkspaceExporter {
    pub async fn export(&self, workspace_id: &str, options: ExportOptions) -> Result<PathBuf, Error> {
        let workspace = self.workspace_manager.get_workspace(workspace_id).await?;
        
        // Create export structure
        let export = WorkspaceExport {
            version: "1.0.0".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            workspace: WorkspaceExportData {
                name: workspace.name.clone(),
                description: workspace.description.clone(),
                settings: workspace.settings.clone(),
            },
            data: self.export_data(workspace_id, &options).await?,
            assets: self.export_assets(workspace_id, &options).await?,
        };
        
        // Create archive
        let export_path = self.create_export_archive(&export, &options).await?;
        
        Ok(export_path)
    }
    
    async fn export_data(&self, workspace_id: &str, options: &ExportOptions) -> Result<ExportedData, Error> {
        let mut data = ExportedData::default();
        
        if options.include_tasks {
            data.tasks = self.get_all_tasks(workspace_id).await?;
        }
        
        if options.include_specs {
            data.specs = self.get_all_specs(workspace_id).await?;
        }
        
        if options.include_knowledge {
            data.knowledge = self.get_all_knowledge(workspace_id).await?;
        }
        
        if options.include_templates {
            data.templates = self.get_all_templates(workspace_id).await?;
        }
        
        Ok(data)
    }
    
    async fn create_export_archive(&self, export: &WorkspaceExport, options: &ExportOptions) -> Result<PathBuf, Error> {
        let temp_dir = tempfile::tempdir()?;
        let export_dir = temp_dir.path().join("export");
        std::fs::create_dir_all(&export_dir)?;
        
        // Write metadata
        let metadata_path = export_dir.join("workspace.json");
        std::fs::write(&metadata_path, serde_json::to_string_pretty(&export)?)?;
        
        // Copy assets
        if !export.assets.files.is_empty() {
            let assets_dir = export_dir.join("assets");
            std::fs::create_dir_all(&assets_dir)?;
            
            for file in &export.assets.files {
                let dest = assets_dir.join(&file.name);
                std::fs::copy(&file.path, &dest)?;
            }
        }
        
        // Create zip
        let output_path = options.output_path.clone().unwrap_or_else(|| {
            PathBuf::from(format!("{}-export.zip", export.workspace.name))
        });
        
        self.create_zip(&export_dir, &output_path)?;
        
        Ok(output_path)
    }
    
    pub async fn import(&self, path: &PathBuf, options: ImportOptions) -> Result<Workspace, Error> {
        // Extract archive
        let temp_dir = tempfile::tempdir()?;
        self.extract_zip(path, temp_dir.path())?;
        
        // Read metadata
        let metadata_path = temp_dir.path().join("workspace.json");
        let content = std::fs::read_to_string(&metadata_path)?;
        let export: WorkspaceExport = serde_json::from_str(&content)?;
        
        // Check version compatibility
        self.check_version_compatibility(&export.version)?;
        
        // Create workspace
        let workspace = self.workspace_manager.create_workspace(CreateWorkspaceRequest {
            name: options.name.unwrap_or(export.workspace.name),
            description: export.workspace.description,
            icon: None,
            color: None,
            type_: Some(WorkspaceType::Personal),
            owner_id: options.owner_id,
        }).await?;
        
        // Import data
        self.import_data(&workspace.id, &export.data).await?;
        
        // Import assets
        self.import_assets(&workspace.id, temp_dir.path()).await?;
        
        Ok(workspace)
    }
}
```

**Deliverables:**
- [ ] Export workspace
- [ ] Import workspace
- [ ] Selective export
- [ ] Version compatibility

#### Task 3.4.5-3.4.8: Frontend

- **3.4.5:** Workspace Service (TypeScript)
- **3.4.6:** Workspace Switcher UI
- **3.4.7:** Sync Settings UI
- **3.4.8:** Team Management UI

---

## 📊 Definition of Done

- [ ] Workspace switching ทำงานได้
- [ ] Sync ทำงานได้
- [ ] Team collaboration ทำงานได้
- [ ] Import/export ทำงานได้
- [ ] Unit tests coverage > 80%

---

## 🚀 Next Sprint

**Sprint 3.5: Enterprise Features**
- SSO (SAML, OIDC)
- Audit logging
- RBAC
- Compliance
