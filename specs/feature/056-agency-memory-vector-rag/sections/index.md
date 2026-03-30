<!-- PROJECT_CONFIG
runtime: python-pip
test_command: cd python-backend && pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-db-migration
section-02-embedding-integration
section-03-chunk-service
section-04-retrieval-engine
section-05-context-budget
section-06-orchestrator-wiring
section-07-internode-optimization
section-08-memory-purge
section-09-embedding-backfill
section-10-tests-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-db-migration | - | 02, 03, 08, 09 | Yes (first) |
| section-02-embedding-integration | 01 | 04, 09 | Yes (with 03, 05, 08) |
| section-03-chunk-service | 01 | 04, 07 | Yes (with 02, 05, 08) |
| section-04-retrieval-engine | 02, 03 | 06 | No |
| section-05-context-budget | - | 06 | Yes (with 01, 02, 03, 08) |
| section-06-orchestrator-wiring | 04, 05 | 07 | No |
| section-07-internode-optimization | 03, 06 | 10 | No |
| section-08-memory-purge | 01 | 10 | Yes (with 02, 03, 05) |
| section-09-embedding-backfill | 02 | 10 | No |
| section-10-tests-verification | all | - | No (last) |

## Execution Order

1. **Batch 1**: section-01-db-migration, section-05-context-budget (independent, parallel)
2. **Batch 2**: section-02-embedding-integration, section-03-chunk-service, section-08-memory-purge (parallel after 01)
3. **Batch 3**: section-04-retrieval-engine (after 02 + 03), section-09-embedding-backfill (after 02)
4. **Batch 4**: section-06-orchestrator-wiring (after 04 + 05)
5. **Batch 5**: section-07-internode-optimization (after 03 + 06)
6. **Batch 6**: section-10-tests-verification (after all)

## Section Summaries

### section-01-db-migration
Add `embedding vector(1536)` column to `agency_agent_memories`, create `agency_memory_chunks` table, HNSW indexes, SQLAlchemy model. Drizzle schema + migration.

### section-02-embedding-integration
Enhance `save_memory()` to generate embeddings, enhance `get_memories_for_agent()` for semantic search with hybrid scoring, graceful degradation, recency decay.

### section-03-chunk-service
New `AgencyChunkService` — chunk agent outputs into ~500 token segments with overlap, batch embed, store in `agency_memory_chunks`. Sentence-boundary splitting, search by cosine similarity.

### section-04-retrieval-engine
New `AgencyMemoryRetriever` — 2-level retrieval: L1 facts → conditional L2 chunks → merge + dedup + budget fit. Context formatting for LLM injection.

### section-05-context-budget
New `ContextBudgetManager` — model context limit lookup, 60% budget ratio, allocation tracking, truncation. Independent of DB changes.

### section-06-orchestrator-wiring
Wire retriever + chunk service + budget manager into `agency_orchestrator.py`. Replace confidence-sort with semantic retrieval pre-execution, add chunking post-execution.

### section-07-internode-optimization
Truncate `ctx.results[node_id]` from 50K to 2K chars. Ensure full output is chunked before truncation. Backward compatibility check.

### section-08-memory-purge
New Celery task for daily hard-delete of soft-deleted memories (30d), expired chunks (TTL), old traces (30d). Celery beat schedule entry.

### section-09-embedding-backfill
One-time Celery task to batch-embed existing memories without embeddings. Resumable, batch of 100. Auto-trigger after migration.

### section-10-tests-verification
Integration tests for full flow, cross-section verification, regression check on existing tests, TypeScript typecheck.
