// Memory Manager - LLM Chat Long Memory System
//
// Provides:
// - Short-term memory (session-based, auto-expires)
// - Working memory (pinned context)
// - Long-term memory (persistent knowledge)
// - Retrieval pipeline with hybrid search

use anyhow::{Context, Result, anyhow};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::workspace_db::WorkspaceDbManager;

// ============================================
// Memory Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortTermMemory {
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
pub struct WorkingMemory {
    pub id: i64,
    pub session_id: Option<String>,
    pub category: String,
    pub title: String,
    pub content: String,
    pub is_pinned: bool,
    pub pin_order: i32,
    pub source: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LongTermMemory {
    pub id: i64,
    pub category: String,
    pub title: String,
    pub content: String,
    pub tags_json: Option<String>,
    pub source: String,
    pub confidence: f64,
    pub access_count: i32,
    pub last_accessed_at: Option<String>,
    pub embedding_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievedContext {
    pub memory_type: String,
    pub id: i64,
    pub title: String,
    pub content: String,
    pub relevance_score: f64,
    pub source: String,
}

// ============================================
// Memory Categories
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MemoryCategory {
    Decision,
    Constraint,
    Pattern,
    Learning,
    Reference,
    ProjectInfo,
    CodeContext,
}

impl MemoryCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryCategory::Decision => "decision",
            MemoryCategory::Constraint => "constraint",
            MemoryCategory::Pattern => "pattern",
            MemoryCategory::Learning => "learning",
            MemoryCategory::Reference => "reference",
            MemoryCategory::ProjectInfo => "project_info",
            MemoryCategory::CodeContext => "code_context",
        }
    }
    
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "decision" => Some(MemoryCategory::Decision),
            "constraint" => Some(MemoryCategory::Constraint),
            "pattern" => Some(MemoryCategory::Pattern),
            "learning" => Some(MemoryCategory::Learning),
            "reference" => Some(MemoryCategory::Reference),
            "project_info" => Some(MemoryCategory::ProjectInfo),
            "code_context" => Some(MemoryCategory::CodeContext),
            _ => None,
        }
    }
}

