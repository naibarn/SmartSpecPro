<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: bash -lc "npm run -w @smartspec/web test && cd python-backend && uv run pytest"
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-reliability-foundation
section-02-library-schema
section-03-library-domain-services
section-04-indexing-pipeline
section-05-hybrid-search-api
section-06-media-add-to-library
section-07-media-studio-history-ui
section-08-chat-library-integration
section-09-observability-backfill-ops
section-10-rollout-security-hardening
section-11-rag-document-management-uiux
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-reliability-foundation | - | 02, 06, 09, 10 | No |
| section-02-library-schema | 01 | 03, 04, 05, 06 | No |
| section-03-library-domain-services | 02 | 05, 06, 08 | Yes |
| section-04-indexing-pipeline | 02 | 05, 09 | Yes |
| section-05-hybrid-search-api | 03, 04 | 07, 08 | No |
| section-06-media-add-to-library | 01, 02, 03 | 07 | No |
| section-07-media-studio-history-ui | 05, 06 | 10 | No |
| section-08-chat-library-integration | 03, 05 | 10 | Yes |
| section-09-observability-backfill-ops | 01, 04 | 10 | Yes |
| section-10-rollout-security-hardening | 07, 08, 09 | - | No |
| section-11-rag-document-management-uiux | 03, 05, 10 | - | No |

## Execution Order

1. `section-01-reliability-foundation`
2. `section-02-library-schema`
3. `section-03-library-domain-services`, `section-04-indexing-pipeline`
4. `section-05-hybrid-search-api`, `section-06-media-add-to-library`
5. `section-07-media-studio-history-ui`, `section-08-chat-library-integration`, `section-09-observability-backfill-ops`
6. `section-10-rollout-security-hardening`
7. `section-11-rag-document-management-uiux`

## Section Summaries

### section-01-reliability-foundation
Hardens media callback and provider-result foundations (idempotency, durable retries, DLQ, strict provider task ID contract).

### section-02-library-schema
Introduces core library and indexing schema with migration/backfill scaffolding.

### section-03-library-domain-services
Implements library CRUD, ACL, linking, and domain-level validation services.

### section-04-indexing-pipeline
Builds asynchronous ingestion/chunk/embed/index workflow and retryable job state machine.

### section-05-hybrid-search-api
Implements versioned hybrid search contract with tenant/ACL-safe filtering and ranking merge behavior.

### section-06-media-add-to-library
Connects media task completion assets to library creation and indexing enqueue APIs.

### section-07-media-studio-history-ui
Adds Add-to-Library and Search Library UX in Media Studio and Media History.

### section-08-chat-library-integration
Adds Chat source picker integration for searching and attaching library items.

### section-09-observability-backfill-ops
Adds metrics/logging/dashboard primitives and backfill controls (dry-run, throttling, pause/resume).

### section-10-rollout-security-hardening
Finalizes feature-flag rollout logic, quantitative release gates, and security/audit hardening.

### section-11-rag-document-management-uiux
Adds Dashboard entry + full Document Management UX for personal/shared RAG files, multi-format preview (with MD-first editor), and fast search/sort behavior.
