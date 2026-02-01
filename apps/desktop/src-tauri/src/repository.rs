use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::{Arc, Mutex};

use crate::models::*;

/// Repository for workflow operations
pub struct WorkflowRepository {
    conn: Arc<Mutex<Connection>>,
}

impl WorkflowRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// Create a new workflow
    pub fn create(&self, workflow: &Workflow) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        let config_json = workflow.config.as_ref()
            .map(|c| serde_json::to_string(c).unwrap_or_default());

        conn.execute(
            "INSERT INTO workflows (id, name, description, version, config, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                workflow.id,
                workflow.name,
                workflow.description,
                workflow.version,
                config_json,
                workflow.created_at,
                workflow.updated_at,
            ],
        ).context("Failed to create workflow")?;

        Ok(())
    }

    /// Get workflow by ID
    pub fn get_by_id(&self, id: &str) -> Result<Option<Workflow>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, name, description, version, config, created_at, updated_at 
             FROM workflows WHERE id = ?1"
        )?;

        let workflow = stmt.query_row(params![id], |row| {
            let config_str: Option<String> = row.get(4)?;
            let config = config_str.and_then(|s| serde_json::from_str(&s).ok());

            Ok(Workflow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                version: row.get(3)?,
                config,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        }).optional()?;

        Ok(workflow)
    }

    /// Get workflow by name
    pub fn get_by_name(&self, name: &str) -> Result<Option<Workflow>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, name, description, version, config, created_at, updated_at 
             FROM workflows WHERE name = ?1"
        )?;

        let workflow = stmt.query_row(params![name], |row| {
            let config_str: Option<String> = row.get(4)?;
            let config = config_str.and_then(|s| serde_json::from_str(&s).ok());

            Ok(Workflow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                version: row.get(3)?,
                config,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        }).optional()?;

        Ok(workflow)
    }

    /// List all workflows with optional filter
    pub fn list(&self, filter: &WorkflowFilter) -> Result<Vec<Workflow>> {
        let conn = self.conn.lock().unwrap();

        let mut sql = "SELECT id, name, description, version, config, created_at, updated_at 
                       FROM workflows WHERE 1=1".to_string();
        
        if filter.name.is_some() {
            sql.push_str(" AND name LIKE ?1");
        }
        
        sql.push_str(" ORDER BY created_at DESC");
        
        if let Some(limit) = filter.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }
        
        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let mut stmt = conn.prepare(&sql)?;

        let row_mapper = |row: &rusqlite::Row| -> rusqlite::Result<Workflow> {
            let config_str: Option<String> = row.get(4)?;
            let config = config_str.and_then(|s| serde_json::from_str(&s).ok());

            Ok(Workflow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                version: row.get(3)?,
                config,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        };

        let workflows = if let Some(name) = &filter.name {
            let name_pattern = format!("%{}%", name);
            stmt.query_map(params![name_pattern], row_mapper)?
        } else {
            stmt.query_map([], row_mapper)?
        };

        let mut result = Vec::new();
        for workflow in workflows {
            result.push(workflow?);
        }

        Ok(result)
    }

    /// Update workflow
    pub fn update(&self, id: &str, req: &UpdateWorkflowRequest) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        // Get existing workflow
        let mut workflow = self.get_by_id(id)?
            .context("Workflow not found")?;

        // Update fields
        workflow.update(req.name.clone(), req.description.clone(), req.config.clone());

        // Save to database
        let config_json = workflow.config.as_ref()
            .map(|c| serde_json::to_string(c).unwrap_or_default());

        conn.execute(
            "UPDATE workflows SET name = ?1, description = ?2, config = ?3, updated_at = ?4 
             WHERE id = ?5",
            params![
                workflow.name,
                workflow.description,
                config_json,
                workflow.updated_at,
                id,
            ],
        ).context("Failed to update workflow")?;

        Ok(())
    }

    /// Delete workflow
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute("DELETE FROM workflows WHERE id = ?1", params![id])
            .context("Failed to delete workflow")?;

        Ok(())
    }

    /// Count total workflows
    pub fn count(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM workflows", [], |row| row.get(0))?;
        Ok(count)
    }
}

/// Repository for execution operations
pub struct ExecutionRepository {
    conn: Arc<Mutex<Connection>>,
}

