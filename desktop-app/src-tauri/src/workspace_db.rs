// Workspace Database Manager - SQLite per Workspace
//
// Provides:
// - Separate SQLite database for each workspace
// - Automatic schema migrations
// - Connection pooling per workspace
// - WAL mode for concurrent access

use anyhow::{Context, Result, anyhow};
use rusqlite::{Connection, params};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::fs;

// ============================================
// Types and Structures
// ============================================

/// Workspace database connection wrapper
pub struct WorkspaceDb {
    conn: Connection,
    workspace_id: String,
    path: PathBuf,
}

/// Workspace database manager - handles multiple workspace databases
pub struct WorkspaceDbManager {
    base_dir: PathBuf,
    connections: RwLock<HashMap<String, Arc<Mutex<WorkspaceDb>>>>,
    app_db: Arc<Mutex<Connection>>,
    workspace_index_db: Arc<Mutex<Connection>>,
}

/// Workspace metadata stored in index
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorkspaceMetadata {
    pub id: String,
    pub name: String,
    pub path: String,
    pub git_remote: Option<String>,
    pub created_at: String,
    pub last_accessed_at: String,
    pub is_active: bool,
    pub metadata_json: Option<String>,
}

/// Database statistics
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WorkspaceDbStats {
    pub workspace_id: String,
    pub job_count: i64,
    pub task_count: i64,
    pub chat_session_count: i64,
    pub knowledge_count: i64,
    pub memory_short_count: i64,
    pub memory_long_count: i64,
    pub total_tokens_used: i64,
    pub db_size_bytes: u64,
}

// ============================================
// Implementation
// ============================================

impl WorkspaceDbManager {
    /// Create a new WorkspaceDbManager
    pub fn new() -> Result<Self> {
        let home = dirs::home_dir().ok_or_else(|| anyhow!("Cannot find home directory"))?;
        let base_dir = home.join("SmartSpec");
        
        // Create directory structure
        let config_dir = base_dir.join("config");
        let workspaces_dir = base_dir.join("workspaces");
        
        fs::create_dir_all(&config_dir)
            .context("Failed to create config directory")?;
        fs::create_dir_all(&workspaces_dir)
            .context("Failed to create workspaces directory")?;
        
        // Initialize app-level database
        let app_db_path = config_dir.join("app.db");
        let app_db = Self::init_app_db(&app_db_path)?;
        
        // Initialize workspace index database
        let index_db_path = workspaces_dir.join(".workspace-index.db");
        let workspace_index_db = Self::init_workspace_index_db(&index_db_path)?;
        
        Ok(Self {
            base_dir,
            connections: RwLock::new(HashMap::new()),
            app_db: Arc::new(Mutex::new(app_db)),
            workspace_index_db: Arc::new(Mutex::new(workspace_index_db)),
        })
    }
    
    /// Initialize app-level database
    fn init_app_db(path: &Path) -> Result<Connection> {
        let conn = Connection::open(path)
            .context("Failed to open app database")?;
        
        // Enable WAL mode for better concurrent access
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
        ").context("Failed to set app database pragmas")?;
        
        // Run migrations
        let schema = include_str!("../migrations/V001_app_schema.sql");
        conn.execute_batch(schema)
            .context("Failed to initialize app database schema")?;
        
        Ok(conn)
    }
    
    /// Initialize workspace index database
    fn init_workspace_index_db(path: &Path) -> Result<Connection> {
        let conn = Connection::open(path)
            .context("Failed to open workspace index database")?;
        
        // Enable WAL mode
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
        ").context("Failed to set workspace index database pragmas")?;
        
        // Create workspace index schema
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                git_remote TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                metadata_json TEXT
            );
            
            CREATE INDEX IF NOT EXISTS idx_workspaces_last_accessed 
                ON workspaces(last_accessed_at DESC);
            CREATE INDEX IF NOT EXISTS idx_workspaces_active 
                ON workspaces(is_active, last_accessed_at DESC);
        ").context("Failed to initialize workspace index schema")?;
        
