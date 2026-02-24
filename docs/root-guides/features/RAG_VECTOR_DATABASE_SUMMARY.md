# RAG & Vector Database System - สรุประบบ

## ✅ สรุปการแก้ไข: ปุ่ม "Open File" → "Download File"

### การเปลี่ยนแปลง:
**ไฟล์:** `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`

#### ก่อน:
```tsx
<a href={sourceUrl} target="_blank" rel="noreferrer">
  <ExternalLink className="mr-1 h-4 w-4" />
  Open file
</a>
```

#### หลัง:
```tsx
<a href={sourceUrl} target="_blank" rel="noreferrer" download>
  <ExternalLink className="mr-1 h-4 w-4" />
  Download File
</a>
```

### ข้อความแก้ไขทั้งหมด:
- ✅ ปุ่มหลัก: "Open file" → "Download File"
- ✅ Error messages: "Try Open file" → "Try Download File"
- ✅ Fallback messages: "Use Open file" → "Use Download File"
- ✅ เพิ่ม attribute `download` เพื่อบังคับให้ดาวน์โหลดไฟล์

---

## 📊 ระบบ RAG และ Vector Database

### สถาปัตยกรรมหลัก

SmartSpecPro ใช้ **ระบบ Hybrid Vector Database** ที่รองรับทั้ง:

```
┌─────────────────────────────────────┐
│   RAG System Architecture           │
└─────────────────────────────────────┘
           │
           ├─► ChromaDB (Development/Memory-based)
           │   └─ all-MiniLM-L6-v2 (384 dimensions)
           │
           └─► pgvector (Production/PostgreSQL)
               └─ OpenAI text-embedding-ada-002 (1536 dimensions)
```

---

## 🔧 Vector Database Systems

### 1. **ChromaDB** (Primary for Development)

**ไฟล์:** `python-backend/app/core/vectordb.py`

#### คุณสมบัติ:
- 🎯 **In-memory & Persistent Storage**
- 🚀 **Fast Development** - ไม่ต้องติดตั้งเพิ่มเติม
- 📦 **Built-in Embedding** - all-MiniLM-L6-v2 (384D)
- 🔍 **Similarity Search** - Cosine similarity (HNSW algorithm)

#### Collections:
```python
EPISODIC_MEMORY_COLLECTION = "episodic_memories"
CODE_SNIPPETS_COLLECTION = "code_snippets"
CONVERSATION_HISTORY_COLLECTION = "conversation_history"
```

#### การใช้งาน:
```python
from app.core.vectordb import get_chroma_client, VectorCollection

# Get client
client = get_chroma_client(ephemeral=False)  # Persistent

# Create collection
collection = VectorCollection(
    name="my_documents",
    client=client,
    metadata={"hnsw:space": "cosine"}
)

# Add documents
collection.add(
    ids=["doc1", "doc2"],
    documents=["Text 1", "Text 2"],
    metadatas=[{"type": "article"}, {"type": "code"}]
)

# Search
results = collection.query(
    query_texts=["search query"],
    n_results=10
)
```

#### Storage Location:
- Default: `~/.smartspec/chroma/`
- Environment: `CHROMA_PERSIST_DIR`

---

### 2. **pgvector** (Production/PostgreSQL Extension)

**ไฟล์:** `python-backend/app/orchestrator/vector_store/pgvector_store.py`

#### คุณสมบัติ:
- 🏢 **Production-Ready** - Scalable, ACID compliant
- 🔐 **Multi-Tenant Support** - tenant_id isolation
- 🎨 **Hybrid Search** - Vector + Full-text
- 📊 **Advanced Indexing** - IVFFlat + GIN indexes

#### Search Modes:
```python
class SearchMode(str, Enum):
    VECTOR = "vector"      # Pure vector similarity
    KEYWORD = "keyword"    # Full-text search (tsvector)
    HYBRID = "hybrid"      # Combined (70% vector + 30% keyword)
```

#### Distance Metrics:
```python
class DistanceMetric(str, Enum):
    COSINE = "cosine"           # Most common
    L2 = "l2"                   # Euclidean distance
    INNER_PRODUCT = "inner_product"
```

#### Database Schema:
```sql
CREATE TABLE vector_documents (
    doc_id UUID PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536),         -- pgvector type
    metadata JSONB DEFAULT '{}',
    tenant_id VARCHAR(255),
    project_id VARCHAR(255),
    doc_type VARCHAR(100),
    source TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', content)
    ) STORED
);

-- Indexes
CREATE INDEX idx_vector_documents_embedding
    ON vector_documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX idx_vector_documents_search
    ON vector_documents
    USING gin(search_vector);
```