impl ExecutionRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// Create a new execution
    pub fn create(&self, execution: &Execution) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        let output_json = execution.output.as_ref()
            .map(|o| serde_json::to_string(o).unwrap_or_default());

        conn.execute(
            "INSERT INTO executions (id, workflow_id, workflow_name, status, output, error, started_at, completed_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                execution.id,
                execution.workflow_id,
                execution.workflow_name,
                execution.status.as_str(),
                output_json,
                execution.error,
                execution.started_at,
                execution.completed_at,
            ],
        ).context("Failed to create execution")?;

        Ok(())
    }

    /// Get execution by ID
    pub fn get_by_id(&self, id: &str) -> Result<Option<Execution>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, workflow_id, workflow_name, status, output, error, started_at, completed_at 
             FROM executions WHERE id = ?1"
        )?;

        let execution = stmt.query_row(params![id], |row| {
            let status_str: String = row.get(3)?;
            let status = ExecutionStatus::from_str(&status_str).unwrap_or(ExecutionStatus::Failed);

            let output_str: Option<String> = row.get(4)?;
            let output = output_str.and_then(|s| serde_json::from_str(&s).ok());

            Ok(Execution {
                id: row.get(0)?,
                workflow_id: row.get(1)?,
                workflow_name: row.get(2)?,
                status,
                output,
                error: row.get(5)?,
                started_at: row.get(6)?,
                completed_at: row.get(7)?,
            })
        }).optional()?;

        Ok(execution)
    }

    /// List executions with optional filter
    pub fn list(&self, filter: &ExecutionFilter) -> Result<Vec<Execution>> {
        let conn = self.conn.lock().unwrap();

        let mut sql = "SELECT id, workflow_id, workflow_name, status, output, error, started_at, completed_at 
                       FROM executions WHERE 1=1".to_string();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if filter.workflow_id.is_some() {
            sql.push_str(" AND workflow_id = ?");
            params_vec.push(Box::new(filter.workflow_id.clone().unwrap()));
        }

        if let Some(status) = &filter.status {
            sql.push_str(" AND status = ?");
            params_vec.push(Box::new(status.as_str().to_string()));
        }

        sql.push_str(" ORDER BY started_at DESC");

        if let Some(limit) = filter.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }

        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let mut stmt = conn.prepare(&sql)?;

        let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

        let executions = stmt.query_map(params_refs.as_slice(), |row| {
            let status_str: String = row.get(3)?;
            let status = ExecutionStatus::from_str(&status_str).unwrap_or(ExecutionStatus::Failed);

            let output_str: Option<String> = row.get(4)?;
            let output = output_str.and_then(|s| serde_json::from_str(&s).ok());

            Ok(Execution {
                id: row.get(0)?,
                workflow_id: row.get(1)?,
                workflow_name: row.get(2)?,
                status,
                output,
                error: row.get(5)?,
                started_at: row.get(6)?,
                completed_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for execution in executions {
            result.push(execution?);
        }

        Ok(result)
    }

    /// Update execution status
    pub fn update_status(&self, id: &str, status: ExecutionStatus, output: Option<serde_json::Value>, error: Option<String>) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        let output_json = output.as_ref()
            .map(|o| serde_json::to_string(o).unwrap_or_default());

        let completed_at = if status != ExecutionStatus::Running {
            Some(chrono::Utc::now().timestamp())
        } else {
            None
        };

        conn.execute(
            "UPDATE executions SET status = ?1, output = ?2, error = ?3, completed_at = ?4 
             WHERE id = ?5",
            params![
                status.as_str(),
                output_json,
                error,
                completed_at,
                id,
            ],
        ).context("Failed to update execution status")?;

        Ok(())
    }

    /// Delete execution
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute("DELETE FROM executions WHERE id = ?1", params![id])
            .context("Failed to delete execution")?;

        Ok(())
    }

    /// Delete old executions (older than days)
    pub fn delete_old(&self, days: i64) -> Result<usize> {
        let conn = self.conn.lock().unwrap();

        let cutoff = chrono::Utc::now().timestamp() - (days * 24 * 60 * 60);

        let rows = conn.execute(
            "DELETE FROM executions WHERE started_at < ?1",
            params![cutoff],
        ).context("Failed to delete old executions")?;

        Ok(rows)
    }

    /// Count total executions
    pub fn count(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM executions", [], |row| row.get(0))?;
        Ok(count)
    }
}

/// Repository for config operations
pub struct ConfigRepository {
    conn: Arc<Mutex<Connection>>,
}

