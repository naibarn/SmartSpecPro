# SmartSpecPro Development Plan (Revised)

**เอกสารนี้สรุปแผนงานพัฒนาเพิ่มเติมให้สอดคล้องกับ Local-first Agent Platform Roadmap**

**ปรับปรุงล่าสุด:** เพิ่มข้อกำหนดใหม่ตาม feedback

---

## หลักการสำคัญ (Key Principles)

### 1. SQLite แยกต่อ Workspace
```
~/SmartSpec/workspaces/
├── project-a/
│   ├── project/              # Git repo (source code)
│   ├── workspace.db          # SQLite สำหรับ workspace นี้
│   ├── checkpoints/          # LangGraph checkpoints
│   └── logs/                 # Logs & traces
├── project-b/
│   ├── project/
│   ├── workspace.db          # แยก DB อิสระ
│   └── ...
```

**ประโยชน์:**
- แต่ละ workspace ทำงานอิสระ ไม่กระทบกัน
- Backup/restore ง่าย (copy folder เดียว)
- Debug ง่าย (ดู DB ของ workspace ที่มีปัญหา)
- ลด contention (ไม่มี lock ข้าม workspace)

### 2. Unified Memory & Skills ภายใน Workspace

```
┌─────────────────────────────────────────────────────────────────────┐
│                         WORKSPACE                                    │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  LLM Chat    │  │ OpenCode CLI │  │  Kilo CLI    │               │
│  │              │  │   (หลัก)     │  │  (Option)    │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│         └────────────────┼─────────────────┘                        │
│                          │                                           │
│                          ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              Unified Memory & Knowledge Layer                    ││
│  │                                                                  ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              ││
│  │  │Short Memory │  │Working Set  │  │Long Memory  │              ││
│  │  │(in-context) │  │(pinned/job) │  │(persistent) │              ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘              ││
│  │                                                                  ││
│  │  ┌─────────────────────────────────────────────────────────────┐││
│  │  │                    Skills & Knowledge                        │││
│  │  │  • Project context (spec/plan/tasks)                        │││
│  │  │  • Decisions & constraints                                  │││
│  │  │  • Known bugs & fixes                                       │││
│  │  │  • Code patterns & conventions                              │││
│  │  └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
│                          │                                           │
│                          ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    workspace.db (SQLite)                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              Docker Sandbox (Terminal)                           ││
│  │              • Run/build/test project                            ││
│  │              • Isolated environment                              ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

**ทุก interface ใช้ร่วมกัน:**
- **Memory:** Short/Working/Long memory เดียวกัน
- **Knowledge:** Project context, decisions, constraints
- **Skills:** Guidance สำหรับแต่ละ task type

### 3. OpenCode CLI เป็นหลัก

**OpenCode CLI (หลัก):**
- UI ต้องเร็วและสะดวกเหมือน OpenCode จริง
- รองรับ keyboard shortcuts
- Fast file navigation
- Inline diff view
- Quick command execution

**Kilo Code CLI (Option):**
- ให้ user เลือกใช้ได้ถ้าต้องการ
- ใช้ memory/knowledge เดียวกัน

### 4. Local Testing (ทดสอบทั้งระบบ)

```bash
# คำสั่งเดียว run ทั้งระบบ
./dev.sh start

