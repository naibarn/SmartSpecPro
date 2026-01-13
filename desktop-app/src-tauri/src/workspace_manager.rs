// Workspace Manager - Manages project workspaces with Docker containers
//
// Provides:
// - Workspace creation/deletion with persistent storage
// - Branch-container mapping for parallel development
// - Git integration for version control
// - Docker orchestration for isolated environments

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

// ============================================
// Types and Structures
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub name: String,
    pub path: PathBuf,
    pub repository: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub default_image: String,
    pub branches: HashMap<String, BranchConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchConfig {
    pub name: String,
    pub container_id: Option<String>,
    pub container_name: Option<String>,
    pub image: String,
    pub ports: Vec<PortMapping>,
    pub status: ContainerStatus,
    pub parent_branch: Option<String>,
    pub created_at: String,
    pub last_active: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortMapping {
    pub host: u16,
    pub container: u16,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ContainerStatus {
    None,
    Created,
    Running,
    Stopped,
    Removed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub version: String,
    pub workspace: WorkspaceInfo,
    pub defaults: WorkspaceDefaults,
    pub scripts: HashMap<String, String>,
    pub port_mapping: HashMap<String, u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    pub name: String,
    pub path: String,
    pub repository: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceDefaults {
    pub image: String,
    pub memory_limit: String,
    pub cpu_limit: f32,
    pub auto_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
    pub repository: Option<String>,
    pub image: Option<String>,
    pub clone_repo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateBranchRequest {
    pub workspace: String,
    pub branch_name: String,
    pub from_branch: String,
    pub image: Option<String>,
    pub auto_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceList {
    pub workspaces: Vec<WorkspaceSummary>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceSummary {
    pub name: String,
    pub path: String,
    pub repository: Option<String>,
    pub branch_count: usize,
    pub running_containers: usize,
    pub last_active: String,
}

// ============================================
// Workspace Manager Implementation
// ============================================

pub struct WorkspaceManager {
    base_dir: PathBuf,
    cache_dir: PathBuf,
    config_dir: PathBuf,
}

impl WorkspaceManager {
    /// Create a new WorkspaceManager instance
    pub fn new() -> Result<Self, String> {
        let home = dirs::home_dir().ok_or("Cannot find home directory")?;
        
        let base_dir = home.join("SmartSpec").join("workspaces");
        let cache_dir = home.join("SmartSpec").join("cache");
        let config_dir = home.join("SmartSpec").join("config");
        
        // Create directories if they don't exist
        fs::create_dir_all(&base_dir).map_err(|e| format!("Failed to create workspaces dir: {}", e))?;
        fs::create_dir_all(&cache_dir).map_err(|e| format!("Failed to create cache dir: {}", e))?;
        fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
        
        // Create cache subdirectories
        for subdir in &["npm", "pnpm", "pip", "go", "cargo"] {
            fs::create_dir_all(cache_dir.join(subdir))
                .map_err(|e| format!("Failed to create {} cache dir: {}", subdir, e))?;
        }
        
        Ok(Self {
            base_dir,
            cache_dir,
            config_dir,
        })
    }
    
    /// Get the base directory for workspaces
    pub fn get_base_dir(&self) -> &PathBuf {
        &self.base_dir
    }
    
    /// Get the cache directory
    pub fn get_cache_dir(&self) -> &PathBuf {
        &self.cache_dir
    }
    
    // ========================================
    // Workspace Operations
    // ========================================
    
    /// Create a new workspace
    pub fn create_workspace(&self, request: &CreateWorkspaceRequest) -> Result<Workspace, String> {
        let workspace_path = self.base_dir.join(&request.name);
        
        // Check if workspace already exists
        if workspace_path.exists() {
            return Err(format!("Workspace '{}' already exists", request.name));
        }
        
        // Create workspace directory
        fs::create_dir_all(&workspace_path)
            .map_err(|e| format!("Failed to create workspace directory: {}", e))?;
        
        // Create .workspace metadata directory
        let metadata_dir = workspace_path.join(".workspace");
        fs::create_dir_all(&metadata_dir)
            .map_err(|e| format!("Failed to create metadata directory: {}", e))?;
        
        // Clone repository if provided
        if request.clone_repo {
            if let Some(repo_url) = &request.repository {
                self.clone_repository(repo_url, &workspace_path)?;
            }
        } else {
            // Initialize empty git repository
            self.init_git_repo(&workspace_path)?;
        }
        
        let now = chrono::Utc::now().to_rfc3339();
        let default_image = request.image.clone()
            .unwrap_or_else(|| "smartspec/sandbox-nodejs:latest".to_string());
        
        // Create workspace config
        let workspace = Workspace {
            name: request.name.clone(),
            path: workspace_path.clone(),
            repository: request.repository.clone(),
            created_at: now.clone(),
            updated_at: now.clone(),
            default_image: default_image.clone(),
            branches: HashMap::new(),
        };
        
        // Save workspace config
        self.save_workspace_config(&workspace)?;
        
        // Update global workspace registry
        self.register_workspace(&workspace)?;
        
        Ok(workspace)
    }
    
    /// Delete a workspace
    pub fn delete_workspace(&self, name: &str, delete_containers: bool) -> Result<(), String> {
        let workspace_path = self.base_dir.join(name);
        
        if !workspace_path.exists() {
            return Err(format!("Workspace '{}' not found", name));
        }
        
        // Load workspace to get container info
        if let Ok(workspace) = self.load_workspace(name) {
            if delete_containers {
                // Stop and remove all containers
                for (_, branch) in workspace.branches {
                    if let Some(container_id) = branch.container_id {
                        let _ = self.remove_container(&container_id, true);
                    }
                }
            }
        }
        
        // Remove workspace directory
        fs::remove_dir_all(&workspace_path)
            .map_err(|e| format!("Failed to delete workspace: {}", e))?;
        
        // Update global registry
        self.unregister_workspace(name)?;
        
        Ok(())
    }
    
    /// List all workspaces
    pub fn list_workspaces(&self) -> Result<WorkspaceList, String> {
        let mut workspaces = Vec::new();
        
        let entries = fs::read_dir(&self.base_dir)
            .map_err(|e| format!("Failed to read workspaces directory: {}", e))?;
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if let Ok(workspace) = self.load_workspace(name) {
                        let running = workspace.branches.values()
                            .filter(|b| b.status == ContainerStatus::Running)
                            .count();
                        
                        workspaces.push(WorkspaceSummary {
                            name: workspace.name,
                            path: workspace.path.to_string_lossy().to_string(),
                            repository: workspace.repository,
                            branch_count: workspace.branches.len(),
                            running_containers: running,
                            last_active: workspace.updated_at,
                        });
                    }
                }
            }
        }
        
        let total = workspaces.len();
        Ok(WorkspaceList { workspaces, total })
    }
    
    /// Load workspace configuration
    pub fn load_workspace(&self, name: &str) -> Result<Workspace, String> {
        let config_path = self.base_dir.join(name).join(".workspace").join("config.json");
        
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read workspace config: {}", e))?;
        
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse workspace config: {}", e))
    }
    
    /// Save workspace configuration
    pub fn save_workspace_config(&self, workspace: &Workspace) -> Result<(), String> {
        let config_path = workspace.path.join(".workspace").join("config.json");
        
        let content = serde_json::to_string_pretty(workspace)
            .map_err(|e| format!("Failed to serialize workspace config: {}", e))?;
        
        fs::write(&config_path, content)
            .map_err(|e| format!("Failed to write workspace config: {}", e))
    }
    
    // ========================================
    // Branch Operations
    // ========================================
    
    /// Create a new branch with container
    pub fn create_branch(&self, request: &CreateBranchRequest) -> Result<BranchConfig, String> {
        let mut workspace = self.load_workspace(&request.workspace)?;
        
        // Check if branch already exists
        if workspace.branches.contains_key(&request.branch_name) {
            return Err(format!("Branch '{}' already exists", request.branch_name));
        }
        
        // Create git branch
        self.create_git_branch(&workspace.path, &request.branch_name, &request.from_branch)?;
        
        let now = chrono::Utc::now().to_rfc3339();
        let image = request.image.clone().unwrap_or(workspace.default_image.clone());
        
        // Allocate ports
        let ports = self.allocate_ports(3)?;
        let port_mappings: Vec<PortMapping> = ports.iter().enumerate().map(|(i, &port)| {
            let container_port = match i {
                0 => 3000,
                1 => 8000,
                2 => 9229,
                _ => 3000 + i as u16,
            };
            PortMapping {
                host: port,
                container: container_port,
                protocol: "tcp".to_string(),
            }
        }).collect();
        
        let mut branch_config = BranchConfig {
            name: request.branch_name.clone(),
            container_id: None,
            container_name: None,
            image: image.clone(),
            ports: port_mappings,
            status: ContainerStatus::None,
            parent_branch: Some(request.from_branch.clone()),
            created_at: now.clone(),
            last_active: now,
        };
        
        // Create and optionally start container
        if request.auto_start {
            let container_name = self.generate_container_name(&workspace.name, &request.branch_name);
            let container_id = self.create_container(&workspace, &branch_config, &container_name)?;
            
            branch_config.container_id = Some(container_id.clone());
            branch_config.container_name = Some(container_name);
            branch_config.status = ContainerStatus::Created;
            
            // Start container
            self.start_container(&container_id)?;
            branch_config.status = ContainerStatus::Running;
        }
        
        // Save branch config
        workspace.branches.insert(request.branch_name.clone(), branch_config.clone());
        workspace.updated_at = chrono::Utc::now().to_rfc3339();
        self.save_workspace_config(&workspace)?;
        
        Ok(branch_config)
    }
    
    /// Checkout branch (switch container)
    pub fn checkout_branch(&self, workspace_name: &str, branch_name: &str) -> Result<BranchConfig, String> {
        let mut workspace = self.load_workspace(workspace_name)?;
        
        // Get branch config
        let branch = workspace.branches.get_mut(branch_name)
            .ok_or(format!("Branch '{}' not found", branch_name))?;
        
        // Checkout git branch
        self.checkout_git_branch(&workspace.path, branch_name)?;
        
        // Start container if not running
        if branch.status != ContainerStatus::Running {
            if let Some(container_id) = &branch.container_id {
                self.start_container(container_id)?;
                branch.status = ContainerStatus::Running;
            }
        }
        
        branch.last_active = chrono::Utc::now().to_rfc3339();
        let result = branch.clone();
        
        workspace.updated_at = chrono::Utc::now().to_rfc3339();
        self.save_workspace_config(&workspace)?;
        
        Ok(result)
    }
    
    /// Merge branch
    pub fn merge_branch(
        &self,
        workspace_name: &str,
        source_branch: &str,
        target_branch: &str,
        delete_source: bool,
    ) -> Result<(), String> {
        let mut workspace = self.load_workspace(workspace_name)?;
        
        // Merge git branches
        self.merge_git_branches(&workspace.path, source_branch, target_branch)?;
        
        if delete_source {
            // Stop and remove container
            if let Some(branch) = workspace.branches.get(source_branch) {
                if let Some(container_id) = &branch.container_id {
                    let _ = self.stop_container(container_id);
                    let _ = self.remove_container(container_id, false);
                }
            }
            
            // Delete git branch
            self.delete_git_branch(&workspace.path, source_branch)?;
            
            // Remove from workspace config
            workspace.branches.remove(source_branch);
        }
        
        workspace.updated_at = chrono::Utc::now().to_rfc3339();
        self.save_workspace_config(&workspace)?;
        
        Ok(())
    }
    
    // ========================================
    // Container Operations
    // ========================================
    
    /// Create a container for a branch
    fn create_container(
        &self,
        workspace: &Workspace,
        branch: &BranchConfig,
        container_name: &str,
    ) -> Result<String, String> {
        let mut args = vec![
            "create".to_string(),
            "--name".to_string(),
            container_name.to_string(),
            "-it".to_string(),
        ];
        
        // Add port mappings
        for port in &branch.ports {
            args.push("-p".to_string());
            args.push(format!("{}:{}", port.host, port.container));
        }
        
        // Mount workspace directory
        args.push("-v".to_string());
        args.push(format!("{}:/workspace/project", workspace.path.to_string_lossy()));
        
        // Mount cache directories
        args.push("-v".to_string());
        args.push(format!("{}:/home/sandbox/.npm", self.cache_dir.join("npm").to_string_lossy()));
        
        args.push("-v".to_string());
        args.push(format!("{}:/home/sandbox/.local/share/pnpm", self.cache_dir.join("pnpm").to_string_lossy()));
        
        // Set working directory
        args.push("-w".to_string());
        args.push("/workspace/project".to_string());
        
        // Add image
        args.push(branch.image.clone());
        
        let output = Command::new("docker")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to create container: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Docker create failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(container_id)
    }
    
    /// Start a container
    fn start_container(&self, container_id: &str) -> Result<(), String> {
        let output = Command::new("docker")
            .args(["start", container_id])
            .output()
            .map_err(|e| format!("Failed to start container: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Docker start failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    /// Stop a container
    fn stop_container(&self, container_id: &str) -> Result<(), String> {
        let output = Command::new("docker")
            .args(["stop", container_id])
            .output()
            .map_err(|e| format!("Failed to stop container: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Docker stop failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    /// Remove a container
    fn remove_container(&self, container_id: &str, force: bool) -> Result<(), String> {
        let mut args = vec!["rm"];
        if force {
            args.push("-f");
        }
        args.push(container_id);
        
        let output = Command::new("docker")
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to remove container: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Docker rm failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    // ========================================
    // Git Operations
    // ========================================
    
    fn init_git_repo(&self, path: &PathBuf) -> Result<(), String> {
        let output = Command::new("git")
            .args(["init"])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to init git repo: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Git init failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    fn clone_repository(&self, url: &str, path: &PathBuf) -> Result<(), String> {
        let output = Command::new("git")
            .args(["clone", url, "."])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to clone repository: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Git clone failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    fn create_git_branch(&self, path: &PathBuf, branch: &str, from: &str) -> Result<(), String> {
        // First checkout the source branch
        let output = Command::new("git")
            .args(["checkout", from])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to checkout source branch: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Git checkout failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        // Create and checkout new branch
        let output = Command::new("git")
            .args(["checkout", "-b", branch])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to create branch: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Git branch creation failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    fn checkout_git_branch(&self, path: &PathBuf, branch: &str) -> Result<(), String> {
        let output = Command::new("git")
            .args(["checkout", branch])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to checkout branch: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Git checkout failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    fn merge_git_branches(&self, path: &PathBuf, source: &str, target: &str) -> Result<(), String> {
        // Checkout target branch
        self.checkout_git_branch(path, target)?;
        
        // Merge source into target
        let output = Command::new("git")
            .args(["merge", source, "--no-ff", "-m", &format!("Merge {} into {}", source, target)])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to merge branches: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Git merge failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    fn delete_git_branch(&self, path: &PathBuf, branch: &str) -> Result<(), String> {
        let output = Command::new("git")
            .args(["branch", "-d", branch])
            .current_dir(path)
            .output()
            .map_err(|e| format!("Failed to delete branch: {}", e))?;
        
        if !output.status.success() {
            return Err(format!(
                "Git branch delete failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    // ========================================
    // Helper Functions
    // ========================================
    
    fn generate_container_name(&self, workspace: &str, branch: &str) -> String {
        let sanitized_branch = branch.replace("/", "-").replace("_", "-");
        let short_hash = &uuid::Uuid::new_v4().to_string()[..6];
        format!("smartspec-{}-{}-{}", workspace, sanitized_branch, short_hash)
    }
    
    fn allocate_ports(&self, count: usize) -> Result<Vec<u16>, String> {
        // Simple port allocation - in production, check for availability
        let base_port = 3000 + (rand::random::<u16>() % 1000);
        Ok((0..count).map(|i| base_port + i as u16).collect())
    }
    
    fn register_workspace(&self, workspace: &Workspace) -> Result<(), String> {
        let registry_path = self.config_dir.join("workspaces.json");
        
        let mut registry: HashMap<String, String> = if registry_path.exists() {
            let content = fs::read_to_string(&registry_path)
                .map_err(|e| format!("Failed to read registry: {}", e))?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            HashMap::new()
        };
        
        registry.insert(
            workspace.name.clone(),
            workspace.path.to_string_lossy().to_string(),
        );
        
        let content = serde_json::to_string_pretty(&registry)
            .map_err(|e| format!("Failed to serialize registry: {}", e))?;
        
        fs::write(&registry_path, content)
            .map_err(|e| format!("Failed to write registry: {}", e))
    }
    
    fn unregister_workspace(&self, name: &str) -> Result<(), String> {
        let registry_path = self.config_dir.join("workspaces.json");
        
        if !registry_path.exists() {
            return Ok(());
        }
        
        let content = fs::read_to_string(&registry_path)
            .map_err(|e| format!("Failed to read registry: {}", e))?;
        
        let mut registry: HashMap<String, String> = serde_json::from_str(&content)
            .unwrap_or_default();
        
        registry.remove(name);
        
        let content = serde_json::to_string_pretty(&registry)
            .map_err(|e| format!("Failed to serialize registry: {}", e))?;
        
        fs::write(&registry_path, content)
            .map_err(|e| format!("Failed to write registry: {}", e))
    }
}

// ============================================
// External Dependencies (add to Cargo.toml)
// ============================================
// dirs = "5"
// rand = "0.8"
