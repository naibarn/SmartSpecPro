# Sprint 1.2: LLM Chat with Long Memory

**Duration:** 2 สัปดาห์ (10-14 วันทำงาน)  
**Priority:** Critical  
**Dependencies:** Sprint 1.1 (SQLite per Workspace)  

---

## 🎯 Sprint Goal

สร้างระบบ LLM Chat ที่ใช้ Long Memory ร่วมกับ OpenCode CLI และ Kilo CLI โดยมี Skills สำหรับบังคับให้พูดคุยเป็นเรื่องเดียวกันกับ project ใน workspace และสามารถเพิ่ม/แก้ไข Knowledge ได้

---

## 📋 User Stories

### US-1.2.1: Unified Memory Access
> **As a** developer  
> **I want** LLM Chat, OpenCode CLI, and Kilo CLI to share the same memory  
> **So that** context is consistent across all tools

**Acceptance Criteria:**
- [ ] ทุก tool เข้าถึง memory จาก workspace.db เดียวกัน
- [ ] การเพิ่ม knowledge ใน Chat เห็นได้ใน CLI
- [ ] การเพิ่ม knowledge ใน CLI เห็นได้ใน Chat
- [ ] Memory sync แบบ real-time

### US-1.2.2: Project-Focused Chat
> **As a** developer  
> **I want** chat to focus on my current project  
> **So that** responses are relevant to my work

**Acceptance Criteria:**
- [ ] Chat มี context ของ project structure
- [ ] Chat รู้จัก decisions และ constraints ที่บันทึกไว้
- [ ] Chat สามารถอ้างอิง code files ได้
- [ ] Chat แนะนำตาม patterns ที่เคยใช้

### US-1.2.3: Knowledge Management via Chat
> **As a** developer  
> **I want** to add/edit knowledge through chat  
> **So that** I can capture decisions naturally

**Acceptance Criteria:**
- [ ] พูด "บันทึกว่า..." แล้ว save เป็น knowledge
- [ ] ถาม "เราตัดสินใจอะไรเกี่ยวกับ..." แล้วดึง knowledge มาตอบ
- [ ] แก้ไข knowledge ผ่าน chat ได้
- [ ] มี confirmation dialog ก่อน save

### US-1.2.4: Chat Skills
> **As a** developer  
> **I want** chat to have specialized skills  
> **So that** it can help with different tasks effectively

**Acceptance Criteria:**
- [ ] Skill: Spec - ช่วยเขียน specification
- [ ] Skill: Plan - ช่วยวางแผนงาน
- [ ] Skill: Debug - ช่วย debug
- [ ] Skill: Review - ช่วย review code
- [ ] Skill: Knowledge - จัดการ knowledge

### US-1.2.5: Memory Retrieval
> **As a** developer  
> **I want** relevant memories to be automatically retrieved  
> **So that** chat has the right context

**Acceptance Criteria:**
- [ ] Auto-retrieve related knowledge ก่อนตอบ
- [ ] Show retrieved context ใน UI
- [ ] User สามารถ pin/unpin context ได้
- [ ] Retrieval ใช้ semantic search + keyword

---

## 🏗️ Technical Architecture