#### การใช้งาน:
```python
from app.orchestrator.vector_store import PgVectorStore, SearchMode

# Initialize
store = PgVectorStore(
    connection_string="postgresql://...",
    embedding_dimension=1536,
    distance_metric=DistanceMetric.COSINE
)

await store.initialize()

# Add document
doc = await store.add_document(
    content="Document text",
    embedding=embedding_vector,
    metadata={"category": "tech"},
    tenant_id="tenant-123",
    doc_type="document"
)

# Hybrid search
results = await store.search(
    query_embedding=query_vector,
    query_text="search query",
    mode=SearchMode.HYBRID,
    tenant_id="tenant-123",
    limit=10
)

# Get stats
stats = await store.get_stats(tenant_id="tenant-123")
# {
#   "total_documents": 1234,
#   "by_type": {"document": 800, "code": 434},
#   "storage_type": "pgvector"
# }
```

---

## 🧠 Embedding Models

### 1. **ChromaDB Default** (all-MiniLM-L6-v2)

**ไฟล์:** `python-backend/app/services/embedding_service.py`

```python
class ChromaDefaultEmbedding(EmbeddingProvider):
    """
    - Model: sentence-transformers/all-MiniLM-L6-v2
    - Dimension: 384
    - Speed: Very fast (local)
    - Quality: Good for most use cases
    - Cost: FREE
    """
```

#### คุณสมบัติ:
- ✅ Automatic download & cache
- ✅ No API key required
- ✅ Runs locally
- ✅ Good for development

### 2. **OpenAI Embeddings** (text-embedding-ada-002)

```python
class OpenAIEmbedding(EmbeddingProvider):
    """
    - Model: text-embedding-ada-002
    - Dimension: 1536
    - Speed: API call (fast)
    - Quality: Excellent
    - Cost: ~$0.0001 per 1K tokens
    """
```

#### คุณสมบัติ:
- ✅ State-of-the-art quality
- ✅ Multi-lingual support
- ✅ Consistent results
- ❌ Requires API key
- ❌ Cost per request

---

## 📂 Database Tables (PostgreSQL)

### Library System Tables

```sql
-- Main library items
library_items (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER,
    item_type VARCHAR(32),      -- md, pdf, image, video, etc.
    title TEXT,
    source VARCHAR(255),
    source_url TEXT,
    thumbnail_url TEXT,
    metadata JSONB,
    status VARCHAR(32),         -- indexing, ready, failed
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)

-- Document chunks for RAG
library_chunks (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER,
    library_item_id INTEGER REFERENCES library_items(id),
    chunk_index INTEGER,
    content TEXT,
    content_type VARCHAR(32),
    token_count INTEGER,
    vector_ref_id VARCHAR(128), -- Reference to vector DB
    metadata JSONB,
    created_at TIMESTAMP
)

-- Indexing jobs
library_index_jobs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER,
    library_item_id INTEGER,
    status VARCHAR(32),         -- pending, processing, completed, failed
    chunks_created INTEGER,
    chunks_indexed INTEGER,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
)
```

---

## 🔄 Indexing Pipeline

### Workflow:

```
1. Upload File
   └─► library_items (status: indexing)

2. Create Indexing Job
   └─► library_index_jobs (status: pending)

3. Process Document
   ├─► Extract text
   ├─► Split into chunks
   └─► library_chunks (content)

4. Generate Embeddings
   ├─► ChromaDB/OpenAI
   └─► Store vectors

5. Index in Vector DB
   ├─► ChromaDB: collection.add()
   ├─► pgvector: store.add_document()
   └─► Update library_chunks.vector_ref_id

6. Complete
   ├─► library_items.status = "ready"
   └─► library_index_jobs.status = "completed"
```

---

## 🔍 Search Implementation

### Current System:

**ไฟล์:** `apps/web/server/routers/library.ts`

```typescript
// Query library with hybrid search support
const results = await trpc.library.listDocuments.query({
  scope: "my_library",
  query: "search text",      // Keyword search
  sort: "updated_desc",
  filters: {
    itemType: "md",
    status: "ready"
  }
});
```

### Backend Processing:

```python
# Python backend (when RAG is needed)
async def search_library(
    query: str,
    tenant_id: str,
    limit: int = 10
) -> List[SearchResult]:
    # 1. Generate query embedding
    embedding = await embedding_service.embed_text(query)

    # 2. Search vector database
    if use_pgvector:
        results = await vector_store.search(
            query_embedding=embedding,
            query_text=query,
            mode=SearchMode.HYBRID,
            tenant_id=tenant_id,
            limit=limit
        )
    else:
        results = chroma_collection.query(
            query_embeddings=[embedding],
            n_results=limit,
            where={"tenant_id": tenant_id}
        )

    # 3. Return results
    return results
```

---

## ⚙️ Configuration

### Environment Variables:

