# Sprint 1.1: SQLite per Workspace

**Duration:** 1.5 สัปดาห์ (7-10 วันทำงาน)  
**Priority:** Critical (Foundation)  
**Dependencies:** None  

---

## 🎯 Sprint Goal

สร้างระบบ SQLite Database แยกต่อ Workspace เพื่อให้แต่ละ project ทำงานอิสระ รองรับ parallel development และป้องกันข้อมูลสูญหาย

---

## 📋 User Stories

### US-1.1.1: Workspace Database Isolation
> **As a** developer  
> **I want** each workspace to have its own database  
> **So that** my projects don't interfere with each other

**Acceptance Criteria:**
- [ ] แต่ละ workspace มี `workspace.db` แยกกัน
- [ ] ลบ workspace หนึ่งไม่กระทบ workspace อื่น
- [ ] สามารถทำงานหลาย workspace พร้อมกันได้

### US-1.1.2: Database Auto-Creation
> **As a** developer  
> **I want** database to be created automatically when I create a workspace  
> **So that** I don't have to set up manually

**Acceptance Criteria:**
- [ ] สร้าง workspace → สร้าง DB อัตโนมัติ
- [ ] Schema migrations รันอัตโนมัติ
- [ ] มี default data ที่จำเป็น

### US-1.1.3: Data Persistence
> **As a** developer  
> **I want** my data to persist even if container is deleted  
> **So that** I don't lose my work

**Acceptance Criteria:**
- [ ] DB file อยู่นอก container (volume mount)
- [ ] Backup/Restore ได้ง่าย
- [ ] รองรับ WAL mode สำหรับ concurrent access

---

## 🏗️ Technical Architecture

### Directory Structure

```
~/SmartSpec/
├── config/
│   ├── app.db              # App-level config (global settings)
│   └── providers.json      # LLM provider configs
│
├── workspaces/
│   ├── project-alpha/
│   │   ├── workspace.db    # SQLite database for this workspace
│   │   ├── workspace.json  # Workspace metadata
│   │   ├── project/        # Git repository (mounted)
│   │   ├── checkpoints/    # Git stash-like checkpoints
│   │   └── cache/          # Build cache, node_modules links
│   │
│   ├── project-beta/
│   │   ├── workspace.db
│   │   ├── workspace.json
│   │   ├── project/
│   │   └── ...
│   │
│   └── .workspace-index.db # Index of all workspaces (lightweight)
│
└── shared/
    ├── templates/          # Project templates
    └── skills/             # Shared skill definitions
```

### Database Schema

#### 1. App-level Database (`config/app.db`)

```sql
-- Global settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User profile
CREATE TABLE user_profile (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    avatar_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- LLM Provider configurations
CREATE TABLE llm_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'openrouter', 'openai', 'anthropic', 'local'
    api_key_encrypted TEXT,
    base_url TEXT,
    is_enabled BOOLEAN DEFAULT 1,
    priority INTEGER DEFAULT 0,
    config_json TEXT,  -- Additional config
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Available models
CREATE TABLE llm_models (
    id TEXT PRIMARY KEY,
    provider_id TEXT REFERENCES llm_providers(id),
    name TEXT NOT NULL,
    display_name TEXT,
    context_length INTEGER,
    input_price_per_1k REAL,
    output_price_per_1k REAL,
    is_enabled BOOLEAN DEFAULT 1,
    capabilities_json TEXT,  -- ['chat', 'code', 'vision']
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Usage tracking (aggregated)
CREATE TABLE usage_summary (
    id INTEGER PRIMARY KEY,
    date DATE NOT NULL,
    provider_id TEXT,
    model_id TEXT,
    total_requests INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0,
    UNIQUE(date, provider_id, model_id)
);
```

#### 2. Workspace Index (`workspaces/.workspace-index.db`)

```sql
-- Lightweight index of all workspaces
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,  -- UUID
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    git_remote TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME,
    is_active BOOLEAN DEFAULT 1,
    metadata_json TEXT
);

CREATE INDEX idx_workspaces_last_accessed ON workspaces(last_accessed_at DESC);
```

#### 3. Workspace Database (`workspaces/{name}/workspace.db`)