        Ok(conn)
    }
    
    /// Initialize a workspace database
    fn init_workspace_db(path: &Path, workspace_id: &str, workspace_name: &str) -> Result<Connection> {
        let conn = Connection::open(path)
            .context("Failed to open workspace database")?;
        
        // Enable WAL mode for better concurrent access
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            PRAGMA cache_size = -64000;
        ").context("Failed to set workspace database pragmas")?;
        
        // Run workspace schema migrations
        let schema = include_str!("../migrations/V001_initial_schema.sql");
        conn.execute_batch(schema)
            .context("Failed to initialize workspace database schema")?;
        
        // Set workspace info
        conn.execute(
            "INSERT OR REPLACE INTO workspace_info (key, value) VALUES ('workspace_id', ?)",
            params![workspace_id],
        ).context("Failed to set workspace_id")?;
        
        conn.execute(
            "INSERT OR REPLACE INTO workspace_info (key, value) VALUES ('workspace_name', ?)",
            params![workspace_name],
        ).context("Failed to set workspace_name")?;
        
        Ok(conn)
    }
    
    // ========================================
    // Workspace Operations
    // ========================================
    
    /// Create a new workspace with its own database
    pub fn create_workspace(&self, name: &str, git_remote: Option<&str>) -> Result<WorkspaceMetadata> {
        let workspace_id = uuid::Uuid::new_v4().to_string();
        let workspace_dir = self.base_dir.join("workspaces").join(&workspace_id);
        
        // Create workspace directory
        fs::create_dir_all(&workspace_dir)
            .context("Failed to create workspace directory")?;
        
        // Create subdirectories
        fs::create_dir_all(workspace_dir.join("project"))
            .context("Failed to create project directory")?;
        fs::create_dir_all(workspace_dir.join("checkpoints"))
            .context("Failed to create checkpoints directory")?;
        fs::create_dir_all(workspace_dir.join("cache"))
            .context("Failed to create cache directory")?;
        
        // Initialize workspace database
        let db_path = workspace_dir.join("workspace.db");
        let conn = Self::init_workspace_db(&db_path, &workspace_id, name)?;
        
        // Create workspace metadata
        let now = chrono::Utc::now().to_rfc3339();
        let metadata = WorkspaceMetadata {
            id: workspace_id.clone(),
            name: name.to_string(),
            path: workspace_dir.to_string_lossy().to_string(),
            git_remote: git_remote.map(|s| s.to_string()),
            created_at: now.clone(),
            last_accessed_at: now,
            is_active: true,
            metadata_json: None,
        };
        
        // Save workspace.json metadata file
        let metadata_path = workspace_dir.join("workspace.json");
        let metadata_json = serde_json::to_string_pretty(&metadata)
            .context("Failed to serialize workspace metadata")?;
        fs::write(&metadata_path, metadata_json)
            .context("Failed to write workspace metadata")?;
        
        // Register in workspace index
        self.register_workspace(&metadata)?;
        
        // Store connection
        let workspace_db = WorkspaceDb {
            conn,
            workspace_id: workspace_id.clone(),
            path: db_path,
        };
        
        let mut connections = self.connections.write()
            .map_err(|_| anyhow!("Failed to acquire write lock"))?;
        connections.insert(workspace_id, Arc::new(Mutex::new(workspace_db)));
        
        Ok(metadata)
    }
    
    /// Register workspace in the index database
    fn register_workspace(&self, metadata: &WorkspaceMetadata) -> Result<()> {
        let index_db = self.workspace_index_db.lock()
            .map_err(|_| anyhow!("Failed to acquire index database lock"))?;
        
        index_db.execute(
            "INSERT INTO workspaces (id, name, path, git_remote, created_at, last_accessed_at, is_active, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                metadata.id,
                metadata.name,
                metadata.path,
                metadata.git_remote,
                metadata.created_at,
                metadata.last_accessed_at,
                metadata.is_active,
                metadata.metadata_json,
            ],
        ).context("Failed to register workspace")?;
        
        Ok(())
    }
    
    /// Open an existing workspace database
    pub fn open_workspace(&self, workspace_id: &str) -> Result<Arc<Mutex<WorkspaceDb>>> {
        // Check if already open
        {
            let connections = self.connections.read()
                .map_err(|_| anyhow!("Failed to acquire read lock"))?;
            if let Some(conn) = connections.get(workspace_id) {
                // Update last accessed
                self.update_last_accessed(workspace_id)?;
                return Ok(Arc::clone(conn));
            }
        }
        
        // Get workspace path from index
        let workspace_path = self.get_workspace_path(workspace_id)?;
        let db_path = PathBuf::from(&workspace_path).join("workspace.db");
        
        if !db_path.exists() {
            return Err(anyhow!("Workspace database not found: {}", workspace_id));
        }
        
        // Open database
        let conn = Connection::open(&db_path)
            .context("Failed to open workspace database")?;
        
        // Set pragmas
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
        ").context("Failed to set workspace database pragmas")?;
        
        // Get workspace name
        let name: String = conn.query_row(
            "SELECT value FROM workspace_info WHERE key = 'workspace_name'",
            [],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());
        
        let workspace_db = WorkspaceDb {
            conn,
            workspace_id: workspace_id.to_string(),
            path: db_path,
        };
        
        let arc_db = Arc::new(Mutex::new(workspace_db));
        
        // Store connection
        let mut connections = self.connections.write()
            .map_err(|_| anyhow!("Failed to acquire write lock"))?;
        connections.insert(workspace_id.to_string(), Arc::clone(&arc_db));
        
        // Update last accessed
        self.update_last_accessed(workspace_id)?;
        
        Ok(arc_db)
    }
    
    /// Get workspace path from index
    fn get_workspace_path(&self, workspace_id: &str) -> Result<String> {
        let index_db = self.workspace_index_db.lock()
            .map_err(|_| anyhow!("Failed to acquire index database lock"))?;
        
        let path: String = index_db.query_row(
            "SELECT path FROM workspaces WHERE id = ?",
            params![workspace_id],
            |row| row.get(0),
        ).context("Workspace not found")?;
        
        Ok(path)
    }
    
    /// Update last accessed timestamp
    fn update_last_accessed(&self, workspace_id: &str) -> Result<()> {
        let index_db = self.workspace_index_db.lock()
            .map_err(|_| anyhow!("Failed to acquire index database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        index_db.execute(
            "UPDATE workspaces SET last_accessed_at = ? WHERE id = ?",
            params![now, workspace_id],
        ).context("Failed to update last accessed")?;
        
        Ok(())
    }
    
    /// Close a workspace database connection
    pub fn close_workspace(&self, workspace_id: &str) -> Result<()> {
        let mut connections = self.connections.write()
            .map_err(|_| anyhow!("Failed to acquire write lock"))?;
        
        connections.remove(workspace_id);
        Ok(())
    }
    
    /// Delete a workspace and its database
    pub fn delete_workspace(&self, workspace_id: &str) -> Result<()> {
        // Close connection if open
        self.close_workspace(workspace_id)?;
        
        // Get workspace path
        let workspace_path = self.get_workspace_path(workspace_id)?;
        
        // Remove from index
        {
            let index_db = self.workspace_index_db.lock()
                .map_err(|_| anyhow!("Failed to acquire index database lock"))?;
            
            index_db.execute(
                "DELETE FROM workspaces WHERE id = ?",
                params![workspace_id],
            ).context("Failed to remove workspace from index")?;
        }
        
        // Delete workspace directory
        fs::remove_dir_all(&workspace_path)
            .context("Failed to delete workspace directory")?;
        
        Ok(())
    }
    
    /// List all workspaces
    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceMetadata>> {
        let index_db = self.workspace_index_db.lock()
            .map_err(|_| anyhow!("Failed to acquire index database lock"))?;
        
        let mut stmt = index_db.prepare(
            "SELECT id, name, path, git_remote, created_at, last_accessed_at, is_active, metadata_json
             FROM workspaces
             WHERE is_active = 1
             ORDER BY last_accessed_at DESC"
        ).context("Failed to prepare query")?;
        
        let workspaces = stmt.query_map([], |row| {
            Ok(WorkspaceMetadata {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                git_remote: row.get(3)?,
                created_at: row.get(4)?,
                last_accessed_at: row.get(5)?,
                is_active: row.get(6)?,
                metadata_json: row.get(7)?,
            })
        }).context("Failed to query workspaces")?;
        
        let mut result = Vec::new();
        for workspace in workspaces {
            result.push(workspace.context("Failed to read workspace")?);
        }
        
        Ok(result)
    }
    
    /// Get workspace by ID
    pub fn get_workspace(&self, workspace_id: &str) -> Result<WorkspaceMetadata> {
        let index_db = self.workspace_index_db.lock()
            .map_err(|_| anyhow!("Failed to acquire index database lock"))?;
        
        let workspace = index_db.query_row(
            "SELECT id, name, path, git_remote, created_at, last_accessed_at, is_active, metadata_json
             FROM workspaces WHERE id = ?",
            params![workspace_id],
            |row| {
                Ok(WorkspaceMetadata {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    path: row.get(2)?,
                    git_remote: row.get(3)?,
                    created_at: row.get(4)?,
                    last_accessed_at: row.get(5)?,
                    is_active: row.get(6)?,
                    metadata_json: row.get(7)?,
                })
            },
        ).context("Workspace not found")?;
        
        Ok(workspace)
    }
    
    /// Get recent workspaces
    pub fn get_recent_workspaces(&self, limit: usize) -> Result<Vec<WorkspaceMetadata>> {
        let index_db = self.workspace_index_db.lock()
            .map_err(|_| anyhow!("Failed to acquire index database lock"))?;
        
        let mut stmt = index_db.prepare(
            "SELECT id, name, path, git_remote, created_at, last_accessed_at, is_active, metadata_json
             FROM workspaces
             WHERE is_active = 1
             ORDER BY last_accessed_at DESC
             LIMIT ?"
        ).context("Failed to prepare query")?;
        
        let workspaces = stmt.query_map(params![limit as i64], |row| {
            Ok(WorkspaceMetadata {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                git_remote: row.get(3)?,
                created_at: row.get(4)?,
                last_accessed_at: row.get(5)?,
                is_active: row.get(6)?,
                metadata_json: row.get(7)?,
            })
        }).context("Failed to query workspaces")?;
        
        let mut result = Vec::new();
        for workspace in workspaces {
            result.push(workspace.context("Failed to read workspace")?);
        }
        
        Ok(result)
    }
    
    /// Update workspace metadata
    pub fn update_workspace(&self, workspace_id: &str, name: Option<&str>, git_remote: Option<&str>) -> Result<()> {
        let index_db = self.workspace_index_db.lock()
            .map_err(|_| anyhow!("Failed to acquire index database lock"))?;
        
        if let Some(name) = name {
            index_db.execute(
                "UPDATE workspaces SET name = ? WHERE id = ?",
                params![name, workspace_id],
            ).context("Failed to update workspace name")?;
        }
        
        if let Some(git_remote) = git_remote {
            index_db.execute(
                "UPDATE workspaces SET git_remote = ? WHERE id = ?",
                params![git_remote, workspace_id],
            ).context("Failed to update workspace git_remote")?;
        }
        
        Ok(())
    }
    
    /// Get workspace database statistics
    pub fn get_workspace_stats(&self, workspace_id: &str) -> Result<WorkspaceDbStats> {
        let workspace_db = self.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let job_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM jobs",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let task_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM tasks",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let chat_session_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM chat_sessions",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let knowledge_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM knowledge",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let memory_short_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM memory_short",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let memory_long_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM memory_long",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let total_tokens_used: i64 = db.conn.query_row(
            "SELECT COALESCE(SUM(tokens_input + tokens_output), 0) FROM chat_messages",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        // Get database file size
        let db_size_bytes = fs::metadata(&db.path)
            .map(|m| m.len())
            .unwrap_or(0);
        
        Ok(WorkspaceDbStats {
            workspace_id: workspace_id.to_string(),
            job_count,
            task_count,
            chat_session_count,
            knowledge_count,
            memory_short_count,
            memory_long_count,
            total_tokens_used,
            db_size_bytes,
        })
    }
    
    // ========================================
    // App Database Operations
    // ========================================
    
    /// Get app database connection
    pub fn get_app_db(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.app_db)
    }
    
    /// Get setting from app database
    pub fn get_app_setting(&self, key: &str) -> Result<Option<String>> {
        let app_db = self.app_db.lock()
            .map_err(|_| anyhow!("Failed to acquire app database lock"))?;
        
        let value: Result<String, _> = app_db.query_row(
            "SELECT value FROM settings WHERE key = ?",
            params![key],
            |row| row.get(0),
        );
        
        match value {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(anyhow!("Failed to get setting: {}", e)),
        }
    }
    
    /// Set setting in app database
    pub fn set_app_setting(&self, key: &str, value: &str) -> Result<()> {
        let app_db = self.app_db.lock()
            .map_err(|_| anyhow!("Failed to acquire app database lock"))?;
        
        app_db.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            params![key, value],
        ).context("Failed to set setting")?;
        
        Ok(())
    }
    
    // ========================================
    // Backup & Restore
    // ========================================
    
    /// Backup a workspace database
    pub fn backup_workspace(&self, workspace_id: &str, backup_path: &Path) -> Result<()> {
        let workspace_db = self.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        // Create backup using SQLite backup API
        let mut backup_conn = Connection::open(backup_path)
            .context("Failed to create backup file")?;
        
        let backup = rusqlite::backup::Backup::new(&db.conn, &mut backup_conn)
            .context("Failed to initialize backup")?;
        
        backup.run_to_completion(100, std::time::Duration::from_millis(10), None)
            .context("Failed to complete backup")?;
        
        Ok(())
    }
    
    /// Restore a workspace database from backup
    pub fn restore_workspace(&self, workspace_id: &str, backup_path: &Path) -> Result<()> {
        // Close existing connection
        self.close_workspace(workspace_id)?;
        
        // Get workspace path
        let workspace_path = self.get_workspace_path(workspace_id)?;
        let db_path = PathBuf::from(&workspace_path).join("workspace.db");
        
        // Copy backup to workspace
        fs::copy(backup_path, &db_path)
            .context("Failed to restore backup")?;
        
        // Reopen workspace
        self.open_workspace(workspace_id)?;
        
        Ok(())
    }
    
    // ========================================
    // Maintenance
    // ========================================
    
    /// Vacuum workspace database to reclaim space
    pub fn vacuum_workspace(&self, workspace_id: &str) -> Result<()> {
        let workspace_db = self.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        db.conn.execute("VACUUM", [])
            .context("Failed to vacuum database")?;
        
        Ok(())
    }
    
    /// Clean up expired short-term memory
    pub fn cleanup_expired_memory(&self, workspace_id: &str) -> Result<usize> {
        let workspace_db = self.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let deleted = db.conn.execute(
            "DELETE FROM memory_short WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP",
            [],
        ).context("Failed to cleanup expired memory")?;
        
        Ok(deleted)
    }
    
    /// Analyze and optimize workspace database
    pub fn optimize_workspace(&self, workspace_id: &str) -> Result<()> {
        let workspace_db = self.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        db.conn.execute("ANALYZE", [])
            .context("Failed to analyze database")?;
        
        Ok(())
    }
}

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[test]
    fn test_create_workspace() {
        let manager = WorkspaceDbManager::new().unwrap();
        
        let metadata = manager.create_workspace("test-workspace", None).unwrap();
        
        assert_eq!(metadata.name, "test-workspace");
        assert!(metadata.is_active);
        
        // Cleanup
        manager.delete_workspace(&metadata.id).unwrap();
    }
    
    #[test]
    fn test_list_workspaces() {
        let manager = WorkspaceDbManager::new().unwrap();
        
        // Create test workspaces
        let ws1 = manager.create_workspace("test-ws-1", None).unwrap();
        let ws2 = manager.create_workspace("test-ws-2", None).unwrap();
        
        let workspaces = manager.list_workspaces().unwrap();
        
        assert!(workspaces.len() >= 2);
        
        // Cleanup
        manager.delete_workspace(&ws1.id).unwrap();
        manager.delete_workspace(&ws2.id).unwrap();
    }
    
    #[test]
    fn test_workspace_stats() {
        let manager = WorkspaceDbManager::new().unwrap();
        
        let metadata = manager.create_workspace("test-stats-ws", None).unwrap();
        
        let stats = manager.get_workspace_stats(&metadata.id).unwrap();
        
        assert_eq!(stats.job_count, 0);
        assert_eq!(stats.task_count, 0);
        
        // Cleanup
        manager.delete_workspace(&metadata.id).unwrap();
    }
}