impl ConfigRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    /// Create or update a config
    pub fn upsert(&self, config: &Config) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "INSERT INTO configs (id, workflow_id, key, value, value_type, description, created_at, updated_at) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(workflow_id, key) DO UPDATE SET 
                value = excluded.value,
                value_type = excluded.value_type,
                description = excluded.description,
                updated_at = excluded.updated_at",
            params![
                config.id,
                config.workflow_id,
                config.key,
                config.value,
                config.value_type.as_str(),
                config.description,
                config.created_at,
                config.updated_at,
            ],
        ).context("Failed to upsert config")?;

        Ok(())
    }

    /// Get config by workflow ID and key
    pub fn get(&self, workflow_id: &str, key: &str) -> Result<Option<Config>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, workflow_id, key, value, value_type, description, created_at, updated_at 
             FROM configs WHERE workflow_id = ?1 AND key = ?2"
        )?;

        let config = stmt.query_row(params![workflow_id, key], |row| {
            let value_type_str: String = row.get(4)?;
            let value_type = ConfigValueType::from_str(&value_type_str).unwrap_or(ConfigValueType::String);

            Ok(Config {
                id: row.get(0)?,
                workflow_id: row.get(1)?,
                key: row.get(2)?,
                value: row.get(3)?,
                value_type,
                description: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        }).optional()?;

        Ok(config)
    }

    /// List all configs for a workflow
    pub fn list_by_workflow(&self, workflow_id: &str) -> Result<Vec<Config>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, workflow_id, key, value, value_type, description, created_at, updated_at 
             FROM configs WHERE workflow_id = ?1 ORDER BY key"
        )?;

        let configs = stmt.query_map(params![workflow_id], |row| {
            let value_type_str: String = row.get(4)?;
            let value_type = ConfigValueType::from_str(&value_type_str).unwrap_or(ConfigValueType::String);

            Ok(Config {
                id: row.get(0)?,
                workflow_id: row.get(1)?,
                key: row.get(2)?,
                value: row.get(3)?,
                value_type,
                description: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for config in configs {
            result.push(config?);
        }

        Ok(result)
    }

    /// Delete config
    pub fn delete(&self, workflow_id: &str, key: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "DELETE FROM configs WHERE workflow_id = ?1 AND key = ?2",
            params![workflow_id, key],
        ).context("Failed to delete config")?;

        Ok(())
    }

    /// Delete all configs for a workflow
    pub fn delete_by_workflow(&self, workflow_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute(
            "DELETE FROM configs WHERE workflow_id = ?1",
            params![workflow_id],
        ).context("Failed to delete configs")?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use std::fs;

    #[test]
    fn test_workflow_repository() {
        let db_path = std::path::PathBuf::from("/tmp/test_workflow_repo.db");
        let _ = fs::remove_file(&db_path);

        let db = Database::new(db_path.clone()).unwrap();
        let repo = WorkflowRepository::new(db.get_connection());

        // Create workflow
        let workflow = Workflow::new(
            "test-workflow".to_string(),
            Some("Test description".to_string()),
            None,
        );
        repo.create(&workflow).unwrap();

        // Get by ID
        let found = repo.get_by_id(&workflow.id).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().name, "test-workflow");

        // Get by name
        let found = repo.get_by_name("test-workflow").unwrap();
        assert!(found.is_some());

        // List
        let workflows = repo.list(&WorkflowFilter::default()).unwrap();
        assert_eq!(workflows.len(), 1);

        // Count
        let count = repo.count().unwrap();
        assert_eq!(count, 1);

        // Update
        let update_req = UpdateWorkflowRequest {
            name: Some("updated-workflow".to_string()),
            description: None,
            config: None,
        };
        repo.update(&workflow.id, &update_req).unwrap();

        let updated = repo.get_by_id(&workflow.id).unwrap().unwrap();
        assert_eq!(updated.name, "updated-workflow");

        // Delete
        repo.delete(&workflow.id).unwrap();
        let deleted = repo.get_by_id(&workflow.id).unwrap();
        assert!(deleted.is_none());

        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn test_execution_repository() {
        let db_path = std::path::PathBuf::from("/tmp/test_execution_repo.db");
        let _ = fs::remove_file(&db_path);

        let db = Database::new(db_path.clone()).unwrap();
        let repo = ExecutionRepository::new(db.get_connection());

        // Create execution
        let execution = Execution::new(
            "workflow-id".to_string(),
            "test-workflow".to_string(),
        );
        repo.create(&execution).unwrap();

        // Get by ID
        let found = repo.get_by_id(&execution.id).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().workflow_name, "test-workflow");

        // List
        let executions = repo.list(&ExecutionFilter::default()).unwrap();
        assert_eq!(executions.len(), 1);

        // Update status
        repo.update_status(
            &execution.id,
            ExecutionStatus::Completed,
            None,
            None,
        ).unwrap();

        let updated = repo.get_by_id(&execution.id).unwrap().unwrap();
        assert_eq!(updated.status, ExecutionStatus::Completed);

        // Delete
        repo.delete(&execution.id).unwrap();
        let deleted = repo.get_by_id(&execution.id).unwrap();
        assert!(deleted.is_none());

        let _ = fs::remove_file(&db_path);
    }
}