```sql
-- ============================================
-- Workspace Metadata
-- ============================================

CREATE TABLE workspace_info (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Initial data
INSERT INTO workspace_info VALUES 
    ('schema_version', '1'),
    ('created_at', datetime('now')),
    ('workspace_id', ''),  -- Set on creation
    ('workspace_name', '');

-- ============================================
-- Memory System (3 Layers)
-- ============================================

-- Short-term Memory (session-based, auto-cleanup)
CREATE TABLE memory_short (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,  -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    tool_calls_json TEXT,
    tool_results_json TEXT,
    tokens_used INTEGER,
    model_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME  -- Auto-cleanup after expiry
);

CREATE INDEX idx_memory_short_session ON memory_short(session_id, created_at);
CREATE INDEX idx_memory_short_expires ON memory_short(expires_at);

-- Working Memory (pinned per job/task)
CREATE TABLE memory_working (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'context', 'decision', 'file_ref', 'checkpoint'
    content TEXT NOT NULL,
    metadata_json TEXT,
    priority INTEGER DEFAULT 0,  -- Higher = more important
    pinned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memory_working_job ON memory_working(job_id, priority DESC);

-- Long-term Memory (persistent knowledge)
CREATE TABLE memory_long (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,  -- 'decision', 'pattern', 'constraint', 'learning'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,  -- Vector embedding for similarity search
    source TEXT,  -- 'user', 'auto', 'imported'
    confidence REAL DEFAULT 1.0,
    access_count INTEGER DEFAULT 0,
    last_accessed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memory_long_category ON memory_long(category);
CREATE INDEX idx_memory_long_access ON memory_long(access_count DESC);

-- Memory Links (relationships between memories)
CREATE TABLE memory_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,  -- 'short', 'working', 'long'
    source_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    link_type TEXT NOT NULL,  -- 'derived_from', 'related_to', 'supersedes'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_memory_links_source ON memory_links(source_type, source_id);
CREATE INDEX idx_memory_links_target ON memory_links(target_type, target_id);

-- ============================================
-- Knowledge Base
-- ============================================

CREATE TABLE knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,  -- 'decision', 'constraint', 'pattern', 'reference', 'note'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags_json TEXT,  -- ['architecture', 'api', 'database']
    file_refs_json TEXT,  -- Related file paths
    embedding BLOB,
    is_active BOOLEAN DEFAULT 1,
    source TEXT,  -- 'user', 'llm', 'imported'
    created_by TEXT,  -- 'chat', 'opencode', 'kilo', 'manual'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_knowledge_type ON knowledge(type, is_active);
CREATE INDEX idx_knowledge_updated ON knowledge(updated_at DESC);

-- Full-text search for knowledge
CREATE VIRTUAL TABLE knowledge_fts USING fts5(
    title, 
    content, 
    tags_json,
    content='knowledge',
    content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER knowledge_ai AFTER INSERT ON knowledge BEGIN
    INSERT INTO knowledge_fts(rowid, title, content, tags_json)
    VALUES (new.id, new.title, new.content, new.tags_json);
END;

CREATE TRIGGER knowledge_ad AFTER DELETE ON knowledge BEGIN
    INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags_json)
    VALUES ('delete', old.id, old.title, old.content, old.tags_json);
END;

CREATE TRIGGER knowledge_au AFTER UPDATE ON knowledge BEGIN
    INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags_json)
    VALUES ('delete', old.id, old.title, old.content, old.tags_json);
    INSERT INTO knowledge_fts(rowid, title, content, tags_json)
    VALUES (new.id, new.title, new.content, new.tags_json);
END;

-- ============================================
-- Jobs & Tasks
-- ============================================

CREATE TABLE jobs (
    id TEXT PRIMARY KEY,  -- UUID
    name TEXT NOT NULL,
    description TEXT,
    branch_name TEXT,  -- Git branch associated
    status TEXT DEFAULT 'active',  -- 'active', 'paused', 'completed', 'archived'
    parent_job_id TEXT REFERENCES jobs(id),
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE INDEX idx_jobs_status ON jobs(status, updated_at DESC);
CREATE INDEX idx_jobs_branch ON jobs(branch_name);

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES jobs(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'blocked', 'cancelled'
    priority INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    assignee TEXT,  -- 'user', 'opencode', 'kilo'
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE INDEX idx_tasks_job ON tasks(job_id, order_index);
CREATE INDEX idx_tasks_status ON tasks(status);

-- ============================================
-- Chat Sessions
-- ============================================

CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES jobs(id),
    title TEXT,
    type TEXT DEFAULT 'general',  -- 'general', 'spec', 'plan', 'implement', 'debug'
    model_id TEXT,
    is_active BOOLEAN DEFAULT 1,
    message_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_sessions_job ON chat_sessions(job_id);
CREATE INDEX idx_chat_sessions_active ON chat_sessions(is_active, updated_at DESC);

CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls_json TEXT,
    tool_results_json TEXT,
    model_id TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    latency_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);

-- ============================================
-- File Operations & Checkpoints
-- ============================================

CREATE TABLE file_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES jobs(id),
    task_id TEXT REFERENCES tasks(id),
    operation TEXT NOT NULL,  -- 'create', 'modify', 'delete', 'rename'
    file_path TEXT NOT NULL,
    old_content TEXT,
    new_content TEXT,
    diff_text TEXT,
    created_by TEXT,  -- 'user', 'opencode', 'kilo'
    approved BOOLEAN,
    applied_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_file_ops_job ON file_operations(job_id, created_at DESC);
CREATE INDEX idx_file_ops_path ON file_operations(file_path);

CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    job_id TEXT REFERENCES jobs(id),
    name TEXT NOT NULL,
    description TEXT,
    git_commit_hash TEXT,
    git_stash_ref TEXT,
    files_snapshot_json TEXT,  -- List of files and their hashes
    memory_snapshot_json TEXT,  -- Working memory state
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checkpoints_job ON checkpoints(job_id, created_at DESC);

-- ============================================
-- Skills & Commands
-- ============================================

CREATE TABLE skill_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,  -- 'spec', 'plan', 'implement', 'debug', 'chat'
    job_id TEXT REFERENCES jobs(id),
    task_id TEXT REFERENCES tasks(id),
    input_json TEXT,
    output_json TEXT,
    status TEXT,  -- 'running', 'completed', 'failed', 'cancelled'
    model_id TEXT,
    tokens_used INTEGER,
    duration_ms INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

CREATE INDEX idx_skill_exec_job ON skill_executions(job_id, created_at DESC);
CREATE INDEX idx_skill_exec_skill ON skill_executions(skill_name, status);

-- ============================================
-- Usage & Analytics
-- ============================================

CREATE TABLE usage_log (
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

CREATE INDEX idx_usage_date ON usage_log(date DESC);

-- ============================================
-- Settings (workspace-specific)
-- ============================================

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default settings
INSERT INTO settings (key, value) VALUES
    ('default_model', 'claude-3-5-sonnet'),
    ('auto_save_memory', 'true'),
    ('memory_retention_days', '30'),
    ('checkpoint_on_task_complete', 'true'),
    ('max_context_tokens', '100000');
```

