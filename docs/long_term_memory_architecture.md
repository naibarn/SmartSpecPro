# Long-term Memory Architecture for SmartSpec Kilo CLI

## Overview

ระบบ Long-term Memory ที่เก็บสาระสำคัญของ project และแชร์ข้าม sessions/tabs ทั้งหมดใน workspace เดียวกัน

## Key Requirements

1. **Project-scoped Memory** - Memory เป็นของ project ไม่ใช่ session
2. **Cross-session Sharing** - ทุก tab/session เข้าถึง memory เดียวกัน
3. **Automatic Extraction** - ดึงสาระสำคัญจาก LLM responses อัตโนมัติ
4. **Smart Retrieval** - ดึง relevant memories มาใช้ตาม context
5. **Structured + Semantic** - รองรับทั้ง structured query และ semantic search

## Memory Types

### 1. Decisions (การตัดสินใจ)
- Requirements ที่ตกลงกัน
- Design decisions
- Technology choices
- Constraints และ limitations

### 2. Project Plan (แผนงาน)
- Overall project goals
- Milestones
- Current phase
- Roadmap

### 3. Architecture (โครงสร้าง)
- System architecture
- Component relationships
- Data flow
- API contracts

### 4. Components (Components ที่สร้างไว้)
- Component name และ location
- Purpose และ functionality
- Props/API
- Dependencies

### 5. Tasks (งาน/สถานะ)
- Current tasks
- Completed tasks
- Blocked tasks
- Task dependencies

### 6. Code Knowledge (ความรู้เกี่ยวกับ code)
- Important functions
- Patterns used
- Gotchas และ workarounds
- Performance considerations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Tab 1     │  │   Tab 2     │  │   Tab N                 │ │
│  │ (Session A) │  │ (Session B) │  │ (Session X)             │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                          ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Memory Service (TypeScript)                  │  │
│  │  - getRelevantMemories(query, project_id)                │  │
│  │  - saveMemory(memory, project_id)                        │  │
│  │  - searchMemories(query, filters)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend API (Python)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Memory Manager                          │  │
│  │  - extract_memories(llm_response)                        │  │
│  │  - store_memory(memory)                                  │  │
│  │  - retrieve_relevant(query, project_id)                  │  │
│  │  - consolidate_memories()                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   SQLite Database                         │  │
│  │  ┌─────────────────┐  ┌────────────────────────────────┐ │  │
│  │  │ Structured Data │  │ Vector Embeddings (sqlite-vec) │ │  │
│  │  │ - memories      │  │ - memory_embeddings            │ │  │
│  │  │ - projects      │  │                                │ │  │
│  │  │ - tags          │  │                                │ │  │
│  │  └─────────────────┘  └────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Tables

```sql
-- Projects table
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    workspace_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Memory types enum
-- decision, plan, architecture, component, task, code_knowledge

-- Memories table
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,  -- decision, plan, architecture, component, task, code_knowledge
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSON,  -- flexible metadata per type
    importance INTEGER DEFAULT 5,  -- 1-10 scale
    source TEXT,  -- where this memory came from (session_id, file, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,  -- optional expiration
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Memory embeddings for semantic search (sqlite-vec)
CREATE VIRTUAL TABLE memory_embeddings USING vec0(
    memory_id TEXT PRIMARY KEY,
    embedding FLOAT[1536]  -- OpenAI ada-002 dimension
);

-- Tags for categorization
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

-- Memory-Tag relationship
CREATE TABLE memory_tags (
    memory_id TEXT,
    tag_id INTEGER,
    PRIMARY KEY (memory_id, tag_id),
    FOREIGN KEY (memory_id) REFERENCES memories(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
);

-- Memory relationships (for knowledge graph)
CREATE TABLE memory_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,  -- depends_on, implements, supersedes, relates_to
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES memories(id),
    FOREIGN KEY (target_id) REFERENCES memories(id)
);

-- Indexes
CREATE INDEX idx_memories_project ON memories(project_id);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_importance ON memories(importance DESC);
CREATE INDEX idx_memories_active ON memories(is_active);
CREATE INDEX idx_memory_relations_source ON memory_relations(source_id);
CREATE INDEX idx_memory_relations_target ON memory_relations(target_id);
```

### Memory Metadata Examples

```json
// Decision
{
    "type": "decision",
    "title": "Use React for frontend",
    "content": "ตัดสินใจใช้ React + TypeScript สำหรับ frontend เพราะ...",
    "metadata": {
        "category": "technology",
        "alternatives_considered": ["Vue", "Svelte"],
        "rationale": "Team expertise, ecosystem",
        "reversible": false
    }
}

// Component
{
    "type": "component",
    "title": "KiloCli.tsx",
    "content": "Component หลักสำหรับ CLI interface รองรับ multi-tab...",
    "metadata": {
        "file_path": "src/pages/KiloCli.tsx",
        "props": ["initialCommand"],
        "exports": ["KiloCli"],
        "dependencies": ["kiloCli.ts", "xterm"],
        "functions": ["runInActiveTab", "runInNewTab", "createEmptyTab"]
    }
}

// Task
{
    "type": "task",
    "title": "Implement context management",
    "content": "เพิ่มระบบ context management สำหรับ conversation history",
    "metadata": {
        "status": "completed",
        "priority": "high",
        "assigned_to": null,
        "completed_at": "2025-01-11T10:00:00Z",
        "related_files": ["context_manager.py", "KiloCli.tsx"]
    }
}
```

## Memory Extraction

### Automatic Extraction from LLM Responses

