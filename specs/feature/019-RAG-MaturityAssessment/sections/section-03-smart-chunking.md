I now have all the context needed. Let me produce the section content.

# Section 03: Smart Chunking Engine

## Implementation Status: COMPLETE

**Implemented:** 2026-02-22
**Tests:** 42 section tests (107 total RAG tests), all passing
**Commit:** (pending)

## Overview

This section implements a new smart chunking engine (`SmartChunker`) in the Python backend that replaces the legacy fixed-character chunking with token-based, strategy-aware splitting. It introduces the parent-child chunk pattern (small child chunks for precise retrieval, larger parent chunks for LLM context), adds the required schema columns, integrates into the existing indexing pipeline, and creates a Celery batch re-indexing task.

**Depends on:** section-01-acl-schema-and-scopes (for `allowed_scopes` column on `libraryChunks` and `LibraryChunk` model, and the `LibraryItem.allowed_scopes` field that chunks inherit from)

**Blocks:** section-04-hybrid-search (which needs properly chunked documents with parent-child relationships to function)

---

## Background and Motivation

The current chunking in the codebase is split across two locations:

1. **Node.js `vectorize.ts`** (`/home/dev/projects/SmartSpecPro/apps/web/server/services/vectorize.ts`) -- uses fixed 2000-character windows with 200-character overlap via the `chunkDocument()` function. This is used for real-time document embedding from the web app.

2. **Python `library_indexing_service.py`** (`/home/dev/projects/SmartSpecPro/python-backend/app/services/library_indexing_service.py`) -- uses the `chunk_text_content()` function with fixed 500-character windows and 80-character overlap. This is used in the asynchronous indexing pipeline.

Both approaches have the same problems:
- They split on character boundaries, often cutting mid-sentence or mid-paragraph
- They use character counts instead of tokens, making behavior unpredictable for LLM context windows
- They apply the same strategy regardless of content type (markdown, code, prose)
- Research shows smaller chunks (400-512 tokens) outperform 800+ token chunks for retrieval precision

The parent-child chunk pattern addresses the precision vs. context tradeoff: small child chunks (400 tokens) are indexed for precise retrieval, while larger parent chunks (1024 tokens) are stored for context expansion when sending to the LLM.

### Embedding Dimension Standardization

The Python-side `EmbeddingService` (in `/home/dev/projects/SmartSpecPro/python-backend/app/services/embedding_service.py`) uses OpenAI embeddings at 1536 dimensions. The Node.js `vectorize.ts` uses Cloudflare's `bge-base-en-v1.5` at 768 dimensions. During re-indexing, all documents will be re-embedded through the Python service, standardizing on 1536-dim vectors.

---

## Tests First

All test files go under `/home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/`.

### Test file: `test_chunker.py`