// ============================================
// Request Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddShortTermMemoryRequest {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub tool_calls_json: Option<String>,
    pub tool_results_json: Option<String>,
    pub tokens_used: Option<i32>,
    pub model_id: Option<String>,
    pub ttl_minutes: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddWorkingMemoryRequest {
    pub session_id: Option<String>,
    pub category: String,
    pub title: String,
    pub content: String,
    pub is_pinned: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddLongTermMemoryRequest {
    pub category: String,
    pub title: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
    pub source: String,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetrievalQuery {
    pub query: String,
    pub categories: Option<Vec<String>>,
    pub limit: Option<i32>,
    pub include_short_term: bool,
    pub include_working: bool,
    pub include_long_term: bool,
    pub min_relevance: Option<f64>,
}

// ============================================
// Memory Manager
// ============================================

pub struct MemoryManager {
    db_manager: Arc<WorkspaceDbManager>,
}

impl MemoryManager {
    pub fn new(db_manager: Arc<WorkspaceDbManager>) -> Self {
        Self { db_manager }
    }
    
    // ========================================
    // Short-Term Memory Operations
    // ========================================
    
    pub fn add_short_term_memory(
        &self,
        workspace_id: &str,
        request: AddShortTermMemoryRequest,
    ) -> Result<ShortTermMemory> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now();
        let created_at = now.to_rfc3339();
        let expires_at = request.ttl_minutes.map(|ttl| {
            (now + chrono::Duration::minutes(ttl as i64)).to_rfc3339()
        });
        
        db.conn.execute(
            "INSERT INTO memory_short (session_id, role, content, tool_calls_json, tool_results_json, tokens_used, model_id, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                request.session_id,
                request.role,
                request.content,
                request.tool_calls_json,
                request.tool_results_json,
                request.tokens_used,
                request.model_id,
                created_at,
                expires_at,
            ],
        ).context("Failed to add short-term memory")?;
        
        let id = db.conn.last_insert_rowid();
        
        Ok(ShortTermMemory {
            id,
            session_id: request.session_id,
            role: request.role,
            content: request.content,
            tool_calls_json: request.tool_calls_json,
            tool_results_json: request.tool_results_json,
            tokens_used: request.tokens_used,
            model_id: request.model_id,
            created_at,
            expires_at,
        })
    }
    
    pub fn get_session_memory(
        &self,
        workspace_id: &str,
        session_id: &str,
        limit: Option<i32>,
    ) -> Result<Vec<ShortTermMemory>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let limit = limit.unwrap_or(100);
        
        let mut stmt = db.conn.prepare(
            "SELECT id, session_id, role, content, tool_calls_json, tool_results_json, tokens_used, model_id, created_at, expires_at
             FROM memory_short
             WHERE session_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
             ORDER BY created_at DESC
             LIMIT ?"
        ).context("Failed to prepare query")?;
        
        let memories = stmt.query_map(params![session_id, limit], |row| {
            Ok(ShortTermMemory {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                tool_calls_json: row.get(4)?,
                tool_results_json: row.get(5)?,
                tokens_used: row.get(6)?,
                model_id: row.get(7)?,
                created_at: row.get(8)?,
                expires_at: row.get(9)?,
            })
        }).context("Failed to query short-term memory")?;
        
        let mut result: Vec<ShortTermMemory> = Vec::new();
        for memory in memories {
            result.push(memory.context("Failed to read memory")?);
        }
        
        // Reverse to get chronological order
        result.reverse();
        
        Ok(result)
    }
    
    pub fn clear_session_memory(&self, workspace_id: &str, session_id: &str) -> Result<usize> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let deleted = db.conn.execute(
            "DELETE FROM memory_short WHERE session_id = ?",
            params![session_id],
        ).context("Failed to clear session memory")?;
        
        Ok(deleted)
    }
    
    // ========================================
    // Working Memory Operations
    // ========================================
    
    pub fn add_working_memory(
        &self,
        workspace_id: &str,
        request: AddWorkingMemoryRequest,
    ) -> Result<WorkingMemory> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        
        // Get next pin order if pinned
        let pin_order: i32 = if request.is_pinned {
            db.conn.query_row(
                "SELECT COALESCE(MAX(pin_order), 0) + 1 FROM memory_working WHERE is_pinned = 1",
                [],
                |row| row.get(0),
            ).unwrap_or(1)
        } else {
            0
        };
        
        db.conn.execute(
            "INSERT INTO memory_working (session_id, category, title, content, is_pinned, pin_order, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                request.session_id,
                request.category,
                request.title,
                request.content,
                request.is_pinned,
                pin_order,
                request.source,
                now,
                now,
            ],
        ).context("Failed to add working memory")?;
        
        let id = db.conn.last_insert_rowid();
        
        Ok(WorkingMemory {
            id,
            session_id: request.session_id,
            category: request.category,
            title: request.title,
            content: request.content,
            is_pinned: request.is_pinned,
            pin_order,
            source: request.source,
            created_at: now.clone(),
            updated_at: now,
        })
    }
    
    pub fn get_pinned_memory(&self, workspace_id: &str) -> Result<Vec<WorkingMemory>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let mut stmt = db.conn.prepare(
            "SELECT id, session_id, category, title, content, is_pinned, pin_order, source, created_at, updated_at
             FROM memory_working
             WHERE is_pinned = 1
             ORDER BY pin_order"
        ).context("Failed to prepare query")?;
        
        let memories = stmt.query_map([], |row| {
            Ok(WorkingMemory {
                id: row.get(0)?,
                session_id: row.get(1)?,
                category: row.get(2)?,
                title: row.get(3)?,
                content: row.get(4)?,
                is_pinned: row.get(5)?,
                pin_order: row.get(6)?,
                source: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        }).context("Failed to query pinned memory")?;
        
        let mut result = Vec::new();
        for memory in memories {
            result.push(memory.context("Failed to read memory")?);
        }
        
        Ok(result)
    }
    
    pub fn pin_memory(&self, workspace_id: &str, memory_id: i64, pin: bool) -> Result<()> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        
        if pin {
            let pin_order: i32 = db.conn.query_row(
                "SELECT COALESCE(MAX(pin_order), 0) + 1 FROM memory_working WHERE is_pinned = 1",
                [],
                |row| row.get(0),
            ).unwrap_or(1);
            
            db.conn.execute(
                "UPDATE memory_working SET is_pinned = 1, pin_order = ?, updated_at = ? WHERE id = ?",
                params![pin_order, now, memory_id],
            ).context("Failed to pin memory")?;
        } else {
            db.conn.execute(
                "UPDATE memory_working SET is_pinned = 0, pin_order = 0, updated_at = ? WHERE id = ?",
                params![now, memory_id],
            ).context("Failed to unpin memory")?;
        }
        
        Ok(())
    }
    
    pub fn reorder_pinned_memory(&self, workspace_id: &str, memory_ids: Vec<i64>) -> Result<()> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        
        for (index, id) in memory_ids.iter().enumerate() {
            db.conn.execute(
                "UPDATE memory_working SET pin_order = ?, updated_at = ? WHERE id = ? AND is_pinned = 1",
                params![index as i32 + 1, now, id],
            ).context("Failed to reorder pinned memory")?;
        }
        
        Ok(())
    }
    
    // ========================================
    // Long-Term Memory Operations
    // ========================================
    
    pub fn add_long_term_memory(
        &self,
        workspace_id: &str,
        request: AddLongTermMemoryRequest,
    ) -> Result<LongTermMemory> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        let tags_json = request.tags.map(|t| serde_json::to_string(&t).unwrap_or_default());
        let confidence = request.confidence.unwrap_or(1.0);
        
        db.conn.execute(
            "INSERT INTO memory_long (category, title, content, tags_json, source, confidence, access_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
            params![
                request.category,
                request.title,
                request.content,
                tags_json,
                request.source,
                confidence,
                now,
                now,
            ],
        ).context("Failed to add long-term memory")?;
        
        let id = db.conn.last_insert_rowid();
        
        Ok(LongTermMemory {
            id,
            category: request.category,
            title: request.title,
            content: request.content,
            tags_json,
            source: request.source,
            confidence,
            access_count: 0,
            last_accessed_at: None,
            embedding_json: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }
    
    pub fn update_long_term_memory(
        &self,
        workspace_id: &str,
        memory_id: i64,
        title: Option<String>,
        content: Option<String>,
        tags: Option<Vec<String>>,
    ) -> Result<()> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let now = chrono::Utc::now().to_rfc3339();
        
        if let Some(t) = title {
            db.conn.execute(
                "UPDATE memory_long SET title = ?, updated_at = ? WHERE id = ?",
                params![t, now, memory_id],
            ).context("Failed to update title")?;
        }
        
        if let Some(c) = content {
            db.conn.execute(
                "UPDATE memory_long SET content = ?, updated_at = ? WHERE id = ?",
                params![c, now, memory_id],
            ).context("Failed to update content")?;
        }
        
        if let Some(t) = tags {
            let tags_json = serde_json::to_string(&t).unwrap_or_default();
            db.conn.execute(
                "UPDATE memory_long SET tags_json = ?, updated_at = ? WHERE id = ?",
                params![tags_json, now, memory_id],
            ).context("Failed to update tags")?;
        }
        
        Ok(())
    }
    
    pub fn get_long_term_memory(
        &self,
        workspace_id: &str,
        category: Option<&str>,
        limit: Option<i32>,
    ) -> Result<Vec<LongTermMemory>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let limit = limit.unwrap_or(50);
        
        let query = match category {
            Some(_) => "SELECT id, category, title, content, tags_json, source, confidence, access_count, last_accessed_at, embedding_json, created_at, updated_at
                        FROM memory_long WHERE category = ? ORDER BY access_count DESC, confidence DESC LIMIT ?",
            None => "SELECT id, category, title, content, tags_json, source, confidence, access_count, last_accessed_at, embedding_json, created_at, updated_at
                     FROM memory_long ORDER BY access_count DESC, confidence DESC LIMIT ?",
        };
        
        let mut stmt = db.conn.prepare(query).context("Failed to prepare query")?;
        
        let memories = if let Some(cat) = category {
            stmt.query_map(params![cat, limit], |row| {
                Ok(LongTermMemory {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    tags_json: row.get(4)?,
                    source: row.get(5)?,
                    confidence: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed_at: row.get(8)?,
                    embedding_json: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            }).context("Failed to query long-term memory")?
        } else {
            stmt.query_map(params![limit], |row| {
                Ok(LongTermMemory {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    tags_json: row.get(4)?,
                    source: row.get(5)?,
                    confidence: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed_at: row.get(8)?,
                    embedding_json: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            }).context("Failed to query long-term memory")?
        };
        
        let mut result = Vec::new();
        for memory in memories {
            result.push(memory.context("Failed to read memory")?);
        }
        
        Ok(result)
    }
    
    // ========================================
    // Retrieval Pipeline
    // ========================================
    
    pub fn retrieve_context(
        &self,
        workspace_id: &str,
        query: RetrievalQuery,
    ) -> Result<Vec<RetrievedContext>> {
        let mut results = Vec::new();
        
        // 1. Search long-term memory using FTS
        if query.include_long_term {
            let long_term = self.search_long_term_memory(
                workspace_id,
                &query.query,
                query.categories.as_deref(),
                query.limit,
            )?;
            
            for memory in long_term {
                results.push(RetrievedContext {
                    memory_type: "long_term".to_string(),
                    id: memory.id,
                    title: memory.title,
                    content: memory.content,
                    relevance_score: memory.confidence,
                    source: memory.source,
                });
            }
        }
        
        // 2. Get working memory (pinned)
        if query.include_working {
            let working = self.get_pinned_memory(workspace_id)?;
            
            for memory in working {
                // Simple keyword matching for relevance
                let relevance = self.calculate_keyword_relevance(&query.query, &memory.content);
                
                if relevance > query.min_relevance.unwrap_or(0.0) {
                    results.push(RetrievedContext {
                        memory_type: "working".to_string(),
                        id: memory.id,
                        title: memory.title,
                        content: memory.content,
                        relevance_score: relevance,
                        source: memory.source,
                    });
                }
            }
        }
        
        // 3. Sort by relevance
        results.sort_by(|a, b| b.relevance_score.partial_cmp(&a.relevance_score).unwrap());
        
        // 4. Limit results
        let limit = query.limit.unwrap_or(10) as usize;
        results.truncate(limit);
        
        // 5. Update access counts for retrieved long-term memories
        for ctx in &results {
            if ctx.memory_type == "long_term" {
                let _ = self.increment_memory_access(workspace_id, ctx.id);
            }
        }
        
        Ok(results)
    }
    
    fn search_long_term_memory(
        &self,
        workspace_id: &str,
        query: &str,
        categories: Option<&[String]>,
        limit: Option<i32>,
    ) -> Result<Vec<LongTermMemory>> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let limit = limit.unwrap_or(20);
        
        // Use FTS5 for full-text search
        let sql = if categories.is_some() && !categories.unwrap().is_empty() {
            format!(
                "SELECT m.id, m.category, m.title, m.content, m.tags_json, m.source, m.confidence, m.access_count, m.last_accessed_at, m.embedding_json, m.created_at, m.updated_at
                 FROM memory_long m
                 JOIN memory_long_fts fts ON m.id = fts.rowid
                 WHERE memory_long_fts MATCH ? AND m.category IN ({})
                 ORDER BY rank
                 LIMIT ?",
                categories.unwrap().iter().map(|_| "?").collect::<Vec<_>>().join(",")
            )
        } else {
            "SELECT m.id, m.category, m.title, m.content, m.tags_json, m.source, m.confidence, m.access_count, m.last_accessed_at, m.embedding_json, m.created_at, m.updated_at
             FROM memory_long m
             JOIN memory_long_fts fts ON m.id = fts.rowid
             WHERE memory_long_fts MATCH ?
             ORDER BY rank
             LIMIT ?".to_string()
        };
        
        let mut stmt = db.conn.prepare(&sql).context("Failed to prepare FTS query")?;
        
        let memories = if let Some(cats) = categories {
            let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(query.to_string())];
            for cat in cats {
                params_vec.push(Box::new(cat.clone()));
            }
            params_vec.push(Box::new(limit));
            
            stmt.query_map(rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())), |row| {
                Ok(LongTermMemory {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    tags_json: row.get(4)?,
                    source: row.get(5)?,
                    confidence: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed_at: row.get(8)?,
                    embedding_json: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            }).context("Failed to search long-term memory")?
        } else {
            stmt.query_map(params![query, limit], |row| {
                Ok(LongTermMemory {
                    id: row.get(0)?,
                    category: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    tags_json: row.get(4)?,
                    source: row.get(5)?,
                    confidence: row.get(6)?,
                    access_count: row.get(7)?,
                    last_accessed_at: row.get(8)?,
                    embedding_json: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            }).context("Failed to search long-term memory")?
        };
        
        let mut result = Vec::new();
        for memory in memories {
            result.push(memory.context("Failed to read memory")?);
        }
        
        Ok(result)
    }
    
    fn calculate_keyword_relevance(&self, query: &str, content: &str) -> f64 {
        let query_words: Vec<&str> = query.to_lowercase().split_whitespace().collect();
        let content_lower = content.to_lowercase();
        
        let mut matches = 0;
        for word in &query_words {
            if content_lower.contains(word) {
                matches += 1;
            }
        }
        
        if query_words.is_empty() {
            return 0.0;
        }
        
        matches as f64 / query_words.len() as f64
    }
    
    fn increment_memory_access(&self, workspace_id: &str, memory_id: i64) -> Result<()> {
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
    
    // ========================================
    // Memory Consolidation
    // ========================================
    
    /// Promote important short-term memories to long-term
    pub fn consolidate_memories(
        &self,
        workspace_id: &str,
        session_id: &str,
        min_importance: f64,
    ) -> Result<Vec<LongTermMemory>> {
        // Get session memories
        let short_term = self.get_session_memory(workspace_id, session_id, None)?;
        
        let mut consolidated = Vec::new();
        
        for memory in short_term {
            // Simple heuristic: longer content is more important
            let importance = (memory.content.len() as f64 / 1000.0).min(1.0);
            
            if importance >= min_importance && memory.role == "assistant" {
                // Extract key information and save to long-term
                let request = AddLongTermMemoryRequest {
                    category: "learning".to_string(),
                    title: format!("Session insight: {}", &memory.content[..50.min(memory.content.len())]),
                    content: memory.content,
                    tags: None,
                    source: "auto_consolidation".to_string(),
                    confidence: Some(importance),
                };
                
                let long_term = self.add_long_term_memory(workspace_id, request)?;
                consolidated.push(long_term);
            }
        }
        
        Ok(consolidated)
    }
    
    // ========================================
    // Cleanup Operations
    // ========================================
    
    pub fn cleanup_expired_memories(&self, workspace_id: &str) -> Result<usize> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let deleted = db.conn.execute(
            "DELETE FROM memory_short WHERE expires_at IS NOT NULL AND expires_at < datetime('now')",
            [],
        ).context("Failed to cleanup expired memories")?;
        
        Ok(deleted)
    }
    
    pub fn get_memory_stats(&self, workspace_id: &str) -> Result<MemoryStats> {
        let workspace_db = self.db_manager.open_workspace(workspace_id)?;
        let db = workspace_db.lock()
            .map_err(|_| anyhow!("Failed to acquire workspace database lock"))?;
        
        let short_term_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM memory_short WHERE expires_at IS NULL OR expires_at > datetime('now')",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let working_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM memory_working",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let pinned_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM memory_working WHERE is_pinned = 1",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let long_term_count: i64 = db.conn.query_row(
            "SELECT COUNT(*) FROM memory_long",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let total_tokens: i64 = db.conn.query_row(
            "SELECT COALESCE(SUM(tokens_used), 0) FROM memory_short",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        Ok(MemoryStats {
            short_term_count,
            working_count,
            pinned_count,
            long_term_count,
            total_tokens,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub short_term_count: i64,
    pub working_count: i64,
    pub pinned_count: i64,
    pub long_term_count: i64,
    pub total_tokens: i64,
}
