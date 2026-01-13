-- ============================================
-- SmartSpecPro Workspace Database Schema
-- Version: 1
-- ============================================

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================
-- Workspace Metadata
-- ============================================

CREATE TABLE IF NOT EXISTS workspace_info (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ============================================
-- Memory System (3 Layers)
-- ============================================

-- Short-term Memory (session-based, auto-cleanup)
CREATE TABLE IF NOT EXISTS memory_short (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls_json TEXT,
    tool_results_json TEXT,
    tokens_used INTEGER,
    model_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_memory_short_session ON memory_short(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_short_expires ON memory_short(expires_at);

-- Working Memory (pinned per job/task)
CREATE TABLE IF NOT EXISTS memory_working (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('context', 'decision', 'file_ref', 'checkpoint', 'note')),
    content TEXT NOT NULL,
    metadata_json TEXT,
    priority INTEGER DEFAULT 0,
    pinned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memory_working_job ON memory_working(job_id, priority DESC);

-- Long-term Memory (persistent knowledge)
CREATE TABLE IF NOT EXISTS memory_long (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('decision', 'pattern', 'constraint', 'learning', 'reference')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    source TEXT CHECK(source IN ('user', 'auto', 'imported')),
    confidence REAL DEFAULT 1.0,
    access_count INTEGER DEFAULT 0,
    last_accessed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memory_long_category ON memory_long(category);
CREATE INDEX IF NOT EXISTS idx_memory_long_access ON memory_long(access_count DESC);

-- Memory Links
CREATE TABLE IF NOT EXISTS memory_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK(source_type IN ('short', 'working', 'long')),
    source_id INTEGER NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('short', 'working', 'long')),
    target_id INTEGER NOT NULL,
    link_type TEXT NOT NULL CHECK(link_type IN ('derived_from', 'related_to', 'supersedes')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memory_links_source ON memory_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links(target_type, target_id);

-- ============================================
-- Knowledge Base
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('decision', 'constraint', 'pattern', 'reference', 'note')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags_json TEXT,
    file_refs_json TEXT,
    embedding BLOB,
    is_active BOOLEAN DEFAULT 1,
    source TEXT CHECK(source IN ('user', 'llm', 'imported')),
    created_by TEXT CHECK(created_by IN ('chat', 'opencode', 'kilo', 'manual')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge(type, is_active);
CREATE INDEX IF NOT EXISTS idx_knowledge_updated ON knowledge(updated_at DESC);

-- Full-text search for knowledge
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
    title, 
    content, 
    tags_json,
    content='knowledge',
    content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
    INSERT INTO knowledge_fts(rowid, title, content, tags_json)
    VALUES (new.id, new.title, new.content, new.tags_json);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
    INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags_json)
    VALUES ('delete', old.id, old.title, old.content, old.tags_json);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
    INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags_json)
    VALUES ('delete', old.id, old.title, old.content, old.tags_json);
    INSERT INTO knowledge_fts(rowid, title, content, tags_json)
    VALUES (new.id, new.title, new.content, new.tags_json);
END;

-- ============================================
-- Jobs & Tasks
-- ============================================

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    branch_name TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'archived')),
    parent_job_id TEXT REFERENCES jobs(id),
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_branch ON jobs(branch_name);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')),
    priority INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    assignee TEXT CHECK(assignee IN ('user', 'opencode', 'kilo')),
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_tasks_job ON tasks(job_id, order_index);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- ============================================
-- Chat Sessions
-- ============================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    title TEXT,
    type TEXT DEFAULT 'general' CHECK(type IN ('general', 'spec', 'plan', 'implement', 'debug', 'review')),
    model_id TEXT,
    is_active BOOLEAN DEFAULT 1,
    message_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_job ON chat_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions(is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    tool_calls_json TEXT,
    tool_results_json TEXT,
    model_id TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    latency_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);

-- ============================================
-- File Operations & Checkpoints
-- ============================================

CREATE TABLE IF NOT EXISTS file_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    operation TEXT NOT NULL CHECK(operation IN ('create', 'modify', 'delete', 'rename')),
    file_path TEXT NOT NULL,
    old_content TEXT,
    new_content TEXT,
    diff_text TEXT,
    created_by TEXT CHECK(created_by IN ('user', 'opencode', 'kilo')),
    approved BOOLEAN,
    applied_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_ops_job ON file_operations(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_ops_path ON file_operations(file_path);

CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    git_commit_hash TEXT,
    git_stash_ref TEXT,
    files_snapshot_json TEXT,
    memory_snapshot_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_job ON checkpoints(job_id, created_at DESC);

-- ============================================
-- Skills & Commands
-- ============================================

CREATE TABLE IF NOT EXISTS skill_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL CHECK(skill_name IN ('spec', 'plan', 'implement', 'debug', 'chat', 'review', 'test')),
    job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    input_json TEXT,
    output_json TEXT,
    status TEXT CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
    model_id TEXT,
    tokens_used INTEGER,
    duration_ms INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_skill_exec_job ON skill_executions(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skill_exec_skill ON skill_executions(skill_name, status);

-- ============================================
-- Usage & Analytics
-- ============================================

CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    hour INTEGER,
    model_id TEXT,
    skill_name TEXT,
    request_count INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    UNIQUE(date, hour, model_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_log(date DESC);

-- ============================================
-- Settings (workspace-specific)
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Insert Default Data
-- ============================================

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('default_model', 'claude-3-5-sonnet'),
    ('auto_save_memory', 'true'),
    ('memory_retention_days', '30'),
    ('checkpoint_on_task_complete', 'true'),
    ('max_context_tokens', '100000'),
    ('schema_version', '1');