```python
# /home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_chunker.py

"""Tests for SmartChunker — token-based, strategy-aware document chunking."""

import pytest
from app.orchestrator.rag.chunker import (
    SmartChunker,
    ChunkStrategy,
    ChunkConfig,
    Chunk,
)


class TestChunkStrategy:
    """Tests for strategy auto-detection."""

    # Test: markdown headings in first 500 chars -> MARKDOWN strategy
    def test_auto_detect_markdown(self): ...

    # Test: Python def/class keywords in first 500 chars -> CODE strategy
    def test_auto_detect_python_code(self): ...

    # Test: JavaScript function keyword in first 500 chars -> CODE strategy
    def test_auto_detect_javascript_code(self): ...

    # Test: plain text with no special markers -> RECURSIVE strategy
    def test_auto_detect_plain_text(self): ...


class TestRecursiveSplitting:
    """Tests for RECURSIVE strategy splitting behavior."""

    @pytest.fixture
    def chunker(self):
        """Create a SmartChunker with RECURSIVE strategy and small limits for testing."""
        config = ChunkConfig(
            strategy=ChunkStrategy.RECURSIVE,
            child_max_tokens=50,
            child_overlap_tokens=10,
            parent_max_tokens=120,
            min_chunk_tokens=10,
        )
        return SmartChunker(config)

    # Test: RECURSIVE splits on paragraphs first (\n\n boundaries)
    def test_splits_on_paragraphs_first(self, chunker): ...

    # Test: falls back to sentences when a paragraph is too large
    def test_falls_back_to_sentences(self, chunker): ...

    # Test: no chunk content ends mid-sentence
    def test_no_mid_sentence_splits(self, chunker): ...


class TestTokenCounting:
    """Tests for accurate tiktoken-based token counting."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.RECURSIVE,
            child_max_tokens=400,
            child_overlap_tokens=80,
            parent_max_tokens=1024,
            min_chunk_tokens=50,
        )
        return SmartChunker(config)

    # Test: all child chunks have token_count within [min_chunk_tokens, child_max_tokens]
    def test_child_chunks_within_token_range(self, chunker): ...

    # Test: all parent chunks have token_count within parent_max_tokens
    def test_parent_chunks_within_token_range(self, chunker): ...

    # Test: token_count field matches tiktoken encoding of content
    def test_token_count_matches_tiktoken(self, chunker): ...


class TestParentChildRelationship:
    """Tests for parent-child chunk pattern."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.RECURSIVE,
            child_max_tokens=100,
            child_overlap_tokens=20,
            parent_max_tokens=250,
            min_chunk_tokens=20,
        )
        return SmartChunker(config)

    # Test: each child chunk has a valid parent_chunk_id pointing to a parent chunk
    def test_children_have_valid_parent_id(self, chunker): ...

    # Test: parent chunks have is_parent=True, children have is_parent=False
    def test_parent_child_flags(self, chunker): ...

    # Test: each parent has 2-4 children with overlap
    def test_parent_has_expected_child_count(self, chunker): ...

    # Test: parent chunk content encompasses all its children's content
    def test_parent_content_covers_children(self, chunker): ...


class TestMarkdownStrategy:
    """Tests for MARKDOWN strategy."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.MARKDOWN,
            child_max_tokens=100,
            child_overlap_tokens=20,
            parent_max_tokens=300,
            min_chunk_tokens=10,
        )
        return SmartChunker(config)

    # Test: splits on heading boundaries (#, ##, ###)
    def test_splits_on_headings(self, chunker): ...

    # Test: preserves section_heading metadata on each chunk
    def test_preserves_section_heading_metadata(self, chunker): ...

    # Test: heading text appears in chunk's section_heading field
    def test_heading_in_section_heading_field(self, chunker): ...


class TestCodeStrategy:
    """Tests for CODE strategy."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.CODE,
            child_max_tokens=200,
            child_overlap_tokens=40,
            parent_max_tokens=500,
            min_chunk_tokens=20,
        )
        return SmartChunker(config)

    # Test: functions/classes are not split across chunks
    def test_functions_not_split(self, chunker): ...

    # Test: class definitions stay intact within a single chunk
    def test_classes_not_split(self, chunker): ...


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(strategy=ChunkStrategy.RECURSIVE)
        return SmartChunker(config)

    # Test: empty text returns empty list
    def test_empty_text_returns_empty_list(self, chunker): ...

    # Test: text shorter than min_chunk_tokens returns single chunk
    def test_short_text_single_chunk(self, chunker): ...

    # Test: single-line text handled correctly
    def test_single_line_text(self, chunker): ...

    # Test: whitespace-only text returns empty list
    def test_whitespace_only_returns_empty(self, chunker): ...


class TestScopeInheritance:
    """Tests for tenant and scope propagation to chunks."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(strategy=ChunkStrategy.RECURSIVE)
        return SmartChunker(config)

    # Test: chunks inherit tenant_id from the parent document parameters
    def test_chunks_inherit_tenant_id(self, chunker): ...

    # Test: chunks inherit allowed_scopes from the parent document parameters
    def test_chunks_inherit_allowed_scopes(self, chunker): ...


class TestFixedStrategyBackwardCompat:
    """Tests for FIXED strategy backward compatibility."""

    @pytest.fixture
    def chunker(self):
        config = ChunkConfig(
            strategy=ChunkStrategy.FIXED,
            child_max_tokens=400,
            child_overlap_tokens=80,
        )
        return SmartChunker(config)

    # Test: FIXED strategy produces character-based chunks similar to legacy chunker
    def test_fixed_strategy_character_based(self, chunker): ...
```

### Test file: `test_indexing_pipeline.py`

