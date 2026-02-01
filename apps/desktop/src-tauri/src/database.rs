use anyhow::{Context, Result};
use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Database manager for SmartSpec Pro
/// Handles SQLite connection and initialization
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    /// Create a new database instance
    /// 
    /// # Arguments
    /// * `db_path` - Path to the SQLite database file
    /// 
    /// # Returns
    /// * `Result<Self>` - Database instance or error
    pub fn new(db_path: PathBuf) -> Result<Self> {
        // Create parent directory if it doesn't exist
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .context("Failed to create database directory")?;
        }

        // Open database connection
        let conn = Connection::open(&db_path)
            .context(format!("Failed to open database at {:?}", db_path))?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])
            .context("Failed to enable foreign keys")?;

        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };

        // Initialize schema
        db.init_schema()?;

        Ok(db)
    }

    /// Initialize database schema
    /// Creates all tables and indexes if they don't exist
    fn init_schema(&self) -> Result<()> {
        let schema = include_str!("../schema.sql");
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(schema)
            .context("Failed to initialize database schema")?;

        Ok(())
    }

    /// Get a clone of the connection Arc for use in other modules
    pub fn get_connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    /// Execute a query and return the number of affected rows
    pub fn execute(&self, sql: &str, params: &[&dyn rusqlite::ToSql]) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(sql, params)
            .context("Failed to execute query")?;
        Ok(rows)
    }

    /// Get database version from metadata
    pub fn get_version(&self) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let version: String = conn.query_row(
            "SELECT value FROM metadata WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        ).context("Failed to get database version")?;
        Ok(version)
    }

    /// Check if database is healthy
    pub fn health_check(&self) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        
        // Try to execute a simple query
        let result: i32 = conn.query_row("SELECT 1", [], |row| row.get(0))
            .context("Database health check failed")?;
        
        Ok(result == 1)
    }

    /// Get database statistics
    pub fn get_stats(&self) -> Result<DatabaseStats> {
        let conn = self.conn.lock().unwrap();

        let workflow_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM workflows",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        let execution_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM executions",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        let config_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM configs",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        Ok(DatabaseStats {
            workflow_count,
            execution_count,
            config_count,
        })
    }

    /// Close database connection
    pub fn close(self) -> Result<()> {
        // Connection will be closed when dropped
        Ok(())
    }
}

/// Database statistics
#[derive(Debug, Clone)]
pub struct DatabaseStats {
    pub workflow_count: i64,
    pub execution_count: i64,
    pub config_count: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_database_creation() {
        let db_path = PathBuf::from("/tmp/test_smartspec.db");
        
        // Clean up if exists
        let _ = fs::remove_file(&db_path);

        // Create database
        let db = Database::new(db_path.clone()).unwrap();

        // Check version
        let version = db.get_version().unwrap();
        assert_eq!(version, "1.0.0");

        // Health check
        assert!(db.health_check().unwrap());

        // Get stats
        let stats = db.get_stats().unwrap();
        assert_eq!(stats.workflow_count, 0);
        assert_eq!(stats.execution_count, 0);
        assert_eq!(stats.config_count, 0);

        // Clean up
        let _ = fs::remove_file(&db_path);
    }

    #[test]
    fn test_database_persistence() {
        let db_path = PathBuf::from("/tmp/test_smartspec_persist.db");
        
        // Clean up if exists
        let _ = fs::remove_file(&db_path);

        // Create database and insert data
        {
            let db = Database::new(db_path.clone()).unwrap();
            db.execute(
                "INSERT INTO workflows (id, name, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                &[&"test-id", &"test-workflow", &"1.0.0", &"1234567890", &"1234567890"],
            ).unwrap();
        }

        // Reopen database and check data
        {
            let db = Database::new(db_path.clone()).unwrap();
            let stats = db.get_stats().unwrap();
            assert_eq!(stats.workflow_count, 1);
        }

        // Clean up
        let _ = fs::remove_file(&db_path);
    }
}