### Memory Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           WORKSPACE                                      │
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │  LLM Chat   │    │  OpenCode   │    │  Kilo CLI   │                 │
│  │             │    │    CLI      │    │             │                 │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                 │
│         │                  │                  │                         │
│         └──────────────────┼──────────────────┘                         │
│                            │                                            │
│                            ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Memory Service                                │   │
│  │  ┌─────────────────────────────────────────────────────────────┐│   │
│  │  │                  Retrieval Pipeline                         ││   │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        ││   │
│  │  │  │ Filter  │→ │ Hybrid  │→ │ Rerank  │→ │ Verify  │        ││   │
│  │  │  │ (scope) │  │ Search  │  │ (LLM)   │  │ (fresh) │        ││   │
│  │  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        ││   │
│  │  └─────────────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                            │                                            │
│                            ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    workspace.db                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │ memory_short │  │memory_working│  │ memory_long  │           │   │
│  │  │  (session)   │  │   (pinned)   │  │ (persistent) │           │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
│  │  ┌──────────────┐  ┌──────────────┐                             │   │
│  │  │  knowledge   │  │knowledge_fts │                             │   │
│  │  └──────────────┘  └──────────────┘                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Chat with Skills Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM Chat Page                                    │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        Chat Interface                              │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  Messages Area                                               │  │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐│  │  │
│  │  │  │ [Context Panel]  Retrieved knowledge, pinned items      ││  │  │
│  │  │  └─────────────────────────────────────────────────────────┘│  │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐│  │  │
│  │  │  │ User: ช่วยเขียน spec สำหรับ user authentication        ││  │  │
│  │  │  └─────────────────────────────────────────────────────────┘│  │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐│  │  │
│  │  │  │ Assistant: [Skill: Spec activated]                      ││  │  │
│  │  │  │ Based on your project constraints...                    ││  │  │
│  │  │  └─────────────────────────────────────────────────────────┘│  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  Input Area                                                  │  │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐│  │  │
│  │  │  │ [/spec] [/plan] [/debug] [/review] [/knowledge]         ││  │  │
│  │  │  └─────────────────────────────────────────────────────────┘│  │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐│  │  │
│  │  │  │ Type message... or use /command                    [⏎] ││  │  │
│  │  │  └─────────────────────────────────────────────────────────┘│  │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐│  │  │
│  │  │  │ Model: [Claude 3.5 Sonnet ▼]                            ││  │  │
│  │  │  └─────────────────────────────────────────────────────────┘│  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Sidebar                                                           │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │ Sessions                                                     │  │  │
│  │  │ • General Chat                                               │  │  │
│  │  │ • Spec: User Auth                                            │  │  │
│  │  │ • Debug: API Error                                           │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │ Working Memory (Pinned)                                      │  │  │
│  │  │ 📌 Project uses PostgreSQL                                   │  │  │
│  │  │ 📌 Auth via JWT tokens                                       │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │ Recent Knowledge                                             │  │  │
│  │  │ 💡 Decision: Use REST over GraphQL                           │  │  │
│  │  │ 💡 Constraint: Max 100 API calls/min                         │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Skills System

```typescript
// Skill Definition
interface Skill {
  name: string;
  description: string;
  trigger: SkillTrigger;
  systemPrompt: string;
  requiredContext: ContextType[];
  outputFormat: OutputFormat;
  actions: SkillAction[];
}

// Available Skills
const SKILLS = {
  spec: {
    name: 'Specification',
    trigger: { command: '/spec', keywords: ['spec', 'specification', 'requirements'] },
    systemPrompt: `You are a specification writer...`,
    requiredContext: ['project_structure', 'existing_specs', 'constraints'],
    outputFormat: 'markdown',
    actions: ['save_as_spec', 'create_tasks']
  },
  
  plan: {
    name: 'Planning',
    trigger: { command: '/plan', keywords: ['plan', 'breakdown', 'tasks'] },
    systemPrompt: `You are a project planner...`,
    requiredContext: ['specs', 'existing_tasks', 'timeline'],
    outputFormat: 'task_list',
    actions: ['create_job', 'create_tasks', 'estimate_time']
  },
  
  debug: {
    name: 'Debugging',
    trigger: { command: '/debug', keywords: ['debug', 'error', 'fix', 'bug'] },
    systemPrompt: `You are a debugging expert...`,
    requiredContext: ['error_logs', 'related_code', 'recent_changes'],
    outputFormat: 'analysis',
    actions: ['suggest_fix', 'create_patch']
  },
  
  review: {
    name: 'Code Review',
    trigger: { command: '/review', keywords: ['review', 'check', 'feedback'] },
    systemPrompt: `You are a code reviewer...`,
    requiredContext: ['code_diff', 'coding_standards', 'patterns'],
    outputFormat: 'review_comments',
    actions: ['add_comments', 'suggest_improvements']
  },
  
  knowledge: {
    name: 'Knowledge Management',
    trigger: { command: '/knowledge', keywords: ['remember', 'save', 'note', 'decision'] },
    systemPrompt: `You help manage project knowledge...`,
    requiredContext: ['existing_knowledge'],
    outputFormat: 'knowledge_entry',
    actions: ['save_knowledge', 'update_knowledge', 'search_knowledge']
  },
  
  chat: {
    name: 'General Chat',
    trigger: { command: null, keywords: [] },  // Default
    systemPrompt: `You are a helpful assistant for this project...`,
    requiredContext: ['project_overview', 'recent_context'],
    outputFormat: 'markdown',
    actions: []
  }
};
```

### Memory Save Dialog (Overlay)