```python
# /home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_indexing_pipeline.py

"""Tests for SmartChunker integration into the library indexing pipeline."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestIndexingPipelineIntegration:
    """Tests for SmartChunker integration with library_indexing_service."""

    # Test: indexing a document creates both parent and child chunks in DB
    @pytest.mark.asyncio
    async def test_creates_parent_and_child_chunks(self): ...

    # Test: only child chunks (is_parent=False) are embedded and sent to vector store
    @pytest.mark.asyncio
    async def test_only_child_chunks_embedded(self): ...

    # Test: parent chunks stored in DB but NOT indexed in vector store
    @pytest.mark.asyncio
    async def test_parent_chunks_not_in_vector_store(self): ...

    # Test: chunk content hashes are unique per item
    @pytest.mark.asyncio
    async def test_chunk_content_hashes_unique(self): ...

    # Test: re-indexing same document replaces old chunks
    @pytest.mark.asyncio
    async def test_reindexing_replaces_old_chunks(self): ...


class TestEmbeddingStandardization:
    """Tests for embedding dimension standardization."""

    # Test: new chunks are embedded with 1536-dim model
    @pytest.mark.asyncio
    async def test_new_chunks_use_1536_dim(self): ...

    # Test: embedding dimension matches EmbeddingService configuration
    @pytest.mark.asyncio
    async def test_embedding_dimension_matches_service(self): ...
```

### Test file: `test_reindex_task.py`

```python
# /home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_reindex_task.py

"""Tests for Celery re-indexing batch task."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestReindexBatchTask:
    """Tests for the Celery batch re-indexing task."""

    # Test: Celery task processes items in batches of 50
    @pytest.mark.asyncio
    async def test_processes_in_batches_of_50(self): ...

    # Test: old chunks are deleted before new chunks are created
    @pytest.mark.asyncio
    async def test_old_chunks_deleted_first(self): ...

    # Test: old vector store entries are cleaned up
    @pytest.mark.asyncio
    async def test_old_vector_entries_cleaned(self): ...

    # Test: re-indexing preserves allowed_scopes from original item
    @pytest.mark.asyncio
    async def test_preserves_allowed_scopes(self): ...

    # Test: progress is tracked (items processed / total items)
    @pytest.mark.asyncio
    async def test_progress_tracking(self): ...
```

### Test file: `test_library_model.py` (extend existing or create)

```python
# /home/dev/projects/SmartSpecPro/python-backend/tests/orchestrator/rag/test_library_model.py

"""Tests for LibraryChunk model additions for parent-child chunk support."""

import pytest
from app.models.library import LibraryChunk


class TestLibraryChunkParentChild:
    """Tests for is_parent and parent_chunk_id columns."""

    # Test: LibraryChunk model has is_parent field with default False
    def test_is_parent_default_false(self): ...

    # Test: LibraryChunk model has parent_chunk_id field (nullable)
    def test_parent_chunk_id_nullable(self): ...
```

---

## Implementation Details

### 1. New file: `chunker.py`

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/chunker.py`

This is the core new file for this section. It contains:

#### `ChunkStrategy` enum

```python
class ChunkStrategy(str, Enum):
    FIXED = "fixed"          # Legacy backward-compat (character-based)
    RECURSIVE = "recursive"  # Default: paragraph > line > sentence > word
    MARKDOWN = "markdown"    # Split by headings, preserve structure
    CODE = "code"            # Split by function/class boundaries
    SEMANTIC = "semantic"    # Split by embedding similarity (future, not implemented)
```

#### `ChunkConfig` dataclass

```python
@dataclass
class ChunkConfig:
    strategy: ChunkStrategy = ChunkStrategy.RECURSIVE
    child_max_tokens: int = 400       # Retrieval chunk size
    child_overlap_tokens: int = 80    # ~20% overlap between children
    parent_max_tokens: int = 1024     # LLM context chunk size
    min_chunk_tokens: int = 50        # Minimum viable chunk size
```

#### `Chunk` dataclass

```python
@dataclass
class Chunk:
    chunk_id: str                       # UUID or generated ID
    content: str                        # The chunk text
    index: int                          # Sequential position
    parent_chunk_id: str | None         # For child -> parent lookup
    parent_doc_id: str                  # Source document ID
    parent_doc_title: str               # Source document title
    section_heading: str                # Nearest heading above this chunk
    token_count: int                    # Actual token count via tiktoken
    start_char: int                     # Start position in original document
    end_char: int                       # End position in original document
    is_parent: bool                     # True for parent chunks, False for children
    tenant_id: str                      # Inherited from parent document
    allowed_scopes: list[str]           # Inherited from parent document
    metadata: dict                      # Additional metadata