```python
EXTRACTION_PROMPT = """
Analyze the following conversation and extract important information to remember.

Categories to extract:
1. DECISION - Any decisions made (technology, design, requirements)
2. PLAN - Project plans, milestones, roadmap items
3. ARCHITECTURE - System design, component structure
4. COMPONENT - New components created or modified
5. TASK - Tasks mentioned (todo, in-progress, completed)
6. CODE_KNOWLEDGE - Important code patterns, functions, gotchas

For each item, provide:
- type: category name
- title: short descriptive title
- content: detailed description
- importance: 1-10 (10 = critical)
- tags: relevant keywords

Conversation:
{conversation}

Extract memories as JSON array:
"""
```

### Extraction Triggers
1. **End of conversation** - Extract when session ends
2. **Explicit save** - User command "remember this"
3. **Significant events** - File creation, major changes
4. **Periodic** - Every N messages

## Memory Retrieval

### Retrieval Strategy

```python
def get_relevant_memories(query: str, project_id: str, limit: int = 10) -> List[Memory]:
    """
    Hybrid retrieval: Structured + Semantic
    """
    # 1. Semantic search with embeddings
    query_embedding = get_embedding(query)
    semantic_results = vector_search(query_embedding, project_id, limit=limit*2)
    
    # 2. Keyword/structured search
    keywords = extract_keywords(query)
    structured_results = keyword_search(keywords, project_id, limit=limit*2)
    
    # 3. Always include high-importance memories
    important_memories = get_important_memories(project_id, min_importance=8)
    
    # 4. Merge and rank with Reciprocal Rank Fusion
    merged = reciprocal_rank_fusion([
        semantic_results,
        structured_results,
        important_memories
    ])
    
    # 5. Filter by token budget
    return fit_to_token_budget(merged, max_tokens=2000)
```

### Context Injection

```python
def prepare_context_with_memories(
    query: str,
    project_id: str,
    conversation_history: List[Message]
) -> str:
    """
    Prepare context with relevant memories for LLM
    """
    memories = get_relevant_memories(query, project_id)
    
    context = """
## Project Context (Long-term Memory)

### Key Decisions
{decisions}

### Current Plan
{plan}

### Relevant Components
{components}

### Active Tasks
{tasks}

---
Use this context to provide consistent, informed responses.
"""
    
    return context.format(
        decisions=format_memories(memories, type='decision'),
        plan=format_memories(memories, type='plan'),
        components=format_memories(memories, type='component'),
        tasks=format_memories(memories, type='task')
    )
```

## Memory Consolidation

### Periodic Cleanup
- Remove duplicates
- Merge similar memories
- Archive old/inactive memories
- Update importance scores based on usage

### Summarization
- Summarize old detailed memories
- Keep summaries, archive originals
- Maintain memory budget per project

## API Endpoints

```python
# Memory API
POST   /api/memory/extract      # Extract memories from conversation
POST   /api/memory/save         # Save a memory
GET    /api/memory/search       # Search memories
GET    /api/memory/relevant     # Get relevant memories for query
DELETE /api/memory/{id}         # Delete a memory
PUT    /api/memory/{id}         # Update a memory

# Project API
GET    /api/project/{id}/memories  # Get all memories for project
POST   /api/project/{id}/consolidate  # Consolidate project memories
```

## Frontend Integration

### Memory Hook

```typescript
// useProjectMemory.ts
export function useProjectMemory(projectId: string) {
    const [memories, setMemories] = useState<Memory[]>([]);
    
    // Get relevant memories before LLM call
    const getRelevantContext = async (query: string) => {
        const relevant = await memoryService.getRelevant(query, projectId);
        return formatMemoriesForContext(relevant);
    };
    
    // Extract and save memories after LLM response
    const extractAndSave = async (conversation: Message[]) => {
        const extracted = await memoryService.extract(conversation, projectId);
        setMemories(prev => [...prev, ...extracted]);
    };
    
    return { memories, getRelevantContext, extractAndSave };
}
```

### Memory Panel (Optional UI)

```typescript
// MemoryPanel.tsx - Shows project memories
// - List of memories by type
// - Search/filter
// - Manual add/edit/delete
// - Importance indicators
```

## Implementation Plan

### Phase 1: Core Infrastructure
1. SQLite database setup with schema
2. Basic CRUD operations
3. Memory extraction prompt

### Phase 2: Semantic Search
1. Integrate sqlite-vec or use simple embedding storage
2. Embedding generation (OpenAI ada-002)
3. Hybrid search implementation

### Phase 3: Integration
1. Backend API endpoints
2. Frontend service
3. Auto-extraction on conversation end
4. Context injection before LLM calls

### Phase 4: Optimization
1. Memory consolidation
2. Token budget management
3. Caching
4. Memory panel UI (optional)

## Token Budget Management

```python
MAX_MEMORY_TOKENS = 2000  # Reserve for memories in context

def fit_to_token_budget(memories: List[Memory], max_tokens: int) -> List[Memory]:
    """
    Select memories that fit within token budget
    Priority: importance > recency > relevance_score
    """
    result = []
    current_tokens = 0
    
    # Sort by priority
    sorted_memories = sorted(memories, key=lambda m: (
        -m.importance,
        -m.relevance_score,
        -m.updated_at.timestamp()
    ))
    
    for memory in sorted_memories:
        memory_tokens = count_tokens(memory.content)
        if current_tokens + memory_tokens <= max_tokens:
            result.append(memory)
            current_tokens += memory_tokens
        else:
            # Try to fit summary instead
            summary = summarize(memory.content, max_tokens=100)
            summary_tokens = count_tokens(summary)
            if current_tokens + summary_tokens <= max_tokens:
                memory.content = summary
                result.append(memory)
                current_tokens += summary_tokens
    
    return result
```