```
┌─────────────────────────────────────────────────────────────────┐
│                    💾 Save to Knowledge                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Type: [Decision ▼]                                              │
│                                                                  │
│  Title:                                                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Use JWT for authentication                                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Content:                                                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ We decided to use JWT tokens for user authentication        ││
│  │ because:                                                     ││
│  │ - Stateless authentication                                   ││
│  │ - Easy to scale                                              ││
│  │ - Works well with microservices                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Tags:                                                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [auth] [security] [architecture] [+]                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Related Files:                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ☑ src/auth/jwt.ts                                           ││
│  │ ☑ src/middleware/auth.ts                                    ││
│  │ ☐ src/config/security.ts                                    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │     Cancel      │  │      Save       │                       │
│  └─────────────────┘  └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Implementation Tasks

### Week 1: Memory Service & Retrieval

#### Day 1-2: Memory Service (Rust)

##### Task 1.2.1: Memory Service Module
**File:** `desktop-app/src-tauri/src/memory/mod.rs`

```rust
pub mod service;
pub mod retrieval;
pub mod embedding;
pub mod types;

// Memory Service
pub struct MemoryService {
    db: Arc<WorkspaceDb>,
    embedding_client: EmbeddingClient,
    retrieval_config: RetrievalConfig,
}

impl MemoryService {
    // Short-term memory
    pub async fn save_short_memory(&self, session_id: &str, message: &ChatMessage) -> Result<i64>;
    pub async fn get_session_history(&self, session_id: &str, limit: usize) -> Result<Vec<ChatMessage>>;
    pub async fn cleanup_expired(&self) -> Result<usize>;
    
    // Working memory
    pub async fn pin_to_working(&self, job_id: &str, content: &str, memory_type: &str) -> Result<i64>;
    pub async fn unpin_from_working(&self, id: i64) -> Result<()>;
    pub async fn get_working_memory(&self, job_id: &str) -> Result<Vec<WorkingMemory>>;
    
    // Long-term memory
    pub async fn save_long_memory(&self, memory: LongMemory) -> Result<i64>;
    pub async fn update_long_memory(&self, id: i64, updates: LongMemoryUpdate) -> Result<()>;
    pub async fn search_long_memory(&self, query: &str, limit: usize) -> Result<Vec<LongMemory>>;
    
    // Knowledge
    pub async fn save_knowledge(&self, knowledge: Knowledge) -> Result<i64>;
    pub async fn update_knowledge(&self, id: i64, updates: KnowledgeUpdate) -> Result<()>;
    pub async fn search_knowledge(&self, query: &str, filters: KnowledgeFilter) -> Result<Vec<Knowledge>>;
    pub async fn get_knowledge_by_tags(&self, tags: Vec<String>) -> Result<Vec<Knowledge>>;
}
```

**Deliverables:**
- [ ] MemoryService struct with all methods
- [ ] CRUD operations for all memory types
- [ ] Transaction support
- [ ] Error handling

##### Task 1.2.2: Retrieval Pipeline
**File:** `desktop-app/src-tauri/src/memory/retrieval.rs`

```rust
pub struct RetrievalPipeline {
    memory_service: Arc<MemoryService>,
    config: RetrievalConfig,
}

impl RetrievalPipeline {
    // Main retrieval function
    pub async fn retrieve(&self, query: &str, context: &RetrievalContext) -> Result<RetrievalResult> {
        // Step 1: Filter by scope
        let scoped = self.filter_by_scope(&context).await?;
        
        // Step 2: Hybrid search (keyword + semantic)
        let candidates = self.hybrid_search(&query, &scoped).await?;
        
        // Step 3: Rerank using LLM
        let reranked = self.rerank(&query, &candidates).await?;
        
        // Step 4: Verify freshness
        let verified = self.verify_freshness(&reranked).await?;
        
        Ok(RetrievalResult {
            items: verified,
            total_candidates: candidates.len(),
            retrieval_time_ms: elapsed,
        })
    }
    
    // Filter by scope (job, tags, time range)
    async fn filter_by_scope(&self, context: &RetrievalContext) -> Result<Vec<MemoryItem>>;
    
    // Hybrid search: FTS5 + vector similarity
    async fn hybrid_search(&self, query: &str, items: &[MemoryItem]) -> Result<Vec<ScoredItem>>;
    
    // Rerank using LLM for relevance
    async fn rerank(&self, query: &str, items: &[ScoredItem]) -> Result<Vec<ScoredItem>>;
    
    // Check if information is still valid
    async fn verify_freshness(&self, items: &[ScoredItem]) -> Result<Vec<ScoredItem>>;
}