```

#### `SmartChunker` class

The main class with these responsibilities:

**Strategy auto-detection** (`detect_strategy` static method):
- Examine the first 500 characters of the document
- If markdown headings (`#`, `##`, `###`) are present, return `MARKDOWN`
- If code markers (`def `, `class `, `function `, `const `, `import `) are present, return `CODE`
- Otherwise, return `RECURSIVE`

**Token counting** (via `tiktoken`):
- Use `tiktoken.encoding_for_model("gpt-4")` or `tiktoken.get_encoding("cl100k_base")` for accurate token counting
- `tiktoken` is already available in `requirements.txt` (version `>=0.5.0`)

**`chunk(self, text, doc_id, doc_title, tenant_id, allowed_scopes, strategy=None) -> list[Chunk]`**:
- The main public method
- If `strategy` is `None`, auto-detect from content
- Calls the appropriate internal strategy method
- Returns both parent and child `Chunk` objects

**Recursive splitting hierarchy** (for `RECURSIVE` strategy):
1. Split on `\n\n` (paragraph boundaries)
2. If any resulting segment exceeds `parent_max_tokens`, split on `\n` (line boundaries)
3. If still too large, split on `. ` (sentence boundaries)
4. If still too large, split on ` ` (word boundaries)
5. Never split mid-word

**Parent-child generation** (for all strategies):
1. First, create parent chunks at `parent_max_tokens` (1024 tokens)
2. For each parent chunk, create 2-4 child chunks at `child_max_tokens` (400 tokens) with `child_overlap_tokens` (80 tokens) overlap
3. Children store `parent_chunk_id` referencing the parent's `chunk_id`
4. Parent chunks: `is_parent=True`
5. Child chunks: `is_parent=False`

**Markdown strategy** specifics:
- Split on heading boundaries (`^#{1,6}\s`)
- Preserve heading text in the `section_heading` field of each chunk
- If a section under a heading exceeds `parent_max_tokens`, apply recursive splitting within the section

**Code strategy** specifics:
- Split on function/class boundaries (`def `, `class `, `function `, `async function `)
- Keep entire function/class bodies together when possible
- Fall back to recursive splitting if a single function exceeds `parent_max_tokens`

**FIXED strategy** (backward compatibility):
- Character-based splitting similar to the existing `chunk_text_content()` function in `library_indexing_service.py`
- Uses character counts instead of token counts
- No parent-child pattern (all chunks have `is_parent=False`, `parent_chunk_id=None`)

### 2. Schema Additions for Parent-Child Chunks

#### Drizzle schema (TypeScript)

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

Add two columns to the `libraryChunks` table definition (currently at line 1617):

```typescript
isParent: boolean("is_parent").default(false).notNull(),
parentChunkId: text("parent_chunk_id"),
```

These go after the existing `metadata` column and before the closing of the table definition. This is a LOW-risk migration (additive columns with safe defaults).

After editing, run the migration immediately:
```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push
```

#### SQLAlchemy model (Python)

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/library.py`

Add two columns to the `LibraryChunk` class (currently at line 86):

```python
is_parent = Column(Boolean, nullable=False, default=False)
parent_chunk_id = Column(Text, nullable=True)
```

Add these after the existing `metadata_json` column (line 106) and before `created_at`. Note that section-01 will already have added `allowed_scopes` to this model; these columns are independent additions.

### 3. Integrate SmartChunker into Indexing Pipeline

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/library_indexing_service.py`

In the `process_library_index_job()` function, currently at line 1013, the code does:

```python
chunks = chunk_text_content(indexable_text)
```

This needs to be replaced with a call to `SmartChunker`. The integration logic:

1. Import `SmartChunker`, `ChunkConfig`, `Chunk` from `app.orchestrator.rag.chunker`
2. Create a `SmartChunker` instance with default `ChunkConfig()` (strategy auto-detected from content)
3. Call `chunker.chunk(text, doc_id=str(item.id), doc_title=item.title, tenant_id=job.tenant_id, allowed_scopes=item.allowed_scopes or [f"u:{item.owner_user_id}"])`
4. The result is a list of `Chunk` objects containing both parents and children
5. Separate into parent chunks and child chunks
6. **Only embed child chunks** -- pass child chunk contents to `embedder.embed_batch()`
7. **Only upsert child chunk vectors** -- pass child chunks to the vector upsert function
8. **Store ALL chunks** (parents and children) in `libraryChunks` table, setting `is_parent` and `parent_chunk_id` appropriately

The existing code that creates `LibraryChunk` records (around line 1080-1096) needs to be updated to include the new fields:

