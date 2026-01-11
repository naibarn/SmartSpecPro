# Long-term Memory Research for AI Coding Assistants

## ปัญหาหลัก (Conversational Amnesia)
- LLM มี context window จำกัด
- ยิ่ง context ใหญ่ยิ่งสูญเสีย signal
- ไม่สามารถจำข้อมูลข้าม sessions ได้

## 4 Design Patterns หลัก

### 1. MemGPT (Operating System Paradigm)
**แนวคิด:** จัดการ memory เหมือน OS จัดการ RAM/Disk

**Architecture:**
- **Primary Context (RAM):** Fixed-size prompt ที่ LLM เห็น
  - Static system prompt
  - Dynamic working context (scratchpad)
  - FIFO message buffer
- **External Context (Disk):**
  - Recall Storage: searchable log database
  - Archival Storage: vector-based semantic search

**Memory Formation:**
- Triggered by memory pressure (70% threshold)
- LLM self-manages: decide what to keep/discard/store
- Write-back cycle like OS interrupt

**Tools:** Letta framework, Chroma/LanceDB/pgvector

**Pros:** Elegant abstraction, infinite memory illusion
**Cons:** Single agent handles everything, unstructured data

### 2. OpenAI Memory Management
**แนวคิด:** Product-first, seamless personalization

**Architecture:**
- **Saved Memories:** Facts collected from all chats (key-value)
- **Chat History Reference:** RAG-style semantic search

**Memory Formation:**
- Automatic extraction by LLM
- Explicit user commands ("Remember that...")
- Prepended to every session

**Pros:** Zero effort, seamless
**Cons:** Less control, privacy concerns

### 3. Claude Memory Management
**แนวคิด:** User control, project-scoped

**Architecture:**
- Project-based isolation
- User-controlled memory
- Workspace tool approach

**Pros:** Privacy, control
**Cons:** More manual effort

### 4. AI Toolkits (Mem0, Zep, LangChain)
**แนวคิด:** Building blocks for custom systems

#### Mem0
- Universal memory layer
- Auto-extraction and consolidation
- Multi-tier: episodic, semantic, procedural
- Graph-based relationships

#### Zep
- Temporal Knowledge Graph
- Entity extraction
- Relationship tracking
- Sub-200ms latency

#### LangChain Memory
- Short-term: AgentState, messages
- Long-term: Vector stores, entity memory

## Key Insights สำหรับ SmartSpec

### Memory Types ที่ต้องการ
1. **Decisions/Requirements** - การตัดสินใจ, สเปก
2. **Project Plan** - แผนงานภาพรวม
3. **Components/Architecture** - โครงสร้าง, components ที่สร้างไว้
4. **Task Status** - งานที่ทำค้าง, สถานะ
5. **Code Knowledge** - ฟังก์ชัน, API ที่มี

### Retrieval Strategy
1. **Semantic Search** - ค้นหาด้วย embedding
2. **Structured Query** - ค้นหาตาม type, project, date
3. **Relationship Graph** - ความสัมพันธ์ระหว่าง entities

### Storage Options
1. **SQLite** - Structured data, local, fast
2. **Vector DB** - Semantic search (sqlite-vec, Chroma)
3. **Knowledge Graph** - Relationships

## Recommended Architecture for SmartSpec

### Multi-tier Memory
```
┌─────────────────────────────────────────────┐
│           Working Memory (RAM)              │
│  - Current conversation                     │
│  - Recent context (sliding window)          │
└─────────────────────────────────────────────┘
                    ↓ ↑
┌─────────────────────────────────────────────┐
│          Long-term Memory (SQLite)          │
│  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Structured  │  │ Vector Embeddings   │  │
│  │ - Decisions │  │ - Semantic search   │  │
│  │ - Plans     │  │ - Similar memories  │  │
│  │ - Components│  │                     │  │
│  │ - Tasks     │  │                     │  │
│  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Memory Extraction
- **Auto-extract** from LLM responses
- **Explicit save** via commands
- **Periodic consolidation** (summarize old memories)

### Memory Retrieval
- **On-demand** based on current query
- **Pre-fetch** relevant context before LLM call
- **Relevance scoring** to limit context size