pub struct RetrievalConfig {
    pub max_candidates: usize,      // 50
    pub max_results: usize,         // 10
    pub min_score: f32,             // 0.5
    pub use_reranking: bool,        // true
    pub freshness_days: u32,        // 30
    pub keyword_weight: f32,        // 0.4
    pub semantic_weight: f32,       // 0.6
}
```

**Deliverables:**
- [ ] RetrievalPipeline implementation
- [ ] Filter, search, rerank, verify steps
- [ ] Configurable weights and thresholds
- [ ] Performance metrics

#### Day 3: Embedding Service

##### Task 1.2.3: Embedding Client
**File:** `desktop-app/src-tauri/src/memory/embedding.rs`

```rust
pub struct EmbeddingClient {
    provider: EmbeddingProvider,
    cache: Arc<EmbeddingCache>,
}

impl EmbeddingClient {
    // Generate embedding for text
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>>;
    
    // Batch embedding
    pub async fn embed_batch(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>>;
    
    // Calculate similarity
    pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32;
    
    // Find similar items
    pub async fn find_similar(&self, embedding: &[f32], candidates: &[EmbeddedItem], top_k: usize) -> Vec<ScoredItem>;
}

pub enum EmbeddingProvider {
    OpenAI { model: String },      // text-embedding-3-small
    Local { model_path: String },  // For offline use
}
```

**Deliverables:**
- [ ] EmbeddingClient with OpenAI support
- [ ] Embedding cache to reduce API calls
- [ ] Cosine similarity calculation
- [ ] Batch processing

#### Day 4-5: Frontend Memory Service

##### Task 1.2.4: TypeScript Memory Service
**File:** `desktop-app/src/services/memoryService.ts`

```typescript
export interface MemoryService {
  // Short-term
  saveMessage(sessionId: string, message: ChatMessage): Promise<number>;
  getSessionHistory(sessionId: string, limit?: number): Promise<ChatMessage[]>;
  
  // Working memory
  pinToWorking(jobId: string, content: string, type: MemoryType): Promise<number>;
  unpinFromWorking(id: number): Promise<void>;
  getWorkingMemory(jobId: string): Promise<WorkingMemory[]>;
  
  // Long-term
  saveLongMemory(memory: LongMemory): Promise<number>;
  searchLongMemory(query: string, limit?: number): Promise<LongMemory[]>;
  
  // Knowledge
  saveKnowledge(knowledge: Knowledge): Promise<number>;
  updateKnowledge(id: number, updates: Partial<Knowledge>): Promise<void>;
  deleteKnowledge(id: number): Promise<void>;
  searchKnowledge(query: string, filters?: KnowledgeFilter): Promise<Knowledge[]>;
  getKnowledgeByTags(tags: string[]): Promise<Knowledge[]>;
  
  // Retrieval
  retrieve(query: string, context?: RetrievalContext): Promise<RetrievalResult>;
}

export interface RetrievalResult {
  items: RetrievedItem[];
  totalCandidates: number;
  retrievalTimeMs: number;
}

export interface RetrievedItem {
  id: number;
  type: 'short' | 'working' | 'long' | 'knowledge';
  content: string;
  score: number;
  metadata: Record<string, any>;
}
```

**Deliverables:**
- [ ] Full TypeScript service
- [ ] Type definitions
- [ ] Caching layer
- [ ] Real-time updates via events

##### Task 1.2.5: Memory Context Provider
**File:** `desktop-app/src/contexts/MemoryContext.tsx`

```typescript
interface MemoryContextValue {
  // State
  workingMemory: WorkingMemory[];
  recentKnowledge: Knowledge[];
  retrievedContext: RetrievedItem[];
  
  // Actions
  pinMemory: (content: string, type: MemoryType) => Promise<void>;
  unpinMemory: (id: number) => Promise<void>;
  saveKnowledge: (knowledge: Knowledge) => Promise<void>;
  searchKnowledge: (query: string) => Promise<Knowledge[]>;
  
  // Retrieval
  retrieveContext: (query: string) => Promise<void>;
  clearContext: () => void;
  