# หรือ
docker-compose -f docker-compose.dev.yml up
```

---

## สถานะปัจจุบัน vs Roadmap

### สิ่งที่มีอยู่แล้ว ✅

| Component | สถานะ | หมายเหตุ |
|-----------|--------|----------|
| Desktop App (Tauri) | ✅ มีแล้ว | Dashboard, LLM Chat, CLI, Docker Sandbox |
| LLM Gateway | ✅ มีแล้ว | python-backend + credit + rate limiting |
| Docker Sandbox | ✅ มีแล้ว | sandbox-images, workspace manager |
| Git Workflow | ✅ มีแล้ว | git_workflow.rs |
| Orchestrator | ✅ มีแล้ว | LangGraph-based |
| Memory Service | ✅ บางส่วน | ต้องปรับเป็น per-workspace |
| Quality Gates | ✅ บางส่วน | quality_gates, approval_gates |

### สิ่งที่ต้องพัฒนาเพิ่ม 🔧

| Component | ความสำคัญ | หมายเหตุ |
|-----------|-----------|----------|
| **SQLite per Workspace** | สูงมาก | แยก DB ต่อ workspace |
| **Unified Memory Layer** | สูงมาก | ใช้ร่วมกันทุก interface |
| **Unified Skills/Knowledge** | สูงมาก | LLM Chat + CLI ใช้ร่วมกัน |
| **OpenCode CLI UI** | สูงมาก | เร็วและสะดวกเหมือน OpenCode จริง |
| **LLM Chat Skills** | สูง | บังคับพูดคุยเรื่อง project |
| **Local Testing Setup** | สูง | ทดสอบทั้งระบบด้วยคำสั่งเดียว |
| **Working Set (pinned per job)** | สูง | - |
| **1 Tab = 1 Job = 1 Branch** | สูง | - |

---

## Phase 1: MVP Local-first Agent Platform (4-6 สัปดาห์)

### Sprint 1.1: Workspace-based SQLite (1.5 สัปดาห์)

#### 1.1.1 Workspace Database Schema
**ไฟล์ที่ต้องสร้าง/แก้ไข:**
- `desktop-app/src-tauri/src/workspace_db.rs` (ใหม่)

**Schema (workspace.db):**
```sql
-- Workspace metadata
CREATE TABLE workspace_meta (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_path TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Memory entries (Short/Working/Long unified)
CREATE TABLE memory_entries (
    id TEXT PRIMARY KEY,
    layer TEXT NOT NULL, -- 'short', 'working', 'long'
    job_id TEXT,         -- NULL for workspace-wide
    branch TEXT,
    type TEXT NOT NULL,  -- decision/requirement/constraint/todo/bug/fix/snippet/reference
    content TEXT NOT NULL,
    embedding BLOB,
    source TEXT,         -- chat_id, file@commit, tool_output, cli_session
    source_interface TEXT, -- 'llm_chat', 'opencode_cli', 'kilo_cli', 'terminal'
    provenance TEXT,
    importance INTEGER DEFAULT 5,
    ttl INTEGER,         -- seconds, NULL = permanent
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skills & Knowledge (shared across interfaces)
CREATE TABLE knowledge (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL, -- 'project_context', 'decision', 'constraint', 'bug_fix', 'pattern', 'convention'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,           -- JSON array
    auto_inject BOOLEAN DEFAULT FALSE, -- auto inject to prompts
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Skills (guidance per task type)
CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    task_type TEXT NOT NULL, -- 'spec', 'plan', 'implement', 'debug', 'chat', 'review'
    system_prompt TEXT NOT NULL,
    constraints TEXT,    -- JSON array
    examples TEXT,       -- JSON array
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Jobs (1 job = 1 branch = 1 thread)
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    branch TEXT NOT NULL,
    thread_id TEXT,      -- LangGraph thread_id
    status TEXT DEFAULT 'active', -- active/paused/completed/abandoned
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Checkpoints (linked to commits)
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL, -- LangGraph checkpoint
    commit_hash TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Indexes
CREATE INDEX idx_memory_layer ON memory_entries(layer);
CREATE INDEX idx_memory_job ON memory_entries(job_id);
CREATE INDEX idx_memory_type ON memory_entries(type);
CREATE INDEX idx_memory_source_interface ON memory_entries(source_interface);
CREATE INDEX idx_knowledge_category ON knowledge(category);
CREATE INDEX idx_skills_task_type ON skills(task_type);
CREATE INDEX idx_jobs_status ON jobs(status);
```

**Tasks:**
- [ ] สร้าง workspace_db.rs สำหรับ Tauri backend
- [ ] Implement DB initialization per workspace
- [ ] Migration scripts
- [ ] Unit tests

#### 1.1.2 Workspace Manager Update
**ไฟล์ที่ต้องแก้ไข:**
- `desktop-app/src-tauri/src/workspace_manager.rs` (ปรับปรุง)

**Features:**
- Create workspace → auto create workspace.db
- Open workspace → connect to workspace.db
- Delete workspace → cleanup all files including DB

**Tasks:**
- [ ] Update workspace creation to include DB
- [ ] Add DB connection management
- [ ] Add workspace cleanup

---

### Sprint 1.2: Unified Memory & Knowledge Layer (2 สัปดาห์)

#### 1.2.1 Memory Service (Per Workspace)
**ไฟล์ที่ต้องสร้าง:**
- `desktop-app/src-tauri/src/memory_service.rs` (ใหม่)
- `desktop-app/src/services/memoryService.ts` (ใหม่)

**Features:**
- Single-writer queue per workspace
- WAL mode + busy_timeout
- Track source_interface (llm_chat/opencode_cli/kilo_cli/terminal)

**API:**
```typescript
interface MemoryService {
  // Save memory (from any interface)
  saveMemory(entry: MemoryEntry): Promise<string>;
  
  // Get memories for current job/workspace
  getMemories(filter: MemoryFilter): Promise<MemoryEntry[]>;
  
  // Pin to working set
  pinToWorkingSet(memoryId: string, jobId: string): Promise<void>;
  
  // Get working set for job
  getWorkingSet(jobId: string): Promise<MemoryEntry[]>;
  
  // Search memories
  searchMemories(query: string, filter?: MemoryFilter): Promise<MemoryEntry[]>;
}

interface MemoryEntry {
  id: string;
  layer: 'short' | 'working' | 'long';
  jobId?: string;
  type: 'decision' | 'requirement' | 'constraint' | 'todo' | 'bug' | 'fix' | 'snippet' | 'reference';
  content: string;
  sourceInterface: 'llm_chat' | 'opencode_cli' | 'kilo_cli' | 'terminal';
  source?: string;
  importance?: number;
}
```

**Tasks:**
- [ ] สร้าง memory_service.rs
- [ ] สร้าง memoryService.ts
- [ ] Implement single-writer queue
- [ ] Add source_interface tracking

#### 1.2.2 Knowledge Service (Shared)
**ไฟล์ที่ต้องสร้าง:**
- `desktop-app/src-tauri/src/knowledge_service.rs` (ใหม่)
- `desktop-app/src/services/knowledgeService.ts` (ใหม่)

**Features:**
- CRUD for knowledge entries
- Auto-inject to prompts (if flagged)
- Tag-based filtering

**API:**
```typescript
interface KnowledgeService {
  // Add knowledge
  addKnowledge(entry: KnowledgeEntry): Promise<string>;
  
  // Update knowledge
  updateKnowledge(id: string, updates: Partial<KnowledgeEntry>): Promise<void>;
  
  // Get knowledge by category
  getKnowledge(category?: string): Promise<KnowledgeEntry[]>;
  
  // Get auto-inject knowledge
  getAutoInjectKnowledge(): Promise<KnowledgeEntry[]>;
  
  // Search knowledge
  searchKnowledge(query: string): Promise<KnowledgeEntry[]>;
}

interface KnowledgeEntry {
  id: string;
  category: 'project_context' | 'decision' | 'constraint' | 'bug_fix' | 'pattern' | 'convention';
  title: string;
  content: string;
  tags?: string[];
  autoInject?: boolean;
}
```

**Tasks:**
- [ ] สร้าง knowledge_service.rs
- [ ] สร้าง knowledgeService.ts
- [ ] Implement auto-inject logic
- [ ] Add UI for knowledge management

#### 1.2.3 Skills Service
**ไฟล์ที่ต้องสร้าง:**
- `desktop-app/src-tauri/src/skills_service.rs` (ใหม่)
- `desktop-app/src/services/skillsService.ts` (ใหม่)

**Features:**
- Load skill by task type
- Inject skill + knowledge into prompt
- Support for LLM Chat, OpenCode CLI, Kilo CLI

**Default Skills:**
```typescript
const defaultSkills = [
  {
    name: 'Chat Skill',
    taskType: 'chat',
    systemPrompt: `You are a helpful assistant for the SmartSpec project.
    
IMPORTANT: Focus ONLY on this project's context:
- Refer to the project's spec.md, plan.md, tasks.md
- Use the project's conventions and patterns
- Remember previous decisions and constraints
- Do not suggest solutions outside the project scope

When answering:
1. Check if the question relates to this project
2. Reference relevant project files/decisions
3. Stay consistent with existing code patterns`,
    constraints: [
      'Only discuss topics related to this workspace/project',
      'Reference project files when relevant',
      'Follow established conventions'
    ]
  },
  {
    name: 'Spec Skill',
    taskType: 'spec',
    systemPrompt: `You are creating/updating a specification document...`,
    // ...
  },
  {
    name: 'Plan Skill',
    taskType: 'plan',
    systemPrompt: `You are creating/updating a development plan...`,
    // ...
  },
  {
    name: 'Implement Skill',
    taskType: 'implement',
    systemPrompt: `You are implementing code based on the spec and plan...`,
    // ...
  },
  {
    name: 'Debug Skill',
    taskType: 'debug',
    systemPrompt: `You are debugging an issue...`,
    // ...
  }
];
```

**Tasks:**
- [ ] สร้าง skills_service.rs
- [ ] สร้าง skillsService.ts
- [ ] Create default skills
- [ ] Implement skill injection into prompts

#### 1.2.4 Retrieval Pipeline
**ไฟล์ที่ต้องสร้าง:**
- `desktop-app/src-tauri/src/retrieval_service.rs` (ใหม่)

**Pipeline:**
```
1. Metadata Filter
   - workspace (automatic - from current workspace.db)
   - job_id (if current job)
   - type (optional)
   - source_interface (optional)
   
2. Hybrid Search
   - FTS (keyword)
   - Semantic (embedding)
   - Combined scoring
   
3. Verify/Rerank
   - Top 20 → Top 5
   - Conflict detection with spec/plan
```

**Tasks:**
- [ ] Implement metadata filter
- [ ] Implement FTS search
- [ ] Integrate embedding service
- [ ] Implement verify/rerank

---

### Sprint 1.3: LLM Chat with Skills (1 สัปดาห์)

#### 1.3.1 LLM Chat Enhancement
**ไฟล์ที่ต้องแก้ไข:**
- `desktop-app/src/pages/LLMChat.tsx` (ปรับปรุง)
- `desktop-app/src/services/llmOpenAI.ts` (ปรับปรุง)

**Features:**
- Auto-load Chat Skill for current workspace
- Auto-inject knowledge (project context, decisions, constraints)
- Memory save overlay (confirm before saving)
- Show current workspace context

**UI Changes:**
```
┌─────────────────────────────────────────────────────────────────┐
│ LLM Chat                                    [Workspace: my-app] │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Context: spec.md, plan.md loaded                            │ │
│ │ Knowledge: 5 items auto-injected                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Chat messages...]                                               │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Type your message...                          [Send] [Save] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Model: Claude Sonnet ▼]  [Skill: Chat ▼]  [Knowledge: 5 ▼]    │
└─────────────────────────────────────────────────────────────────┘
```

**Tasks:**
- [ ] Add workspace context display
- [ ] Integrate skills service
- [ ] Auto-inject knowledge
- [ ] Add memory save overlay
- [ ] Add skill selector

#### 1.3.2 Memory Save Overlay
**ไฟล์ที่ต้องสร้าง:**
- `desktop-app/src/components/MemorySaveOverlay.tsx` (ใหม่)

**Features:**
- Popup when important content detected
- Select type (decision/constraint/etc.)
- Choose "Pin to Working Set" or "Save to Long Memory"
- Manual select text → save

**Tasks:**
- [ ] สร้าง MemorySaveOverlay component
- [ ] Implement auto-detection logic
- [ ] Add manual selection save

---

### Sprint 1.4: OpenCode CLI UI (1.5 สัปดาห์)

#### 1.4.1 OpenCode CLI Page Enhancement
**ไฟล์ที่ต้องแก้ไข:**
- `desktop-app/src/pages/OpenCodeCli.tsx` (สร้างใหม่หรือปรับปรุง)

**Requirements (เหมือน OpenCode จริง):**
- **Fast file navigation:** Ctrl+P quick open
- **Keyboard shortcuts:** Ctrl+Enter send, Ctrl+K clear, etc.
- **Inline diff view:** Show changes before apply
- **Split pane:** Code + Chat side by side
- **Command palette:** / commands
- **File tree:** Quick access to project files
- **Terminal integration:** Run commands in sandbox

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ OpenCode CLI                                    [Workspace: my-app]     │
├──────────────────────────────────┬──────────────────────────────────────┤
│ File Tree          │ Code View                                          │
│ ├── src/           │ ┌────────────────────────────────────────────────┐ │
│ │   ├── App.tsx    │ │ // App.tsx                                     │ │
│ │   ├── index.ts   │ │ import React from 'react';                     │ │
│ │   └── ...        │ │ ...                                            │ │
│ ├── package.json   │ │                                                │ │
│ └── ...            │ └────────────────────────────────────────────────┘ │
│                    │                                                     │
│ [Ctrl+P: Quick Open]                                                    │
├──────────────────────────────────┴──────────────────────────────────────┤
│ Chat                                                                     │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ > /implement Add user authentication                                │ │
│ │                                                                      │ │
│ │ I'll implement user authentication. Let me check the spec first... │ │
│ │                                                                      │ │
│ │ [Diff Preview]                                                       │ │
│ │ + import { auth } from './auth';                                    │ │
│ │ + const user = await auth.getUser();                                │ │
│ │                                                                      │ │
│ │ [Apply] [Reject] [Edit]                                             │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Type command or message...                    [Ctrl+Enter to send] │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ [Model: Claude Sonnet ▼]  [Skill: Implement ▼]  [/spec /plan /tasks]   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Keyboard Shortcuts:**
| Shortcut | Action |
|----------|--------|
| Ctrl+P | Quick file open |
| Ctrl+Enter | Send message |
| Ctrl+K | Clear chat |
| Ctrl+/ | Toggle command palette |
| Ctrl+S | Save current file |
| Ctrl+Z | Undo last change |
| Ctrl+Shift+Z | Redo |
| Escape | Cancel current operation |

**Tasks:**
- [ ] สร้าง/ปรับปรุง OpenCodeCli.tsx
- [ ] Implement file tree component
- [ ] Implement code view with syntax highlighting
- [ ] Implement diff preview
- [ ] Add keyboard shortcuts
- [ ] Integrate with memory/knowledge services
- [ ] Add command palette (/ commands)

#### 1.4.2 OpenCode Commands
**ไฟล์ที่ต้องสร้าง:**
- `desktop-app/src/commands/` (folder ใหม่)

**Commands:**
```typescript
const commands = {
  '/spec': {
    description: 'Create/update spec.md',
    skill: 'spec',
    handler: async (args) => { /* ... */ }
  },
  '/plan': {
    description: 'Create/update plan.md',
    skill: 'plan',
    handler: async (args) => { /* ... */ }
  },
  '/tasks': {
    description: 'Generate tasks.md from plan',
    skill: 'plan',
    handler: async (args) => { /* ... */ }
  },
  '/implement': {
    description: 'Implement code from spec/tasks',
    skill: 'implement',
    handler: async (args) => { /* ... */ }
  },
  '/debug': {
    description: 'Debug an issue',
    skill: 'debug',
    handler: async (args) => { /* ... */ }
  },
  '/test': {
    description: 'Run tests',
    handler: async (args) => { /* ... */ }
  },
  '/commit': {
    description: 'Commit changes',
    handler: async (args) => { /* ... */ }
  }
};
```

**Tasks:**
- [ ] Create command parser
- [ ] Implement each command
- [ ] Integrate with skills
- [ ] Add command autocomplete

---

### Sprint 1.5: Local Testing Setup (1 สัปดาห์)

#### 1.5.1 Development Docker Compose
**ไฟล์ที่ต้องสร้าง:**
- `docker-compose.dev.yml` (ใหม่)
- `dev.sh` (ใหม่)

**docker-compose.dev.yml:**
```yaml
version: '3.8'

services:
  # Infrastructure
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: smartspec
      POSTGRES_PASSWORD: smartspec_dev
      POSTGRES_DB: smartspec
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U smartspec"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Backend Services
  python-backend:
    build:
      context: ./python-backend
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgresql://smartspec:smartspec_dev@postgres:5432/smartspec
      - REDIS_URL=redis://redis:6379
      - DEBUG=true
      - SMARTSPEC_PROXY_TOKEN=dev_token_12345
    ports:
      - "8000:8000"
    volumes:
      - ./python-backend:/app
      - python_cache:/root/.cache
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  control-plane:
    build:
      context: ./control-plane
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgresql://smartspec:smartspec_dev@postgres:5432/smartspec
      - DEBUG=true
    ports:
      - "7070:7070"
    depends_on:
      postgres:
        condition: service_healthy

  # Web Frontend
  smartspec-web:
    build:
      context: ./SmartSpecWeb
      dockerfile: Dockerfile
    environment:
      - VITE_API_URL=http://localhost:8000
      - VITE_CONTROL_PLANE_URL=http://localhost:7070
    ports:
      - "3000:3000"
    volumes:
      - ./SmartSpecWeb:/app
      - web_node_modules:/app/node_modules
    depends_on:
      - python-backend
      - control-plane
    command: pnpm dev --host 0.0.0.0

  # Docker Status (optional)
  docker-status:
    build:
      context: ./docker-status
      dockerfile: Dockerfile
    environment:
      - OAUTH_SERVER_URL=http://python-backend:8000
    ports:
      - "3001:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    depends_on:
      - python-backend

  # Nginx (optional - for testing production-like setup)
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
    depends_on:
      - smartspec-web
      - python-backend
    profiles:
      - production

volumes:
  postgres_data:
  python_cache:
  web_node_modules:
```

**dev.sh:**
```bash
#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Commands
case "$1" in
    start)
        log_info "Starting SmartSpecPro development environment..."
        docker-compose -f docker-compose.dev.yml up -d
        
        log_info "Waiting for services to be ready..."
        sleep 5
        
        log_info "Services started:"
        echo "  - SmartSpec Web:    http://localhost:3000"
        echo "  - Python Backend:   http://localhost:8000"
        echo "  - Control Plane:    http://localhost:7070"
        echo "  - Docker Status:    http://localhost:3001"
        echo "  - PostgreSQL:       localhost:5432"
        echo "  - Redis:            localhost:6379"
        
        log_info "To view logs: ./dev.sh logs"
        ;;
    
    stop)
        log_info "Stopping SmartSpecPro development environment..."
        docker-compose -f docker-compose.dev.yml down
        ;;
    
    restart)
        log_info "Restarting SmartSpecPro development environment..."
        docker-compose -f docker-compose.dev.yml restart
        ;;
    
    logs)
        if [ -z "$2" ]; then
            docker-compose -f docker-compose.dev.yml logs -f
        else
            docker-compose -f docker-compose.dev.yml logs -f "$2"
        fi
        ;;
    
    status)
        docker-compose -f docker-compose.dev.yml ps
        ;;
    
    clean)
        log_warn "This will remove all containers and volumes. Continue? (y/n)"
        read -r answer
        if [ "$answer" = "y" ]; then
            docker-compose -f docker-compose.dev.yml down -v
            log_info "Cleaned up all containers and volumes"
        fi
        ;;
    
    build)
        log_info "Building all services..."
        docker-compose -f docker-compose.dev.yml build
        ;;
    
    test)
        log_info "Running tests..."
        
        # Python backend tests
        log_info "Running Python backend tests..."
        docker-compose -f docker-compose.dev.yml exec python-backend pytest -v
        
        # Web tests
        log_info "Running SmartSpec Web tests..."
        docker-compose -f docker-compose.dev.yml exec smartspec-web pnpm test
        
        log_info "All tests completed!"
        ;;
    
    desktop)
        log_info "Starting desktop app in development mode..."
        cd desktop-app && pnpm tauri dev
        ;;
    
    *)
        echo "SmartSpecPro Development Script"
        echo ""
        echo "Usage: ./dev.sh <command>"
        echo ""
        echo "Commands:"
        echo "  start     Start all services"
        echo "  stop      Stop all services"
        echo "  restart   Restart all services"
        echo "  logs      View logs (optionally specify service)"
        echo "  status    Show service status"
        echo "  clean     Remove all containers and volumes"
        echo "  build     Build all services"
        echo "  test      Run all tests"
        echo "  desktop   Start desktop app in dev mode"
        ;;