---

## 📁 Implementation Tasks

### Day 1-2: Core Database Module

#### Task 1.1.1: Create Database Manager (Rust)
**File:** `desktop-app/src-tauri/src/database/mod.rs`

```rust
// Module structure
pub mod manager;
pub mod schema;
pub mod migrations;
pub mod workspace_db;
pub mod app_db;
```

**Deliverables:**
- [ ] `DatabaseManager` struct with connection pooling
- [ ] Auto-create database on workspace creation
- [ ] WAL mode configuration
- [ ] Connection timeout handling

#### Task 1.1.2: Schema & Migrations
**File:** `desktop-app/src-tauri/src/database/migrations/`

**Deliverables:**
- [ ] Migration framework (versioned SQL files)
- [ ] `V001_initial_schema.sql`
- [ ] Auto-run migrations on DB open
- [ ] Rollback support

#### Task 1.1.3: Workspace Database Operations
**File:** `desktop-app/src-tauri/src/database/workspace_db.rs`

**Deliverables:**
- [ ] `WorkspaceDb` struct
- [ ] CRUD operations for all tables
- [ ] Transaction support
- [ ] Prepared statements cache

---

### Day 3-4: Tauri Commands

#### Task 1.1.4: Database Tauri Commands
**File:** `desktop-app/src-tauri/src/commands/database.rs`

```rust
#[tauri::command]
pub async fn create_workspace_db(workspace_id: String, path: String) -> Result<(), String>;

#[tauri::command]
pub async fn open_workspace_db(workspace_id: String) -> Result<(), String>;

#[tauri::command]
pub async fn close_workspace_db(workspace_id: String) -> Result<(), String>;

#[tauri::command]
pub async fn execute_query(workspace_id: String, query: String, params: Vec<Value>) -> Result<Vec<Row>, String>;

#[tauri::command]
pub async fn get_workspace_stats(workspace_id: String) -> Result<WorkspaceStats, String>;
```

**Deliverables:**
- [ ] All database commands implemented
- [ ] Error handling with meaningful messages
- [ ] Async operations with proper locking

---

### Day 5-6: Frontend Service

#### Task 1.1.5: TypeScript Database Service
**File:** `desktop-app/src/services/databaseService.ts`

