// Workspace Data Operations - CRUD for workspace data
//
// Provides:
// - Job and Task management
// - Chat session management
// - Knowledge base operations
// - Memory system operations

use anyhow::{Context, Result, anyhow};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use crate::workspace_db::{WorkspaceDbManager, WorkspaceDb};

// ============================================
// Data Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub branch_name: Option<String>,
    pub status: String,
    pub parent_job_id: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub job_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: i32,
    pub order_index: i32,
    pub estimated_minutes: Option<i32>,
    pub actual_minutes: Option<i32>,
    pub assignee: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub job_id: Option<String>,
    pub title: Option<String>,
    pub session_type: String,
    pub model_id: Option<String>,
    pub is_active: bool,
    pub message_count: i32,
    pub token_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls_json: Option<String>,
    pub tool_results_json: Option<String>,
    pub model_id: Option<String>,
    pub tokens_input: Option<i32>,
    pub tokens_output: Option<i32>,
    pub latency_ms: Option<i32>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Knowledge {
    pub id: i64,
    pub knowledge_type: String,
    pub title: String,
    pub content: String,
    pub tags_json: Option<String>,
    pub file_refs_json: Option<String>,
    pub is_active: bool,
    pub source: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryShort {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls_json: Option<String>,
    pub tool_results_json: Option<String>,
    pub tokens_used: Option<i32>,
    pub model_id: Option<String>,
    pub created_at: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryLong {
    pub id: i64,
    pub category: String,
    pub title: String,
    pub content: String,
    pub source: Option<String>,
    pub confidence: f64,
    pub access_count: i32,
    pub last_accessed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ============================================
// Create Request Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateJobRequest {
    pub name: String,
    pub description: Option<String>,
    pub branch_name: Option<String>,
    pub parent_job_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskRequest {
    pub job_id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<i32>,
    pub estimated_minutes: Option<i32>,
    pub assignee: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChatSessionRequest {
    pub job_id: Option<String>,
    pub title: Option<String>,
    pub session_type: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateChatMessageRequest {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls_json: Option<String>,
    pub tool_results_json: Option<String>,
    pub model_id: Option<String>,
    pub tokens_input: Option<i32>,
    pub tokens_output: Option<i32>,
    pub latency_ms: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateKnowledgeRequest {
    pub knowledge_type: String,
    pub title: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
    pub file_refs: Option<Vec<String>>,
    pub source: Option<String>,
    pub created_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMemoryLongRequest {
    pub category: String,
    pub title: String,
    pub content: String,
    pub source: Option<String>,
    pub confidence: Option<f64>,
}

// ============================================
// Workspace Data Operations
// ============================================

pub struct WorkspaceDataOps {
    db_manager: Arc<WorkspaceDbManager>,
}

impl WorkspaceDataOps {
    pub fn new(db_manager: Arc<WorkspaceDbManager>) -> Self {
        Self { db_manager }
    }
    
    // ========================================
    // Job Operations
    // ========================================
    
    pub fn create_job(&self, workspace_id: &str, request: CreateJobRequest) -> Result<Job> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let job_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        
        db.conn.execute(
            "INSERT INTO jobs (id, name, description, branch_name, status, parent_job_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
            params![
                job_id,
                request.name,
                request.description,
                request.branch_name,
                request.parent_job_id,
                now,
                now,
            ],
        ).context("Failed to create job")?;
        
        Ok(Job {
            id: job_id,
            name: request.name,
            description: request.description,
            branch_name: request.branch_name,
            status: "active".to_string(),
            parent_job_id: request.parent_job_id,
            metadata_json: None,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
        })
    }
    
    pub fn get_job(&self, workspace_id: &str, job_id: &str) -> Result<Job> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let job = db.conn.query_row(
            "SELECT id, name, description, branch_name, status, parent_job_id, metadata_json, created_at, updated_at, completed_at
             FROM jobs WHERE id = ?",
            params![job_id],
            |row| {
                Ok(Job {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    branch_name: row.get(3)?,
                    status: row.get(4)?,
                    parent_job_id: row.get(5)?,
                    metadata_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    completed_at: row.get(9)?,
                })
            },
        ).context("Job not found")?;
        
        Ok(job)
    }
    
    pub fn list_jobs(&self, workspace_id: &str, status: Option<&str>) -> Result<Vec<Job>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let query = match status {
            Some(_) => "SELECT id, name, description, branch_name, status, parent_job_id, metadata_json, created_at, updated_at, completed_at
                        FROM jobs WHERE status = ? ORDER BY updated_at DESC",
            None => "SELECT id, name, description, branch_name, status, parent_job_id, metadata_json, created_at, updated_at, completed_at
                     FROM jobs ORDER BY updated_at DESC",
        };
        
        let mut stmt = db.conn.prepare(query).context("Failed to prepare query")?;
        
        let jobs = if let Some(s) = status {
            stmt.query_map(params![s], |row| {
                Ok(Job {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    branch_name: row.get(3)?,
                    status: row.get(4)?,
                    parent_job_id: row.get(5)?,
                    metadata_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    completed_at: row.get(9)?,
                })
            }).context("Failed to query jobs")?
        } else {
            stmt.query_map([], |row| {
                Ok(Job {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    branch_name: row.get(3)?,
                    status: row.get(4)?,
                    parent_job_id: row.get(5)?,
                    metadata_json: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    completed_at: row.get(9)?,
                })
            }).context("Failed to query jobs")?
        };
        
        let mut result = Vec::new();
        for job in jobs {
            result.push(job.context("Failed to read job")?);
        }
        
        Ok(result)
    }
    
    pub fn update_job_status(&self, workspace_id: &str, job_id: &str, status: &str) -> Result<()> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        let completed_at = if status == "completed" { Some(now.clone()) } else { None };
        
        db.conn.execute(
            "UPDATE jobs SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?",
            params![status, now, completed_at, job_id],
        ).context("Failed to update job status")?;
        
        Ok(())
    }
    
    pub fn delete_job(&self, workspace_id: &str, job_id: &str) -> Result<()> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        db.conn.execute("DELETE FROM jobs WHERE id = ?", params![job_id])
            .context("Failed to delete job")?;
        
        Ok(())
    }
    
    // ========================================
    // Task Operations
    // ========================================
    
    pub fn create_task(&self, workspace_id: &str, request: CreateTaskRequest) -> Result<Task> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let task_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        
        // Get next order_index
        let order_index: i32 = db.conn.query_row(
            "SELECT COALESCE(MAX(order_index), 0) + 1 FROM tasks WHERE job_id = ?",
            params![request.job_id],
            |row| row.get(0),
        ).unwrap_or(1);
        
        db.conn.execute(
            "INSERT INTO tasks (id, job_id, title, description, status, priority, order_index, estimated_minutes, assignee, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)",
            params![
                task_id,
                request.job_id,
                request.title,
                request.description,
                request.priority.unwrap_or(0),
                order_index,
                request.estimated_minutes,
                request.assignee,
                now,
                now,
            ],
        ).context("Failed to create task")?;
        
        Ok(Task {
            id: task_id,
            job_id: request.job_id,
            title: request.title,
            description: request.description,
            status: "pending".to_string(),
            priority: request.priority.unwrap_or(0),
            order_index,
            estimated_minutes: request.estimated_minutes,
            actual_minutes: None,
            assignee: request.assignee,
            metadata_json: None,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
        })
    }
    
    pub fn list_tasks(&self, workspace_id: &str, job_id: &str) -> Result<Vec<Task>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let mut stmt = db.conn.prepare(
            "SELECT id, job_id, title, description, status, priority, order_index, estimated_minutes, actual_minutes, assignee, metadata_json, created_at, updated_at, completed_at
             FROM tasks WHERE job_id = ? ORDER BY order_index"
        ).context("Failed to prepare query")?;
        
        let tasks = stmt.query_map(params![job_id], |row| {
            Ok(Task {
                id: row.get(0)?,
                job_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                status: row.get(4)?,
                priority: row.get(5)?,
                order_index: row.get(6)?,
                estimated_minutes: row.get(7)?,
                actual_minutes: row.get(8)?,
                assignee: row.get(9)?,
                metadata_json: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
                completed_at: row.get(13)?,
            })
        }).context("Failed to query tasks")?;
        
        let mut result = Vec::new();
        for task in tasks {
            result.push(task.context("Failed to read task")?);
        }
        
        Ok(result)
    }
    
    pub fn update_task_status(&self, workspace_id: &str, task_id: &str, status: &str) -> Result<()> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        let completed_at = if status == "completed" { Some(now.clone()) } else { None };
        
        db.conn.execute(
            "UPDATE tasks SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?",
            params![status, now, completed_at, task_id],
        ).context("Failed to update task status")?;
        
        Ok(())
    }
    
    // ========================================
    // Chat Session Operations
    // ========================================
    
    pub fn create_chat_session(&self, workspace_id: &str, request: CreateChatSessionRequest) -> Result<ChatSession> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let session_type = request.session_type.unwrap_or_else(|| "general".to_string());
        
        db.conn.execute(
            "INSERT INTO chat_sessions (id, job_id, title, type, model_id, is_active, message_count, token_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, ?)",
            params![
                session_id,
                request.job_id,
                request.title,
                session_type,
                request.model_id,
                now,
                now,
            ],
        ).context("Failed to create chat session")?;
        
        Ok(ChatSession {
            id: session_id,
            job_id: request.job_id,
            title: request.title,
            session_type,
            model_id: request.model_id,
            is_active: true,
            message_count: 0,
            token_count: 0,
            created_at: now.clone(),
            updated_at: now,
        })
    }
    
    pub fn add_chat_message(&self, workspace_id: &str, request: CreateChatMessageRequest) -> Result<ChatMessage> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        
        db.conn.execute(
            "INSERT INTO chat_messages (session_id, role, content, tool_calls_json, tool_results_json, model_id, tokens_input, tokens_output, latency_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                request.session_id,
                request.role,
                request.content,
                request.tool_calls_json,
                request.tool_results_json,
                request.model_id,
                request.tokens_input,
                request.tokens_output,
                request.latency_ms,
                now,
            ],
        ).context("Failed to add chat message")?;
        
        let message_id = db.conn.last_insert_rowid();
        
        // Update session stats
        let tokens = request.tokens_input.unwrap_or(0) + request.tokens_output.unwrap_or(0);
        db.conn.execute(
            "UPDATE chat_sessions SET message_count = message_count + 1, token_count = token_count + ?, updated_at = ? WHERE id = ?",
            params![tokens, now, request.session_id],
        ).context("Failed to update session stats")?;
        
        Ok(ChatMessage {
            id: message_id,
            session_id: request.session_id,
            role: request.role,
            content: request.content,
            tool_calls_json: request.tool_calls_json,
            tool_results_json: request.tool_results_json,
            model_id: request.model_id,
            tokens_input: request.tokens_input,
            tokens_output: request.tokens_output,
            latency_ms: request.latency_ms,
            created_at: now,
        })
    }
    
    pub fn get_chat_messages(&self, workspace_id: &str, session_id: &str, limit: Option<i32>) -> Result<Vec<ChatMessage>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let query = match limit {
            Some(_) => "SELECT id, session_id, role, content, tool_calls_json, tool_results_json, model_id, tokens_input, tokens_output, latency_ms, created_at
                        FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
            None => "SELECT id, session_id, role, content, tool_calls_json, tool_results_json, model_id, tokens_input, tokens_output, latency_ms, created_at
                     FROM chat_messages WHERE session_id = ? ORDER BY created_at",
        };
        
        let mut stmt = db.conn.prepare(query).context("Failed to prepare query")?;
        
        let messages = if let Some(l) = limit {
            stmt.query_map(params![session_id, l], |row| {
                Ok(ChatMessage {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    tool_calls_json: row.get(4)?,
                    tool_results_json: row.get(5)?,
                    model_id: row.get(6)?,
                    tokens_input: row.get(7)?,
                    tokens_output: row.get(8)?,
                    latency_ms: row.get(9)?,
                    created_at: row.get(10)?,
                })
            }).context("Failed to query messages")?
        } else {
            stmt.query_map(params![session_id], |row| {
                Ok(ChatMessage {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    tool_calls_json: row.get(4)?,
                    tool_results_json: row.get(5)?,
                    model_id: row.get(6)?,
                    tokens_input: row.get(7)?,
                    tokens_output: row.get(8)?,
                    latency_ms: row.get(9)?,
                    created_at: row.get(10)?,
                })
            }).context("Failed to query messages")?
        };
        
        let mut result = Vec::new();
        for message in messages {
            result.push(message.context("Failed to read message")?);
        }
        
        // Reverse if limited (we queried DESC)
        if limit.is_some() {
            result.reverse();
        }
        
        Ok(result)
    }
    
    pub fn list_chat_sessions(&self, workspace_id: &str, job_id: Option<&str>) -> Result<Vec<ChatSession>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let query = match job_id {
            Some(_) => "SELECT id, job_id, title, type, model_id, is_active, message_count, token_count, created_at, updated_at
                        FROM chat_sessions WHERE job_id = ? ORDER BY updated_at DESC",
            None => "SELECT id, job_id, title, type, model_id, is_active, message_count, token_count, created_at, updated_at
                     FROM chat_sessions WHERE is_active = 1 ORDER BY updated_at DESC",
        };
        
        let mut stmt = db.conn.prepare(query).context("Failed to prepare query")?;
        
        let sessions = if let Some(jid) = job_id {
            stmt.query_map(params![jid], |row| {
                Ok(ChatSession {
                    id: row.get(0)?,
                    job_id: row.get(1)?,
                    title: row.get(2)?,
                    session_type: row.get(3)?,
                    model_id: row.get(4)?,
                    is_active: row.get(5)?,
                    message_count: row.get(6)?,
                    token_count: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            }).context("Failed to query sessions")?
        } else {
            stmt.query_map([], |row| {
                Ok(ChatSession {
                    id: row.get(0)?,
                    job_id: row.get(1)?,
                    title: row.get(2)?,
                    session_type: row.get(3)?,
                    model_id: row.get(4)?,
                    is_active: row.get(5)?,
                    message_count: row.get(6)?,
                    token_count: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            }).context("Failed to query sessions")?
        };
        
        let mut result = Vec::new();
        for session in sessions {
            result.push(session.context("Failed to read session")?);
        }
        
        Ok(result)
    }
    
    // ========================================
    // Knowledge Operations
    // ========================================
    
    pub fn create_knowledge(&self, workspace_id: &str, request: CreateKnowledgeRequest) -> Result<Knowledge> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        let tags_json = request.tags.map(|t| serde_json::to_string(&t).unwrap_or_default());
        let file_refs_json = request.file_refs.map(|f| serde_json::to_string(&f).unwrap_or_default());
        
        db.conn.execute(
            "INSERT INTO knowledge (type, title, content, tags_json, file_refs_json, is_active, source, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
            params![
                request.knowledge_type,
                request.title,
                request.content,
                tags_json,
                file_refs_json,
                request.source,
                request.created_by,
                now,
                now,
            ],
        ).context("Failed to create knowledge")?;
        
        let knowledge_id = db.conn.last_insert_rowid();
        
        Ok(Knowledge {
            id: knowledge_id,
            knowledge_type: request.knowledge_type,
            title: request.title,
            content: request.content,
            tags_json,
            file_refs_json,
            is_active: true,
            source: request.source,
            created_by: request.created_by,
            created_at: now.clone(),
            updated_at: now,
        })
    }
    
    pub fn search_knowledge(&self, workspace_id: &str, query: &str, limit: Option<i32>) -> Result<Vec<Knowledge>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let limit = limit.unwrap_or(20);
        
        let mut stmt = db.conn.prepare(
            "SELECT k.id, k.type, k.title, k.content, k.tags_json, k.file_refs_json, k.is_active, k.source, k.created_by, k.created_at, k.updated_at
             FROM knowledge k
             JOIN knowledge_fts fts ON k.id = fts.rowid
             WHERE knowledge_fts MATCH ? AND k.is_active = 1
             ORDER BY rank
             LIMIT ?"
        ).context("Failed to prepare search query")?;
        
        let results = stmt.query_map(params![query, limit], |row| {
            Ok(Knowledge {
                id: row.get(0)?,
                knowledge_type: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                tags_json: row.get(4)?,
                file_refs_json: row.get(5)?,
                is_active: row.get(6)?,
                source: row.get(7)?,
                created_by: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        }).context("Failed to search knowledge")?;
        
        let mut result = Vec::new();
        for knowledge in results {
            result.push(knowledge.context("Failed to read knowledge")?);
        }
        
        Ok(result)
    }
    
    pub fn list_knowledge(&self, workspace_id: &str, knowledge_type: Option<&str>) -> Result<Vec<Knowledge>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let query = match knowledge_type {
            Some(_) => "SELECT id, type, title, content, tags_json, file_refs_json, is_active, source, created_by, created_at, updated_at
                        FROM knowledge WHERE type = ? AND is_active = 1 ORDER BY updated_at DESC",
            None => "SELECT id, type, title, content, tags_json, file_refs_json, is_active, source, created_by, created_at, updated_at
                     FROM knowledge WHERE is_active = 1 ORDER BY updated_at DESC",
        };
        
        let mut stmt = db.conn.prepare(query).context("Failed to prepare query")?;
        
        let results = if let Some(kt) = knowledge_type {
            stmt.query_map(params![kt], |row| {
                Ok(Knowledge {
                    id: row.get(0)?,
                    knowledge_type: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    tags_json: row.get(4)?,
                    file_refs_json: row.get(5)?,
                    is_active: row.get(6)?,
                    source: row.get(7)?,
                    created_by: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            }).context("Failed to query knowledge")?
        } else {
            stmt.query_map([], |row| {
                Ok(Knowledge {
                    id: row.get(0)?,
                    knowledge_type: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    tags_json: row.get(4)?,
                    file_refs_json: row.get(5)?,
                    is_active: row.get(6)?,
                    source: row.get(7)?,
                    created_by: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            }).context("Failed to query knowledge")?
        };
        
        let mut result = Vec::new();
        for knowledge in results {
            result.push(knowledge.context("Failed to read knowledge")?);
        }
        
        Ok(result)
    }
    
    // ========================================
    // Memory Operations
    // ========================================
    
    pub fn create_memory_long(&self, workspace_id: &str, request: CreateMemoryLongRequest) -> Result<MemoryLong> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        let confidence = request.confidence.unwrap_or(1.0);
        
        db.conn.execute(
            "INSERT INTO memory_long (category, title, content, source, confidence, access_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
            params![
                request.category,
                request.title,
                request.content,
                request.source,
                confidence,
                now,
                now,
            ],
        ).context("Failed to create long-term memory")?;
        
        let memory_id = db.conn.last_insert_rowid();
        
        Ok(MemoryLong {
            id: memory_id,
            category: request.category,
            title: request.title,
            content: request.content,
            source: request.source,
            confidence,
            access_count: 0,
            last_accessed_at: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }
    
    pub fn get_relevant_memories(&self, workspace_id: &str, category: Option<&str>, limit: Option<i32>) -> Result<Vec<MemoryLong>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let limit = limit.unwrap_or(10);
        
        let query = match category {
            Some(_) => "SELECT id, category, title, content, source, confidence, access_count, last_accessed_at, created_at, updated_at
                        FROM memory_long WHERE category = ? ORDER BY access_count DESC, confidence DESC LIMIT ?",
            None => "SELECT id, category, title, content, source, confidence, access_count, last_accessed_at, created_at, updated_at
                     FROM memory_long ORDER BY access_count DESC, confidence DESC LIMIT ?",
        };
        
        let mut stmt = db.conn.prepare(query).context("Failed to prepare query")?;
        
        let results = if let Some(cat) = category {
            stmt.query_map(params![cat, limit], |row| {
                Ok(MemoryLong {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    source: row.get(4)?,
                    confidence: row.get(5)?,
                    access_count: row.get(6)?,
                    last_accessed_at: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            }).context("Failed to query memories")?
        } else {
            stmt.query_map(params![limit], |row| {
                Ok(MemoryLong {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    source: row.get(4)?,
                    confidence: row.get(5)?,
                    access_count: row.get(6)?,
                    last_accessed_at: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            }).context("Failed to query memories")?
        };
        
        let mut result = Vec::new();
        for memory in results {
            result.push(memory.context("Failed to read memory")?);
        }
        
        Ok(result)
    }
    
    pub fn increment_memory_access(&self, workspace_id: &str, memory_id: i64) -> Result<()> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        
        db.conn.execute(
            "UPDATE memory_long SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?",
            params![now, memory_id],
        ).context("Failed to increment memory access")?;
        
        Ok(())
    }
}