```python
LibraryChunk(
    tenant_id=job.tenant_id,
    library_item_id=item.id,
    chunk_index=chunk.index + chunk_index_offset,
    content=chunk.content,
    content_type="text",
    token_count=chunk.token_count,
    vector_ref_id=vector_id if not chunk.is_parent else None,
    is_parent=chunk.is_parent,
    parent_chunk_id=chunk.parent_chunk_id,
    metadata={
        "section_heading": chunk.section_heading,
        "start_char": chunk.start_char,
        "end_char": chunk.end_char,
        "strategy": chunk.metadata.get("strategy", "recursive"),
        "job_id": job.id,
    },
    created_at=created_at,
)
```

Key change: parent chunks get `vector_ref_id=None` because they are not indexed in the vector store.

The existing `chunk_text_content()` function in the same file should be preserved for backward compatibility but marked with a deprecation notice. New indexing should use `SmartChunker`.

### 4. Embedding Model Standardization

During re-indexing via the smart chunker:
- All new chunks are embedded using the Python `EmbeddingService` which defaults to OpenAI's embedding model (1536 dimensions)
- Existing 768-dim vectors created by Node.js `vectorize.ts` (via Cloudflare's `bge-base-en-v1.5`) are replaced when their parent documents are re-chunked
- After a full re-index, all vectors in the RAG pipeline will be 1536-dim

No code changes are needed for the embedding service itself -- the standardization happens naturally by routing all indexing through the Python pipeline.

### 5. Re-indexing Batch Task (Celery)

**File path:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py` (add new task) or create a new file `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/reindex_tasks.py`

Create a Celery task `smart_reindex_library_items` that:

1. Accepts `tenant_id` (optional, None means all tenants) as a parameter
2. Queries all `LibraryItem` records matching the tenant filter (non-deleted)
3. Processes in batches of 50 items to limit memory usage
4. For each item in a batch:
   - Delete existing non-`markdown_source` chunks for the item
   - Run the document text through `SmartChunker` 
   - Embed child chunks via `EmbeddingService`
   - Upsert child chunk vectors via the resolved vector upsert function
   - Store all chunks (parent + child) in `libraryChunks`
   - Preserve `allowed_scopes` from the original item
5. Track progress: log `items_processed / total_items` after each batch
6. Use the existing Celery app from `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`

The task pattern should follow existing patterns in `media_tasks.py`, using `_run_async()` to safely execute async coroutines in the Celery worker context:

```python
@celery_app.task(bind=True, name="smart_reindex_library_items", queue="celery")
def smart_reindex_library_items(self, tenant_id: str | None = None):
    """Re-index all library items with SmartChunker. Runs in batches of 50."""
    _run_async(_smart_reindex_impl(tenant_id))
```

The existing `reindex_all_library_items()` function in `library_indexing_service.py` enqueues individual `LibraryIndexJob` records. The new Celery task can either:
- **Option A (recommended):** Call the existing `reindex_all_library_items()` which enqueues jobs, then those jobs are picked up by `retry_due_library_index_jobs()` -- which now uses `SmartChunker` in its pipeline
- **Option B:** Process items directly in the Celery task, bypassing the job queue, for faster bulk processing

Option A is recommended because it reuses the existing retry/deduplication/observability infrastructure. The key change is that `process_library_index_job()` now uses `SmartChunker` instead of `chunk_text_content()`.

### 6. Node.js Chunking Update

**File path:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/vectorize.ts`

The `chunkDocument()` function in `vectorize.ts` (line 27) is used for real-time simple text embedding. For this section, keep the Node.js chunker as-is for simple/short texts (chat messages, quick notes) since they do not need parent-child chunking. All library item indexing goes through the Python pipeline via `library_indexing_service.py`.

No changes are needed to `vectorize.ts` in this section. The Python SmartChunker handles all library item chunking, and the Node.js chunker remains for lightweight, non-library use cases.

---

## File Summary (Actual)

### New files

| File | Purpose | Lines |
|------|---------|-------|
| `python-backend/app/orchestrator/rag/chunker.py` | `SmartChunker`, `ChunkStrategy`, `ChunkConfig`, `Chunk` classes | ~520 |
| `python-backend/app/tasks/reindex_tasks.py` | Celery `smart_reindex_library_items` task (Option A: enqueue jobs) | ~130 |
| `python-backend/tests/orchestrator/rag/test_chunker.py` | 26 tests: strategies, splitting, tokens, parent-child, edge cases, scopes | ~500 |
| `python-backend/tests/orchestrator/rag/test_indexing_pipeline.py` | 7 tests: pipeline integration, embedding standardization | ~155 |
| `python-backend/tests/orchestrator/rag/test_reindex_task.py` | 7 tests: batch processing, progress, error handling | ~175 |
| `python-backend/tests/orchestrator/rag/test_library_model.py` | 2 tests: is_parent default, parent_chunk_id nullable | ~25 |
| `apps/web/drizzle/0034_parched_supernaut.sql` | Auto-generated migration for is_parent + parent_chunk_id | ~5 |

### Modified files

| File | Changes |
|------|---------|
| `python-backend/app/models/library.py` | Added `is_parent` (Boolean, default False, server_default="false") and `parent_chunk_id` (Text, nullable) to `LibraryChunk` |
| `apps/web/drizzle/schema.ts` | Added `isParent` and `parentChunkId` columns + `library_chunks_parent_chunk_idx` index to `libraryChunks` |
| `python-backend/app/services/library_indexing_service.py` | Replaced `chunk_text_content()` with `SmartChunker` in `process_library_index_job()`, separate parent/child storage loops with `allowed_scopes` propagation, deprecation notice on legacy function |

### Unchanged files

| File | Reason |
|------|--------|
| `apps/web/server/services/vectorize.ts` | Kept as-is for lightweight non-library embeddings |
| `python-backend/requirements.txt` | `tiktoken>=0.5.0` already present |

## Deviations from Plan

1. **Reindex task in separate file** — Created `reindex_tasks.py` instead of adding to `media_tasks.py` (cleaner separation of concerns)
2. **Option A for reindexing** — Used job-enqueue pattern (enqueue `LibraryIndexJob` per item) rather than direct processing, reusing existing retry/deduplication/observability infrastructure
3. **Code review fix: allowed_scopes propagation** — Initial implementation missed passing `allowed_scopes` to `LibraryChunk()` constructors in the indexing service. Fixed during code review to include `allowed_scopes=parent.allowed_scopes` and `allowed_scopes=child.allowed_scopes`
4. **Strategy auto-detection refinement** — Changed code marker detection from `sum(1 for m in markers if m in sample)` (unique presence) to `sum(sample.count(m) for m in markers)` (total occurrences) for more accurate CODE strategy detection
5. **No `const ` or `import ` in code markers** — Plan listed these but implementation uses only `["def ", "class ", "function ", "async function "]` since `const` and `import` are too common in non-code contexts
6. **Drizzle migration via `npm run db:push`** — Used npm instead of pnpm as the project root uses npm

---

## Database Migration

This section requires a database migration for the new columns on `libraryChunks`. This is **LOW risk** (additive columns with safe defaults).

**Migration steps (follow Database Safety Protocol from CLAUDE.md):**

1. Backup the `library_chunks` table before migration
2. Add `is_parent` column: `Boolean, NOT NULL, DEFAULT false` -- all existing chunks become non-parent (correct)
3. Add `parent_chunk_id` column: `Text, NULLABLE` -- all existing chunks have no parent (correct, they were created before parent-child pattern)
4. Verify row counts post-migration
5. No backfill needed -- existing chunks are all "child" type with no parent, which is the correct default

The Drizzle migration (`pnpm db:push`) and SQLAlchemy model change must both be applied. Since Drizzle is the source of truth for the schema, run `pnpm db:push` first, then verify the Python SQLAlchemy model matches.

---

## Implementation Order (TODO List)

1. Add `is_parent` and `parent_chunk_id` to `LibraryChunk` in `/home/dev/projects/SmartSpecPro/python-backend/app/models/library.py`
2. Add `isParent` and `parentChunkId` to `libraryChunks` in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`
3. Run database migration: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push`
4. Write `test_chunker.py` with all test stubs
5. Create `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/rag/chunker.py` with `SmartChunker` implementation
6. Run `test_chunker.py` -- verify all tests pass
7. Write `test_indexing_pipeline.py` with test stubs
8. Modify `process_library_index_job()` in `library_indexing_service.py` to use `SmartChunker`
9. Run `test_indexing_pipeline.py` -- verify integration tests pass
10. Write `test_reindex_task.py` with test stubs
11. Add `smart_reindex_library_items` Celery task
12. Run `test_reindex_task.py` -- verify batch task tests pass
13. Run full test suite: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest` -- verify no regressions