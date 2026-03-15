<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-and-migration
section-02-media-asset-service
section-03-vision-pipeline-python
section-04-embedding-provider
section-05-visual-state-service
section-06-retrieval-and-reference-resolution
section-07-context-packing-integration
section-08-ingestion-hook-and-credits
section-09-safety-and-feature-flags
section-10-user-controls-and-deletion
section-11-chat-ui-gallery
section-12-backfill-and-integration-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-and-migration | - | all | Yes |
| section-02-media-asset-service | 01 | 03, 08 | Yes |
| section-03-vision-pipeline-python | 01 | 06, 09 | Yes |
| section-04-embedding-provider | 01 | 06 | Yes |
| section-05-visual-state-service | 01 | 06, 07 | Yes |
| section-06-retrieval-and-reference-resolution | 03, 04, 05 | 07, 10 | No |
| section-07-context-packing-integration | 05, 06 | 08 | No |
| section-08-ingestion-hook-and-credits | 02, 07 | 09 | No |
| section-09-safety-and-feature-flags | 03, 08 | 10 | No |
| section-10-user-controls-and-deletion | 02, 05, 06, 09 | 11 | No |
| section-11-chat-ui-gallery | 10 | 12 | No |
| section-12-backfill-and-integration-tests | all | - | No |

## Execution Order

1. **Batch 1**: section-01-schema-and-migration (no dependencies — foundation)
2. **Batch 2**: section-02-media-asset-service, section-03-vision-pipeline-python, section-04-embedding-provider, section-05-visual-state-service (parallel after 01)
3. **Batch 3**: section-06-retrieval-and-reference-resolution (requires 03, 04, 05)
4. **Batch 4**: section-07-context-packing-integration (requires 05, 06)
5. **Batch 5**: section-08-ingestion-hook-and-credits (requires 02, 07)
6. **Batch 6**: section-09-safety-and-feature-flags (requires 03, 08)
7. **Batch 7**: section-10-user-controls-and-deletion (requires 02, 05, 06, 09)
8. **Batch 8**: section-11-chat-ui-gallery (requires 10 — Phase 2)
9. **Batch 9**: section-12-backfill-and-integration-tests (final — requires all)

## Section Summaries

### section-01-schema-and-migration
All 6 new Drizzle table definitions (`media_assets`, `media_asset_analysis`, `multimodal_memory_items`, `multimodal_memory_vectors`, `conversation_visual_state`, `multimodal_memory_links`). pgvector extension. Attachments type update. Migration generation and execution.

### section-02-media-asset-service
`mediaAssetService.ts` — CRUD for media assets. Signed URL generation, checksum dedup, perceptual hashing, image validation (format/size). Dimension extraction via sharp.

### section-03-vision-pipeline-python
Python Celery task (`vision_tasks.py`) and FastAPI endpoint (`vision.py`). Gemini 2.5 Flash structured output. SQLAlchemy models for new tables. Status tracking. Retry policy. x-proxy-token auth.

### section-04-embedding-provider
`multimodalEmbeddingProvider.ts` — Abstract interface + GeminiEmbeddingProvider (768-dim) + CloudflareFallbackProvider. Provider selection logic. Provider isolation for search.

### section-05-visual-state-service
`visualStateService.ts` — Conversation visual working set (recent/active/compared/named sets). FIFO management. Concurrency-safe JSONB updates. Redis caching.

### section-06-retrieval-and-reference-resolution
`multimodalRetrievalService.ts` — LLM-based reference resolver (Thai + English). Hybrid ranking formula. Keyword pre-filter. Vector search with provider filtering. Memory card compression.

### section-07-context-packing-integration
Extend `ChatContext` interface. Adaptive budget allocation. New step 4.5 in `buildChatContext()`. `contextToMessages()` type migration (`string | ContentPart[]`). `getTextContent()` helper. Image-aware system instructions.

### section-08-ingestion-hook-and-credits
Modify chat router upload flow to create assets + dispatch analysis. Credit deduction for vision + embedding. provider_usage_log integration.

### section-09-safety-and-feature-flags
NSFW blocking logic. `MULTIMODAL_MEMORY_ENABLED` feature flag (tenant-scoped). Gate locations: chat.ts, buildChatContext, Python endpoint, retrieval service. OCR PII filtering.

### section-10-user-controls-and-deletion
tRPC mutations for delete-from-memory and pin. Chat command reference for deletion. Cascade cleanup (memory items, vectors, links, visual state).

### section-11-chat-ui-gallery
React `ImageGalleryPanel` component. `VisualContextBadge`. Inline image chips in assistant messages. Phase 2 UI work.

### section-12-backfill-and-integration-tests
Standalone backfill script for existing attachments. HNSW index creation post-backfill. End-to-end integration tests: upload → analyze → embed → retrieve → context.