```bash
# ChromaDB
CHROMA_PERSIST_DIR=~/.smartspec/chroma
CHROMA_ANONYMIZED_TELEMETRY=false

# pgvector (PostgreSQL)
DATABASE_URL=postgresql://smartspec:pass@localhost:5432/smartspec

# Embedding Models
OPENAI_API_KEY=sk-...                    # For OpenAI embeddings
EMBEDDING_MODEL=text-embedding-ada-002   # or all-MiniLM-L6-v2
EMBEDDING_DIMENSION=1536                 # 384 for MiniLM, 1536 for OpenAI
```

### Switching Between Systems:

```python
# Development: Use ChromaDB
from app.core.vectordb import get_chroma_client
client = get_chroma_client(ephemeral=False)

# Production: Use pgvector
from app.orchestrator.vector_store import PgVectorStore
store = PgVectorStore(
    connection_string=os.getenv("DATABASE_URL"),
    embedding_dimension=1536
)
await store.initialize()
```

---

## 📊 Performance Comparison

| Feature | ChromaDB | pgvector |
|---------|----------|----------|
| **Setup** | Zero-config | Requires PostgreSQL + extension |
| **Speed** | Very fast (in-memory) | Fast (indexed) |
| **Scalability** | Limited (single machine) | Excellent (distributed) |
| **Multi-tenant** | Manual filtering | Built-in isolation |
| **Hybrid Search** | Vector only | Vector + Full-text |
| **Cost** | Free | Database storage costs |
| **Best For** | Development, Small projects | Production, Enterprise |
| **Persistence** | File-based | PostgreSQL ACID |

---

## 🎯 Current Usage

### ตอนนี้ระบบใช้:

1. **ChromaDB** - สำหรับ Episodic Memory และ Development
   - Location: `~/.smartspec/chroma/`
   - Collections: episodic_memories, code_snippets, conversation_history

2. **PostgreSQL Tables** - สำหรับ Library Management
   - Tables: library_items, library_chunks, library_index_jobs
   - Field: `vector_ref_id` เก็บ reference ไป vector DB

3. **pgvector** (Ready but not fully integrated)
   - Code ready: ✅
   - Schema ready: ✅
   - API endpoints: ⏳ (TODO)
   - Migration needed: ⏳

---

## 🚀 Next Steps (Recommendations)

### To Enable Full pgvector Integration:

1. **Enable pgvector extension:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **Migrate to hybrid system:**
   ```python
   # Use pgvector for library search
   # Keep ChromaDB for chat memory
   ```

3. **Update indexing pipeline:**
   ```python
   # Store vectors in both:
   # - ChromaDB (for episodic memory)
   # - pgvector (for library RAG)
   ```

4. **Add RAG query endpoint:**
   ```typescript
   // apps/web/server/routers/library.ts
   router.query("ragSearch", async ({ input }) => {
     // Call Python backend pgvector search
   });
   ```

---

## 📝 Summary

### ระบบปัจจุบัน:
- ✅ **ChromaDB** - Fully implemented (Memory, Snippets, Chat History)
- ✅ **pgvector** - Code ready, awaiting full integration
- ✅ **PostgreSQL Tables** - Library management working
- ✅ **Embedding Models** - MiniLM (dev), OpenAI (prod)
- ⏳ **RAG Search** - Partial (ChromaDB only)

### Architecture:
```
User Query
    │
    ├─► Frontend (React)
    │       └─► tRPC → library.listDocuments
    │
    ├─► Backend (Node.js)
    │       └─► SQL query → library_items
    │
    └─► Python Backend
            ├─► Embedding Service (MiniLM/OpenAI)
            └─► Vector DB
                ├─► ChromaDB (Dev/Memory)
                └─► pgvector (Prod/Library) ⏳
```

### Data Flow:
```
Upload → Extract → Chunk → Embed → Index → Search
  ↓         ↓        ↓       ↓       ↓       ↓
Items   Chunks   library  Vector  Vector  Results
                 _chunks   DB      Query
```

---

## 🔗 Related Files

### Core Files:
- `python-backend/app/core/vectordb.py` - ChromaDB client
- `python-backend/app/orchestrator/vector_store/pgvector_store.py` - pgvector implementation
- `python-backend/app/services/embedding_service.py` - Embedding generation
- `apps/web/drizzle/schema.ts` - Database schema (library_items, library_chunks)
- `apps/web/server/routers/library.ts` - Library API endpoints

### Documentation:
- `specs/library-rag-spec.md` - RAG system specification
- `python-backend/docs/COMPREHENSIVE_PLAN.md` - Implementation plan
- `python-backend/docs/LANGCHAIN_MEMORY_PLAN.md` - Memory system design

---

**สรุป:** ระบบใช้ **ChromaDB** เป็นหลักตอนนี้ สำหรับ development และ episodic memory แต่มี **pgvector** พร้อมใช้งานสำหรับ production library RAG search ที่ scale ได้ดีกว่า