  // UI State
  isRetrieving: boolean;
  showSaveDialog: boolean;
  setShowSaveDialog: (show: boolean) => void;
  pendingKnowledge: Partial<Knowledge> | null;
  setPendingKnowledge: (knowledge: Partial<Knowledge> | null) => void;
}
```

**Deliverables:**
- [ ] MemoryContext provider
- [ ] State management
- [ ] Event listeners for real-time updates
- [ ] Loading states

---

### Week 2: Chat UI & Skills

#### Day 6-7: Chat Components

##### Task 1.2.6: Enhanced Chat Page
**File:** `desktop-app/src/pages/LLMChat.tsx`

**Deliverables:**
- [ ] Redesigned chat layout
- [ ] Context panel (retrieved items)
- [ ] Session sidebar
- [ ] Working memory panel
- [ ] Model selector
- [ ] Skill command buttons

##### Task 1.2.7: Chat Input with Commands
**File:** `desktop-app/src/components/chat/ChatInput.tsx`

```typescript
interface ChatInputProps {
  onSend: (message: string, skill?: Skill) => void;
  onCommandSelect: (command: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Features:
// - Command palette trigger (/)
// - Auto-complete for commands
// - File attachment
// - Code snippet insertion
// - Keyboard shortcuts
```

**Deliverables:**
- [ ] Command palette (/ trigger)
- [ ] Auto-complete
- [ ] Keyboard shortcuts (Ctrl+Enter to send)
- [ ] File/code attachment

##### Task 1.2.8: Message Components
**File:** `desktop-app/src/components/chat/ChatMessage.tsx`

**Deliverables:**
- [ ] User message component
- [ ] Assistant message with markdown
- [ ] Code blocks with syntax highlighting
- [ ] Skill indicator badge
- [ ] Action buttons (copy, save to knowledge)

#### Day 8-9: Skills System

##### Task 1.2.9: Skills Manager (Rust)
**File:** `desktop-app/src-tauri/src/skills/mod.rs`

```rust
pub mod manager;
pub mod prompts;
pub mod actions;

pub struct SkillsManager {
    skills: HashMap<String, Skill>,
    memory_service: Arc<MemoryService>,
    llm_client: Arc<LLMClient>,
}

impl SkillsManager {
    // Detect skill from message
    pub fn detect_skill(&self, message: &str) -> Option<&Skill>;
    
    // Execute skill
    pub async fn execute(&self, skill: &Skill, message: &str, context: &SkillContext) -> Result<SkillResult>;
    
    // Build context for skill
    pub async fn build_context(&self, skill: &Skill, workspace_id: &str) -> Result<SkillContext>;
    
    // Execute skill actions
    pub async fn execute_actions(&self, actions: Vec<SkillAction>, result: &SkillResult) -> Result<()>;
}

pub struct Skill {
    pub name: String,
    pub command: Option<String>,
    pub keywords: Vec<String>,
    pub system_prompt: String,
    pub required_context: Vec<ContextType>,
    pub output_format: OutputFormat,
    pub actions: Vec<SkillAction>,
}

pub enum SkillAction {
    SaveAsSpec { title: String },
    CreateTasks { tasks: Vec<Task> },
    SaveKnowledge { knowledge: Knowledge },
    CreatePatch { file_path: String, diff: String },
    SuggestFix { suggestion: String },
}
```

**Deliverables:**
- [ ] SkillsManager implementation
- [ ] Skill detection (command + keywords)
- [ ] Context building per skill
- [ ] Action execution

##### Task 1.2.10: Skill Prompts
**File:** `desktop-app/src-tauri/src/skills/prompts.rs`

**Deliverables:**
- [ ] System prompts for each skill
- [ ] Context injection templates
- [ ] Output format instructions
- [ ] Few-shot examples

##### Task 1.2.11: TypeScript Skills Service
**File:** `desktop-app/src/services/skillsService.ts`

```typescript
export interface SkillsService {
  // Get available skills
  getSkills(): Skill[];
  
  // Detect skill from input
  detectSkill(input: string): Skill | null;
  
  // Execute skill
  executeSkill(skill: Skill, input: string, context?: SkillContext): Promise<SkillResult>;
  
  // Get skill context
  getSkillContext(skillName: string): Promise<SkillContext>;
}

export interface SkillResult {
  content: string;
  format: 'markdown' | 'task_list' | 'code' | 'analysis';
  actions: SkillAction[];
  suggestedFollowUp?: string[];
}
```

**Deliverables:**
- [ ] Skills service implementation
- [ ] Skill detection logic
- [ ] Context preparation
- [ ] Result handling

#### Day 10: Knowledge Save Dialog

##### Task 1.2.12: Knowledge Save Dialog
**File:** `desktop-app/src/components/knowledge/KnowledgeSaveDialog.tsx`

```typescript
interface KnowledgeSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Partial<Knowledge>;
  onSave: (knowledge: Knowledge) => Promise<void>;
}

// Features:
// - Type selector (decision, constraint, pattern, reference, note)
// - Title input
// - Content editor (markdown)
// - Tags input (autocomplete from existing)
// - Related files selector
// - Preview
```

**Deliverables:**
- [ ] Dialog component
- [ ] Form validation
- [ ] Tag autocomplete
- [ ] File selector
- [ ] Save confirmation

##### Task 1.2.13: Knowledge List Component
**File:** `desktop-app/src/components/knowledge/KnowledgeList.tsx`

**Deliverables:**
- [ ] List view with filters
- [ ] Search box
- [ ] Type/tag filters
- [ ] Edit/delete actions
- [ ] Quick preview

---

### Day 11-12: Integration & Testing

##### Task 1.2.14: Integration with OpenCode/Kilo
**Updates to:** Various files

**Deliverables:**
- [ ] OpenCode CLI uses same MemoryService
- [ ] Kilo CLI uses same MemoryService
- [ ] Knowledge sync across tools
- [ ] Shared retrieval pipeline

##### Task 1.2.15: Unit Tests
**File:** `desktop-app/src-tauri/src/memory/tests/`

**Deliverables:**
- [ ] Memory service tests
- [ ] Retrieval pipeline tests
- [ ] Skills manager tests
- [ ] Embedding tests

##### Task 1.2.16: Integration Tests
**File:** `desktop-app/src/services/__tests__/`

**Deliverables:**
- [ ] Memory service integration tests
- [ ] Skills service tests
- [ ] Chat flow tests
- [ ] Knowledge CRUD tests

---

## 🔧 Configuration

### Retrieval Config

```typescript
const RETRIEVAL_CONFIG = {
  maxCandidates: 50,
  maxResults: 10,
  minScore: 0.5,
  useReranking: true,
  freshnessDays: 30,
  keywordWeight: 0.4,
  semanticWeight: 0.6,
};
```

### Skill Triggers

```typescript
const SKILL_TRIGGERS = {
  spec: {
    command: '/spec',
    keywords: ['spec', 'specification', 'requirements', 'เขียน spec'],
  },
  plan: {
    command: '/plan',
    keywords: ['plan', 'breakdown', 'tasks', 'วางแผน', 'แบ่งงาน'],
  },
  debug: {
    command: '/debug',
    keywords: ['debug', 'error', 'fix', 'bug', 'แก้ bug', 'error'],
  },
  review: {
    command: '/review',
    keywords: ['review', 'check', 'feedback', 'รีวิว'],
  },
  knowledge: {
    command: '/knowledge',
    keywords: ['remember', 'save', 'note', 'decision', 'บันทึก', 'จำไว้'],
  },
};
```

---

## ✅ Definition of Done

- [ ] LLM Chat ใช้ Long Memory จาก workspace.db
- [ ] Memory shared ระหว่าง Chat, OpenCode, Kilo
- [ ] Retrieval pipeline ทำงานถูกต้อง (filter → search → rerank → verify)
- [ ] Skills ทำงานได้ทุกตัว (spec, plan, debug, review, knowledge)
- [ ] Knowledge save dialog ทำงานได้
- [ ] Command palette (/) ทำงานได้
- [ ] Model selector ทำงานได้
- [ ] Unit tests coverage > 80%
- [ ] Integration tests pass

---

## 🚀 Next Sprint

**Sprint 1.3: OpenCode CLI UI**
- OpenCode-like interface
- Keyboard shortcuts
- Inline diff view
- Split pane (Code + Chat)
- Fast command execution

---

## 📝 Notes

### Why Unified Memory?

1. **Consistency** - ทุก tool เห็น context เดียวกัน
2. **No Duplication** - ไม่ต้อง sync ระหว่าง tools
3. **Better Retrieval** - รวม knowledge จากทุกแหล่ง
4. **Natural Workflow** - พูดคุยใน Chat → implement ใน CLI

### Skill Design Principles

1. **Auto-detect** - ไม่ต้องพิมพ์ command ทุกครั้ง
2. **Context-aware** - ดึง context ที่เกี่ยวข้องอัตโนมัติ
3. **Actionable** - มี actions ที่ทำได้หลังจากตอบ
4. **Transparent** - แสดงว่าใช้ skill อะไร, ดึง context อะไร

### Memory Retention Policy

| Memory Type | Retention | Cleanup |
|-------------|-----------|---------|
| Short-term | 7 days | Auto |
| Working | Until unpin | Manual |
| Long-term | Forever | Manual |
| Knowledge | Forever | Manual |