```typescript
export interface DatabaseService {
  // Workspace DB
  createWorkspaceDb(workspaceId: string, path: string): Promise<void>;
  openWorkspaceDb(workspaceId: string): Promise<void>;
  closeWorkspaceDb(workspaceId: string): Promise<void>;
  
  // Memory operations
  saveMemory(workspaceId: string, memory: Memory): Promise<number>;
  getMemories(workspaceId: string, filter: MemoryFilter): Promise<Memory[]>;
  searchMemories(workspaceId: string, query: string): Promise<Memory[]>;
  
  // Knowledge operations
  saveKnowledge(workspaceId: string, knowledge: Knowledge): Promise<number>;
  getKnowledge(workspaceId: string, filter: KnowledgeFilter): Promise<Knowledge[]>;
  searchKnowledge(workspaceId: string, query: string): Promise<Knowledge[]>;
  
  // Job operations
  createJob(workspaceId: string, job: Job): Promise<string>;
  updateJob(workspaceId: string, jobId: string, updates: Partial<Job>): Promise<void>;
  getJobs(workspaceId: string, filter: JobFilter): Promise<Job[]>;
  
  // Chat operations
  createChatSession(workspaceId: string, session: ChatSession): Promise<string>;
  saveChatMessage(workspaceId: string, message: ChatMessage): Promise<number>;
  getChatHistory(workspaceId: string, sessionId: string): Promise<ChatMessage[]>;
}
```

**Deliverables:**
- [ ] Full TypeScript service implementation
- [ ] Type definitions for all entities
- [ ] Caching layer for frequent queries
- [ ] Reactive state updates

#### Task 1.1.6: Database Context Provider
**File:** `desktop-app/src/contexts/DatabaseContext.tsx`

**Deliverables:**
- [ ] React context for database state
- [ ] Current workspace DB connection
- [ ] Auto-reconnect on workspace switch
- [ ] Loading/error states

---

### Day 7: Integration & Testing

#### Task 1.1.7: Integration with Workspace Manager
**Updates to:** `desktop-app/src-tauri/src/workspace_manager.rs`

**Deliverables:**
- [ ] Create DB when creating workspace
- [ ] Open DB when opening workspace
- [ ] Close DB when closing workspace
- [ ] Delete DB when deleting workspace

#### Task 1.1.8: Unit Tests
**File:** `desktop-app/src-tauri/src/database/tests/`

**Deliverables:**
- [ ] Test DB creation/deletion
- [ ] Test migrations
- [ ] Test CRUD operations
- [ ] Test concurrent access
- [ ] Test WAL mode

#### Task 1.1.9: Integration Tests
**File:** `desktop-app/src/services/__tests__/databaseService.test.ts`

**Deliverables:**
- [ ] Test workspace lifecycle
- [ ] Test memory operations
- [ ] Test knowledge search
- [ ] Test job/task operations

---

## 📊 Database Size Estimates

| Table | Rows/Workspace | Size/Row | Est. Size |
|-------|----------------|----------|-----------|
| memory_short | 10,000 | 2 KB | 20 MB |
| memory_working | 500 | 1 KB | 0.5 MB |
| memory_long | 1,000 | 2 KB | 2 MB |
| knowledge | 500 | 3 KB | 1.5 MB |
| chat_messages | 50,000 | 1 KB | 50 MB |
| file_operations | 5,000 | 5 KB | 25 MB |
| **Total** | | | **~100 MB** |

---

## 🔧 Configuration

### SQLite Pragmas

```sql
-- Performance optimizations
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB cache
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;  -- 256MB mmap

-- Safety
PRAGMA foreign_keys = ON;
PRAGMA auto_vacuum = INCREMENTAL;
```

### Rust Dependencies

```toml
# Cargo.toml additions
[dependencies]
rusqlite = { version = "0.31", features = ["bundled", "backup", "blob", "functions"] }
r2d2 = "0.8"
r2d2_sqlite = "0.24"
```

---

## ✅ Definition of Done

- [ ] แต่ละ workspace มี SQLite DB แยกกัน
- [ ] สร้าง workspace → สร้าง DB อัตโนมัติ
- [ ] ลบ workspace → ลบ DB ด้วย (หรือ archive)
- [ ] Schema migrations ทำงานถูกต้อง
- [ ] WAL mode enabled สำหรับ concurrent access
- [ ] Full-text search ทำงานได้
- [ ] Unit tests coverage > 80%
- [ ] Integration tests pass
- [ ] Documentation updated

---

## 🚀 Next Sprint

**Sprint 1.2: Unified Memory & Knowledge**
- Memory 3 ชั้น (Short/Working/Long)
- Retrieval Pipeline
- Memory UI Overlay
- Knowledge CRUD UI

---

## 📝 Notes

### Why SQLite per Workspace?

1. **Isolation** - ข้อมูลแต่ละ project แยกกัน
2. **Portability** - ย้าย workspace ได้ง่าย (copy folder)
3. **Performance** - ไม่ต้อง query ข้าม workspace
4. **Backup** - Backup แต่ละ project แยกกัน
5. **Simplicity** - ไม่ต้อง manage central DB server

### Considerations

- **Embedding Storage**: ใช้ BLOB field สำหรับ vector embeddings
- **FTS5**: ใช้ SQLite FTS5 สำหรับ full-text search
- **WAL Mode**: จำเป็นสำหรับ concurrent read/write
- **Vacuum**: ใช้ incremental vacuum เพื่อ reclaim space