esac
```

**Tasks:**
- [ ] สร้าง docker-compose.dev.yml
- [ ] สร้าง dev.sh script
- [ ] ทดสอบ start/stop/restart
- [ ] ทดสอบ logs/status
- [ ] ทดสอบ test command

#### 1.5.2 Environment Setup Script
**ไฟล์ที่ต้องสร้าง:**
- `setup.sh` (ใหม่)

**Features:**
- Check prerequisites (Docker, Node.js, Rust)
- Create .env files from templates
- Initialize databases
- Build sandbox images

**Tasks:**
- [ ] สร้าง setup.sh
- [ ] Add prerequisite checks
- [ ] Add .env generation
- [ ] Add database initialization

---

## ไฟล์สรุป: สิ่งที่ต้องสร้างใหม่

### Desktop App (Tauri/Rust)

| ไฟล์ | คำอธิบาย | Sprint |
|------|----------|--------|
| `workspace_db.rs` | SQLite per workspace | 1.1 |
| `memory_service.rs` | Unified memory service | 1.2 |
| `knowledge_service.rs` | Shared knowledge | 1.2 |
| `skills_service.rs` | Skills management | 1.2 |
| `retrieval_service.rs` | Retrieval pipeline | 1.2 |

### Desktop App (React/TypeScript)

| ไฟล์ | คำอธิบาย | Sprint |
|------|----------|--------|
| `memoryService.ts` | Memory service client | 1.2 |
| `knowledgeService.ts` | Knowledge service client | 1.2 |
| `skillsService.ts` | Skills service client | 1.2 |
| `MemorySaveOverlay.tsx` | Memory save UI | 1.3 |
| `OpenCodeCli.tsx` | OpenCode CLI page | 1.4 |
| `commands/*.ts` | CLI commands | 1.4 |

### Root Level

| ไฟล์ | คำอธิบาย | Sprint |
|------|----------|--------|
| `docker-compose.dev.yml` | Development compose | 1.5 |
| `dev.sh` | Development script | 1.5 |
| `setup.sh` | Setup script | 1.5 |

---

## Definition of Done (DoD)

### Phase 1 MVP
- [ ] SQLite แยกต่อ workspace ทำงานได้
- [ ] LLM Chat, OpenCode CLI, Kilo CLI ใช้ memory/knowledge ร่วมกัน
- [ ] Skills ทำงานได้ทุก interface
- [ ] OpenCode CLI UI เร็วและสะดวก
- [ ] `./dev.sh start` รันทั้งระบบได้
- [ ] Restart container แล้ว "งานไม่หาย"
- [ ] Resume job ต่อได้จาก checkpoint

---

## Quick Start (หลังพัฒนาเสร็จ)

```bash
# 1. Clone repository
git clone https://github.com/naibarn/SmartSpecPro.git
cd SmartSpecPro

# 2. Setup environment
./setup.sh

# 3. Start all services
./dev.sh start

# 4. Access services
# - Web: http://localhost:3000
# - API: http://localhost:8000
# - Docker Status: http://localhost:3001

# 5. Start desktop app (optional)
./dev.sh desktop

# 6. Run tests
./dev.sh test

# 7. View logs
./dev.sh logs

# 8. Stop services
./dev.sh stop
```
