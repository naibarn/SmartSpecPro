# Feature 050: Library pgvector Full Integration Without Chroma Regression

**Status:** Draft
**Created:** 2026-03-19
**Author:** Codex
**Priority:** High
**Estimated Scope:** Large, multi-phase, cross-runtime

---

## 1. Executive Summary

SmartSpecPro already contains substantial pgvector groundwork, but the Library search/indexing path is not fully integrated end-to-end. The system currently has:

- A generic Python `PgVectorStore`
- Additive pgvector migration work for tenant-scoped library vectors
- Library chunk records with stable `vector_ref_id`
- A provider selector for indexing (`chroma`, `pgvector`, `cloudflare_vectorize`)

However, the production Library query path still does **not** perform direct pgvector retrieval. Instead, the Node.js search path derives "vector" scores from relational chunk text, and the current pgvector integration has multiple mismatches:

- search path not wired to pgvector
- identifier mismatch between `vector_ref_id` and pgvector document IDs
- schema mismatch between `vector_documents` and `library_chunk_vectors`
- permission metadata propagation not fully wired
- delete/reindex lifecycle not guaranteed across providers

This feature defines a complete, low-risk integration plan that makes pgvector a **fully operational Library vector backend** while preserving current Chroma-based installs and avoiding regressions for deployments that do not enable pgvector.

The core principle is:

> **pgvector must become a complete opt-in provider for Library RAG, not a breaking replacement for ChromaDB.**

---

## 2. Problem Statement

The repository currently describes pgvector as "ready but not fully integrated." In practical terms, this means pgvector exists as partially implemented infrastructure, but not as a trustworthy runtime path for Library search.

### 2.1 Confirmed Current Gaps

1. **Library search does not use pgvector retrieval**
   - `apps/web/server/services/libraryService.ts` computes `vector_score` from token overlap against `library_chunks.content`, gated by presence of `vector_ref_id`.
   - The user-facing `library.search` contract exists, but direct ANN retrieval from a vector backend is deferred.

2. **Provider selection affects indexing more than querying**
   - `python-backend/app/services/library_indexing_service.py` supports `LIBRARY_VECTOR_PROVIDER`, but query-time search still runs through Node relational scoring.

3. **Identifier model is inconsistent**
   - Library indexing uses stable IDs like `lib:{tenant}:{item}:{chunk}` and stores them in `library_chunks.vector_ref_id`.
   - Generic `PgVectorStore` expects `doc_id` to be a UUID in read/update/delete paths.

4. **pgvector upsert is not using the stable library vector IDs**
   - The current pgvector upsert path generates stable `vector_ids`, but inserts rows into `vector_documents` with `gen_random_uuid()` instead of using those IDs.

5. **Two pgvector schema directions exist**
   - Generic store path uses `vector_documents`.
   - Tenant-scoped library migration work creates `library_chunk_vectors`.
   - The repo does not currently define which is canonical for Library retrieval.

6. **Permission metadata propagation is incomplete**
   - Internal scope propagation wiring exists, but provider instances are not fully passed through the current internal API path.

7. **Delete and reindex lifecycle is not provider-complete**
   - Relational chunk records are cleaned up, but vector backend cleanup is not uniformly enforced across providers.

### 2.2 Business Impact

- pgvector cannot be safely enabled for Library RAG in production today.
- Teams cannot rely on postgres-native vector search even though the codebase appears to offer it.
- Search quality claims are misleading because the current "vector" score is not a true vector similarity score on the Library query path.
- Any rushed cutover would risk breaking existing Chroma-backed deployments.

---

## 3. Goals

### 3.1 Primary Goals

1. Make pgvector a **fully working Library vector provider** for:
   - indexing
   - update/reindex
   - delete
   - scope/ACL metadata propagation
   - direct query-time retrieval
   - hybrid scoring

2. Preserve existing installs that use ChromaDB by ensuring:
   - `chroma` remains the default provider
   - existing Chroma-backed behavior remains functional
   - pgvector migrations are additive and opt-in
   - startup does not fail when pgvector is unavailable

3. Preserve the external `library_search_v1` response contract so frontend and chat/library integrations continue to work.

4. Introduce a provider-safe internal architecture that supports native query paths per backend instead of faking vector scoring from relational text.

### 3.2 Secondary Goals

1. Clarify and standardize the canonical schema and ID model for Library vectors.
2. Add observability so operator teams can tell which provider is active and whether indexing/query/delete operations succeeded.
3. Establish a reliable test matrix for both `chroma` and `pgvector`.

---

## 4. Non-Goals

This feature does **not** aim to:

1. Replace ChromaDB for episodic memory or other non-Library workflows.
2. Force all tenants or deployments to migrate to pgvector.
3. Rewrite unrelated generic vector store consumers.
4. Introduce a brand-new public search contract beyond `library_search_v1`.
5. Solve every RAG maturity concern in one pass.
6. Remove Cloudflare Vectorize support from the provider abstraction.

---

## 5. Constraints

### 5.1 Compatibility Constraints

1. Existing Chroma installs must continue to work without requiring:
   - postgres `vector` extension
   - pgvector credentials
   - pgvector migrations

2. Existing query consumers must continue to receive:
   - `version`
   - `results`
   - `combined_score`
   - `keyword_score`
   - `vector_score`
   - attach payload shape

3. `library_chunks.vector_ref_id` is already in use and must remain stable across reindex operations.

### 5.2 Runtime Constraints

1. The Library feature spans two runtimes:
   - Node.js / tRPC / Drizzle
   - Python / FastAPI / Celery / SQLAlchemy

2. Query-time provider switching must not require frontend changes.

3. pgvector may not be installed on all Postgres instances, so the implementation must fail closed into a safe compatibility mode rather than break startup.

---

## 6. Current State Summary

### 6.1 What Already Exists

#### Node.js / web

- `library.search` tRPC endpoint
- `library_search_v1` response contract
- tenant/ACL filtering
- deterministic ranking
- relational `library_items`, `library_chunks`, `library_permissions`, `library_index_jobs`

#### Python / indexing

- Library indexing pipeline with provider selection
- `LIBRARY_VECTOR_PROVIDER` environment-based resolution
- stable vector ID generation for Library chunks
- `chroma`, `pgvector`, and `cloudflare_vectorize` indexing adapters

#### pgvector groundwork

- generic `PgVectorStore`
- pgvector migration work for tenant-scoped Library vectors
- internal reindex/scope propagation API

### 6.2 What Is Not Complete

- no canonical Library pgvector adapter
- no query endpoint or provider-native query path for Library pgvector
- no provider-complete lifecycle wiring
- no compatibility-safe test matrix proving Chroma remains unaffected

---

## 7. Architectural Decision Summary

This spec makes the following explicit decisions.

### 7.1 Decision A: pgvector Integration Must Be Additive and Opt-In

- Default Library provider remains `chroma`.
- pgvector is enabled only when explicitly configured.
- Chroma code paths remain intact and are not rewritten as part of the pgvector rollout.

### 7.2 Decision B: Library Must Use a Dedicated pgvector Adapter

Do **not** force Library integration directly through the current generic `PgVectorStore` as-is.

Reason:

- its ID assumptions do not match `vector_ref_id`
- its generic `vector_documents` schema conflicts with tenant-scoped Library needs
- Library needs explicit lifecycle behaviors and metadata guarantees

Instead, introduce a **Library-specific pgvector adapter/store** that is canonical for Library vector indexing and retrieval.

### 7.3 Decision C: `library_chunk_vectors` Becomes the Canonical pgvector Table for Library

For Library retrieval, the canonical postgres-backed vector table will be:

- `library_chunk_vectors`

The older generic `vector_documents` path remains available for other future use cases if needed, but it is **not** the source of truth for Library RAG.

### 7.4 Decision D: Stable `vector_ref_id` Remains the Cross-Provider External Identifier

For all providers, the externally meaningful vector identifier remains:

```text
lib:{tenant_id}:{item_id}:{chunk_index}
```

This value is stored in:

- `library_chunks.vector_ref_id`
- Chroma vector IDs
- pgvector `library_chunk_vectors.vector_ref_id`
- provider audit logs

### 7.5 Decision E: `library_search_v1` Remains Stable

Backends may change internally, but the consumer-facing search contract stays the same.

---

## 8. Proposed Target Architecture

### 8.1 High-Level Flow

```text
Frontend
  -> tRPC library.search
  -> Node LibrarySearchService
  -> Provider-aware library retrieval adapter
     -> Chroma compatibility path OR pgvector native path
  -> Normalize to library_search_v1
  -> Return to caller
```

### 8.2 Provider Separation Model

The provider split for Library must be:

- `chroma`
  - preserves current Chroma-compatible behavior
  - may remain relational-compat scoring initially if that is the deployed behavior
- `pgvector`
  - must use direct native vector retrieval from postgres
  - must support hybrid search with provider-native vector scoring
- `cloudflare_vectorize`
  - remains supported by abstraction, but not the main focus of this feature

### 8.3 New Internal Components

#### Node.js

1. `LibraryVectorProviderResolver`
   - resolves active provider for Library query and lifecycle operations

2. `LibrarySearchBackend`
   - common orchestration layer for query execution
   - chooses provider-native execution path
   - normalizes result payload into `library_search_v1`

3. `LibrarySearchCompatibilityAdapter`
   - wraps the current deterministic relational path for Chroma/default compatibility mode

#### Python

1. `LibraryPgVectorStore`
   - dedicated store for `library_chunk_vectors`
   - upsert/search/delete/get-by-ids/update-metadata methods

2. `LibraryVectorSearchService`
   - provider-native search orchestration
   - query embedding
   - hybrid score merge
   - metadata filters
   - tenant and scope filtering

3. Internal search API
   - Node can call Python for pgvector-native Library retrieval

---

## 9. Canonical Data Model

### 9.1 Existing Stable Relational Link

`library_chunks` remains the canonical relational record for Library chunk metadata and content provenance.

Required fields already conceptually matter:

- `id`
- `tenant_id`
- `library_item_id`
- `chunk_index`
- `content`
- `vector_ref_id`
- `allowed_scopes`
- `metadata`

### 9.2 Target `library_chunk_vectors` Schema

The dedicated Library pgvector table should be extended or recreated to include all fields needed for true lifecycle and query behavior.

```sql
CREATE TABLE library_chunk_vectors (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(36) NOT NULL,
  library_item_id INTEGER NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  library_chunk_id INTEGER NOT NULL REFERENCES library_chunks(id) ON DELETE CASCADE,
  vector_ref_id VARCHAR(128) NOT NULL UNIQUE,
  chunk_index INTEGER NOT NULL,
  chunk_content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(chunk_content, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, library_item_id, chunk_index)
);
```

### 9.3 Why `vector_ref_id` Must Be First-Class in pgvector

Without `vector_ref_id` stored directly in postgres vector rows:

- scope propagation by Library chunk reference becomes brittle
- delete/reindex cannot reliably target the right vectors
- cross-provider invariants break

### 9.4 Metadata Contract

Each vector row metadata must include at minimum:

```json
{
  "tenant_id": "t_123",
  "item_id": 456,
  "chunk_id": 789,
  "chunk_index": 2,
  "content_type": "text",
  "token_count": 312,
  "allowed_scopes": ["tenant", "user:42"],
  "source": "library_item:456",
  "provider_version": "pgvector_v1"
}
```

### 9.5 Embedding Dimension Policy

For pgvector Library storage, the initial production contract is:

- fixed dimension: `1536`
- preferred embedding model family: OpenAI-compatible 1536-dim model
- any future dimension change requires explicit migration + full reindex

This keeps pgvector schema deterministic and avoids ambiguous mixed-dimension rows.

### 9.6 Full-Text Language Policy

The initial schema examples use PostgreSQL full-text search primitives, but Library content in SmartSpecPro may contain:

- English
- Thai
- mixed-language metadata
- model/provider labels
- filenames and structured identifiers

Therefore the planning phase must not assume English-only FTS behavior.

Minimum requirement:

- keyword scoring for pgvector-native Library search must define an explicit multilingual strategy

Acceptable first-rollout options:

1. `simple` text search configuration for broad tokenization compatibility
2. per-document language routing when reliable language metadata exists
3. hybrid fallback where keyword score is partly derived from relational metadata/token overlap when native FTS is weak for the content language

Whichever option is selected in implementation, it must be:

- deterministic
- covered by tests for English and Thai content
- documented in rollout notes so operators understand search behavior

---

## 10. Search Contract and Backend Semantics

### 10.1 External Contract

`library_search_v1` remains unchanged.

Expected response shape:

```json
{
  "version": "library_search_v1",
  "query": "launch deck",
  "total": 12,
  "limit": 20,
  "offset": 0,
  "has_more": false,
  "results": [
    {
      "item_id": 123,
      "item_type": "document",
      "title": "Launch deck",
      "combined_score": 0.91,
      "keyword_score": 0.84,
      "vector_score": 0.96,
      "attach_payload": {
        "item_id": 123,
        "item_type": "document",
        "title": "Launch deck",
        "source": "upload"
      }
    }
  ]
}
```

### 10.2 Internal Search Semantics by Provider

#### Chroma / compatibility mode

- preserve current deployed semantics unless a future feature explicitly upgrades Chroma query behavior
- continue deterministic result shaping
- continue ACL and tenant enforcement in Node

#### pgvector / native mode

- embed query at request time
- retrieve top candidate chunks from `library_chunk_vectors`
- apply tenant filter in backend query
- apply metadata/scope filters in backend query
- aggregate chunk results up to item-level results
- compute:
  - `vector_score`
  - `keyword_score`
  - `combined_score`
- normalize ordering and payload to `library_search_v1`
- maintain explicit language-aware or language-safe keyword scoring semantics per Section 9.6

### 10.3 Item-Level Aggregation Rules

When multiple chunks from the same item match:

- item `vector_score` = max vector score among visible chunks
- item `keyword_score` = max keyword score among visible chunks
- item `combined_score` = deterministic weighted merge over chosen item-level scores

Initial target weighting:

- `combined_score = 0.55 * vector_score + 0.45 * keyword_score`

This may be tuned later, but the contract must remain deterministic.

### 10.4 Tie-Breaking Rules

Tie-breaking order remains:

1. `combined_score` desc
2. `keyword_score` desc
3. `vector_score` desc
4. `createdAt` desc
5. `id` asc

---

## 11. Detailed Technical Design

### 11.1 Provider Resolution

Provider resolution precedence for Library should be:

1. explicit system setting, if present
2. explicit environment override
3. default `chroma`

Valid providers:

- `chroma`
- `pgvector`
- `cloudflare_vectorize`

Unknown provider values must resolve safely to `chroma`.

### 11.1.1 Provider Cutover State Model

Provider selection alone is not sufficient for a safe migration from Chroma-backed reads to pgvector-backed reads.

The system must model cutover state explicitly.

Minimum internal state:

- `write_provider`
- `read_provider`
- `dual_write_enabled`
- `cutover_status`
- `last_backfill_started_at`
- `last_backfill_completed_at`
- `last_readiness_check_at`

Recommended `cutover_status` values:

- `idle`
- `backfill_required`
- `backfill_running`
- `readiness_pending`
- `ready_for_cutover`
- `cutover_complete`
- `degraded`
- `rolled_back`

Required safety rules:

1. Switching `write_provider` to `pgvector` must not automatically switch `read_provider`.
2. `read_provider=pgvector` is only allowed after readiness gates pass.
3. `dual_write_enabled=true` may be used during migration, but the active read path must remain explicit.
4. If `cutover_status` is `degraded`, the system must not silently pretend pgvector is healthy.
5. Rollback from `read_provider=pgvector` to `read_provider=chroma` must be a first-class supported operation.

Readiness gates before `read_provider` can become `pgvector`:

1. migration applied successfully
2. pgvector extension present
3. provider health check passing
4. canary read/write smoke checks passing
5. backfill/reindex completion threshold reached
6. regression tests or operator verification complete

### 11.2 Dedicated Python `LibraryPgVectorStore`

Create a new store with a Library-specific API, for example:

```python
class LibraryPgVectorStore:
    async def initialize(self) -> None: ...
    async def upsert_chunks(self, chunks: list[LibraryChunkVectorInput]) -> list[str]: ...
    async def delete_by_vector_refs(self, vector_ref_ids: list[str]) -> int: ...
    async def delete_by_item(self, tenant_id: str, library_item_id: int) -> int: ...
    async def update_metadata_by_vector_refs(
        self,
        vector_ref_ids: list[str],
        metadata_patch: dict[str, Any],
    ) -> int: ...
    async def search(
        self,
        *,
        tenant_id: str,
        query_text: str,
        query_embedding: list[float],
        allowed_scope_filters: list[str] | None,
        limit: int,
        offset: int,
    ) -> list[LibraryPgVectorSearchRow]: ...
```

### 11.3 Why Not Reuse Generic `PgVectorStore` Directly

Generic `PgVectorStore` can remain in the repo, but it should not be the Library integration foundation because:

- its `doc_id` handling assumes UUID-shaped identifiers
- its schema is not the tenant-scoped Library migration schema
- its CRUD methods are document-generic rather than chunk-relational
- changing it aggressively risks regressions in future non-Library consumers

### 11.4 Query API Between Node and Python

Add a new internal Python endpoint, for example:

```text
POST /api/internal/library/search
```

Request shape:

```json
{
  "tenant_id": "t_123",
  "query": "launch deck",
  "limit": 20,
  "offset": 0,
  "filters": {
    "itemType": "document",
    "ownerUserId": 7
  },
  "actor_context": {
    "user_id": 7,
    "tenant_role": "user",
    "group_ids": [44]
  },
  "requested_scopes_hint": ["tenant", "user:7", "group:44"],
  "correlation_id": "lib-search-req-123"
}
```

Response shape:

```json
{
  "provider": "pgvector",
  "query_embedding_model": "text-embedding-3-small",
  "matches": [
    {
      "item_id": 123,
      "chunk_id": 456,
      "vector_ref_id": "lib:t_123:123:2",
      "vector_score": 0.93,
      "keyword_score": 0.81,
      "combined_score": 0.876,
      "matched_content": "..."
    }
  ]
}
```

Node remains responsible for:

- final item hydration from relational tables
- passing authenticated actor context to the internal API
- final ACL enforcement as defense-in-depth
- final `library_search_v1` formatting

Python remains responsible for:

- query embedding
- vector-native retrieval
- vector/keyword candidate scoring
- authoritative backend-side tenant and scope filtering
- validating actor context from an authenticated internal request
- treating any precomputed scope list from Node as advisory only, never authoritative

### 11.5 Search Compatibility Strategy

To avoid Chroma regression during rollout:

- `library.search` stays in Node as the stable entrypoint
- only the pgvector branch delegates to Python native search
- Chroma branch can keep the current compatibility implementation until a future dedicated Chroma-native retrieval improvement

### 11.5.1 Degraded Mode and Fallback Policy

Fallback behavior must be explicit rather than implicit.

Required policy:

1. If `read_provider=chroma`, the current compatibility path is authoritative.
2. If `read_provider=pgvector` and pgvector health checks are failing before a request is served:
   - the system must mark the provider state as degraded
   - the request path must follow an explicit configured fallback policy
3. Supported fallback policies should be documented as configuration, for example:
   - `fail_closed`: return an internal error / unavailable state for native pgvector reads
   - `fallback_to_chroma`: serve compatibility results and mark response path as degraded internally
4. The implementation must not silently fall back without:
   - emitting telemetry
   - structured log entry
   - operator-visible degraded state

Default recommendation:

- before cutover completion: `fallback_to_chroma` is acceptable
- after cutover completion in strict environments: `fail_closed` may be preferred to avoid stale or policy-drifted results

### 11.6 Indexing Path

For pgvector provider:

1. Library item is chunked
2. embeddings are generated
3. `vector_ref_id` values are deterministically built
4. vector rows are upserted into `library_chunk_vectors` using those exact IDs
5. `library_chunks.vector_ref_id` is stored with the same IDs
6. reindex first removes stale vectors for the item, then writes the new set

### 11.7 Delete Path

Provider-complete delete behavior must be implemented:

1. soft delete / delete job identifies all affected `vector_ref_id`s
2. provider-specific backend vectors are deleted
3. relational chunk rows are deleted
4. audit/log metrics are emitted

The delete operation is considered incomplete if vector backend cleanup is skipped.

### 11.8 Scope Propagation Path

Permission/scope changes must propagate to the active provider:

- Chroma: metadata update by IDs
- pgvector: `metadata = metadata || patch`, plus explicit `allowed_scopes` update
- Cloudflare: delete/reinsert fallback if required

Internal APIs must pass concrete provider instances or delegate into a provider resolver so metadata propagation actually executes.

### 11.9 Reindex / Backfill Path

The system must support:

- single-item reindex
- tenant-wide reindex
- provider migration backfill

For switching from Chroma to pgvector:

1. enable pgvector provider in configuration
2. run pgvector migration verification
3. enqueue full Library reindex
4. monitor indexing completion
5. switch search reads to pgvector only after completion gate passes

### 11.10 Concurrency, Idempotency, and Job Ordering

Library indexing and deletion can be triggered by:

- upload/create flows
- explicit reindex
- permission/scope changes
- delete/soft-delete flows
- provider migration backfills

The implementation plan must include explicit concurrency rules.

Minimum requirements:

1. All provider write operations must be idempotent for the same `vector_ref_id`.
2. Reindex operations for a single `(tenant_id, library_item_id)` must not race uncontrolled.
3. Delete must win over stale index jobs for the same item.
4. Scope propagation must not recreate deleted vectors.
5. A later successful reindex must replace stale vectors deterministically.

Recommended mechanisms:

- per-item dedupe keys for queue jobs
- per-item advisory lock or equivalent serialized execution
- optimistic version check using item/job timestamps
- monotonic operation ordering recorded in audit metadata

Minimum race-condition test cases:

1. reindex and delete enqueued concurrently
2. two reindex jobs for the same item
3. scope update during reindex
4. rollback to Chroma while pgvector backfill is still running

---

## 12. Backward Compatibility Requirements

### 12.1 Chroma Safety Requirements

The following must remain true after this feature ships:

1. A deployment with `LIBRARY_VECTOR_PROVIDER=chroma` continues to index and search without requiring pgvector.
2. A deployment with no pgvector extension installed still boots and serves the app normally.
3. Existing Library search tests for the current contract keep passing.
4. Existing episodic memory behavior remains untouched.

### 12.2 Additive Migration Requirements

pgvector migrations must:

- be additive
- not run destructive schema changes against Chroma-only installs
- not block deployments when pgvector is intentionally unused

### 12.3 Rollback Requirements

If pgvector search causes production issues:

- operator can switch Library provider back to `chroma`
- `library.search` immediately returns to compatibility path
- no frontend changes are needed
- existing Library rows remain intact

---

## 13. Migration Design

### 13.1 Schema Migration

Create a dedicated migration that ensures `library_chunk_vectors` is the complete canonical table for Library pgvector usage.

Migration responsibilities:

1. create extension if available and enabled
2. create or alter `library_chunk_vectors`
3. add:
   - `library_chunk_id`
   - `vector_ref_id`
   - `chunk_content`
   - `search_vector`
4. create indexes:
   - tenant/item
   - unique `vector_ref_id`
   - pgvector ANN index
   - GIN `search_vector`
5. preserve or create RLS policies

### 13.2 Preflight Checks

Before pgvector-native mode can be enabled:

1. postgres extension availability verified
2. migration applied
3. embedding dimension configuration verified
4. internal write/read smoke check passes

### 13.3 Data Migration / Backfill

No destructive data migration from Chroma is required.

Instead:

- pgvector is backfilled from relational Library sources through reindex jobs
- Chroma remains intact until cutover is explicitly completed

---

## 14. Rollout Strategy

### 14.1 Phased Rollout

#### Phase 0: Compatibility Guardrails

- add provider-aware search abstraction
- keep Chroma as default
- add feature flags and telemetry

#### Phase 1: Canonical pgvector Storage

- implement `LibraryPgVectorStore`
- finalize `library_chunk_vectors` schema
- wire pgvector indexing/upsert/delete lifecycle

#### Phase 2: Native pgvector Query Path

- add internal Python search endpoint
- add provider-native pgvector retrieval path
- normalize into `library_search_v1`

#### Phase 3: Scope + Reindex + Migration Hardening

- fix permission propagation
- finish provider-complete delete/reindex flows
- add full backfill tooling and operator runbook

#### Phase 4: Validation and Controlled Adoption

- run test matrix across Chroma and pgvector
- canary with a pgvector-enabled environment
- document rollback switch

### 14.2 Feature Flags / Runtime Controls

Recommended flags/settings:

- `LIBRARY_VECTOR_PROVIDER`
- `LIBRARY_PGVECTOR_ENABLED`
- `LIBRARY_SEARCH_NATIVE_BACKEND_ENABLED`
- `LIBRARY_PGVECTOR_REQUIRE_HEALTHY_READS`

Behavior:

- if pgvector feature is disabled or unhealthy, resolve to safe provider behavior
- do not silently half-enable pgvector query mode

---

## 15. Observability Requirements

### 15.1 Required Metrics

- `library.vector.index.started_total`
- `library.vector.index.completed_total`
- `library.vector.index.failed_total`
- `library.vector.search.requests_total`
- `library.vector.search.failed_total`
- `library.vector.delete.completed_total`
- `library.vector.scope_propagation.completed_total`
- `library.vector.provider.active`

All metrics must tag:

- provider
- tenant_id when appropriate
- operation

### 15.2 Required Structured Logs

For each provider operation, log:

- provider
- tenant_id
- library_item_id when applicable
- chunk count
- vector_ref_ids count
- query latency
- result count
- error class/message on failure

The following must **not** be logged in raw form:

- full query text unless explicitly redacted and sampling-approved
- full chunk content
- embedding vectors
- raw matched document excerpts beyond a short safe preview

If previews are operationally necessary, they must be:

- truncated
- sanitized for control characters
- clearly marked as preview-only

### 15.3 Admin/Operator Visibility

Add or extend admin diagnostics so operators can see:

- active provider
- pgvector health
- extension present / missing
- indexed vector count
- pending reindex jobs
- last successful search timestamp

---

## 16. Security and Isolation Requirements

### 16.1 Tenant Isolation

pgvector queries must be tenant-scoped by default.

Minimum protections:

- `tenant_id` filtering in every query
- RLS retained or strengthened for postgres-native table
- no cross-tenant fallback query behavior

### 16.2 Scope / ACL Enforcement

The system must not return chunk candidates that fail scope checks.

Backend-side filtering should support:

- owner
- tenant-wide
- user-specific
- group-specific

Trust-boundary rule:

- Python must not trust a caller-supplied `allowed_scopes` list as authoritative access control input

Instead, Python must do one of the following:

1. recompute effective scope filters from trusted actor identity and DB state, or
2. validate a signed/verified internal actor context from Node and derive effective scope filters from that

Node-side ACL filtering remains defense-in-depth, not the only enforcement layer.

### 16.3 Internal API Security

New internal Library search endpoints must use the same internal auth model as existing internal endpoints:

- proxy token or equivalent authenticated server-to-server mechanism
- no public exposure

Additional requirements:

- internal requests must carry a correlation ID for auditability
- the Python side must reject malformed or incomplete actor context
- the Python side must reject tenant-mismatched actor context

### 16.4 RLS and Database Session Safety

If `library_chunk_vectors` uses PostgreSQL row-level security, the runtime contract must be explicit.

Minimum requirements:

1. every pgvector request must set tenant session context explicitly, for example via `SET LOCAL app.current_tenant_id = ...`
2. application roles used for pgvector queries must not bypass RLS
3. connection-pool reuse must not leak prior tenant session state into later requests
4. privileged migration/setup paths must be separated from normal query roles

Required negative tests:

- cross-tenant select blocked
- cross-tenant update blocked
- cross-tenant delete blocked
- tenant context reset correctly across pooled requests

### 16.5 Data Minimization and Content Exposure

Because vector search deals with Library content directly, the implementation must minimize unnecessary duplication and exposure of sensitive content.

Minimum requirements:

1. storing `chunk_content` in pgvector schema must be explicitly justified as required for keyword search or preview generation
2. if full `chunk_content` is stored, retention and exposure rules must match Library access rules
3. internal APIs must return only the minimum excerpt needed for result shaping or UI preview
4. logs, metrics, and error traces must never contain full document bodies
5. any returned `matched_content` or preview text must be truncated and sanitized

Planning follow-up must decide whether:

- full chunk text is stored in pgvector, or
- only searchable/minimized text is stored and authoritative content is read from `library_chunks`

---

## 17. Testing Strategy

### 17.1 Unit Tests

#### Node

- provider resolver behavior
- `library.search` result normalization
- fallback behavior when pgvector is disabled/unhealthy
- Chroma compatibility path unchanged

#### Python

- `LibraryPgVectorStore` upsert/search/delete
- metadata patching by `vector_ref_id`
- item-level aggregation logic
- query endpoint auth and validation

### 17.2 Integration Tests

#### Chroma matrix

1. provider `chroma`
2. pgvector extension unavailable
3. Library search still works
4. indexing still writes stable `vector_ref_id`
5. application boots normally without pgvector-specific credentials
6. no hidden dependency on pgvector migration state

#### pgvector matrix

1. provider `pgvector`
2. extension installed
3. indexing writes rows to `library_chunk_vectors`
4. `vector_ref_id` matches between `library_chunks` and pgvector rows
5. direct query path returns `library_search_v1`
6. delete removes backend vectors
7. scope update changes visible candidates
8. RLS protections block cross-tenant access
9. degraded-mode behavior matches configured fallback policy

### 17.3 End-to-End Tests

At least one authenticated flow should cover:

1. upload document
2. indexing completes
3. search returns uploaded item
4. permission narrowed
5. search no longer returns unauthorized item
6. item deleted
7. search no longer returns item

### 17.4 Regression Tests

Existing tests that must remain green:

- `server/services/libraryService.test.ts`
- `server/services/librarySearchService.test.ts`
- `server/routers/library.test.ts`

Additional provider-specific tests must be added rather than replacing current ones.

### 17.5 Security Regression Tests

The implementation must add tests covering:

1. forged or malformed internal actor context is rejected
2. caller-supplied scope hints cannot expand access
3. cross-tenant searches return zero unauthorized results
4. fallback mode cannot bypass ACL or tenant filters
5. logs do not emit raw chunk content or embeddings

---

## 18. Acceptance Criteria

This feature is complete only when all of the following are true.

### 18.1 pgvector Completeness

1. A pgvector-enabled deployment can:
   - index Library chunks
   - search Library chunks natively
   - update vector metadata after scope changes
   - delete vectors during delete/reindex flows

2. `library.search` uses direct pgvector retrieval when provider is `pgvector`.

3. `library_chunks.vector_ref_id` and pgvector `vector_ref_id` always match.
4. pgvector read cutover is gated by explicit readiness state, not by provider value alone.

### 18.2 Chroma Safety

1. A Chroma-backed deployment runs without pgvector extension.
2. Search behavior remains functional under `chroma`.
3. Existing compatibility tests still pass.
4. Chroma mode does not require pgvector migration state or runtime health.

### 18.3 Operator Readiness

1. There is a documented enablement flow.
2. There is a documented rollback flow.
3. Reindex progress can be observed.
4. Provider health is diagnosable.
5. Degraded-mode behavior is diagnosable and operator-visible.

---

## 19. Proposed File Impact Areas

### 19.1 Node.js / TypeScript

- `apps/web/server/services/libraryService.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/*library*search*`
- `apps/web/server/services/systemSettings*`
- `apps/web/server/services/admin*` or diagnostics surfaces
- tests under `apps/web/server/services/` and `apps/web/server/routers/`

### 19.2 Python

- `python-backend/app/services/library_indexing_service.py`
- `python-backend/app/api/internal_library.py`
- `python-backend/app/orchestrator/rag/scope_engine.py`
- `python-backend/app/orchestrator/vector_store/` or new Library-specific module
- `python-backend/migrations/` for canonical Library pgvector migration
- Python tests for migrations, stores, internal API, and lifecycle

### 19.3 Database / Schema

- Library pgvector migration(s)
- potential Drizzle-side metadata or diagnostics support if needed

---

## 20. Risks

### 20.1 High Risk

1. Accidentally coupling Chroma installs to pgvector startup requirements.
2. Breaking `library_search_v1` semantics during backend refactor.
3. Inconsistent IDs causing orphaned or unaddressable vector rows.

### 20.2 Medium Risk

1. Divergence between Node ACL logic and Python scope filtering.
2. Reindex load spikes during cutover.
3. Mixed assumptions about embedding dimension.

### 20.3 Mitigations

1. Keep Chroma path intact and explicit.
2. Use provider-aware adapter layers instead of hard replacement.
3. Make `vector_ref_id` canonical everywhere.
4. Gate pgvector query mode behind health checks and feature flags.
5. Require provider matrix tests before enabling by default in any environment.

---

## 21. Open Questions for the Planning Phase

These should be resolved in the subsequent implementation plan, but they do not block writing this spec.

1. Should the pgvector query path aggregate item-level scoring in Python or in Node after receiving chunk matches?
2. Should Chroma stay on the current compatibility search path, or should a later follow-up add true Chroma-native retrieval for parity?
3. Should provider selection come from system settings only, env only, or a formal precedence rule shared by both runtimes?
4. Should pgvector query mode support exact keyword-only search in postgres, or only hybrid/vector modes at first rollout?
5. Should `library_chunk_vectors` store the full `chunk_content` always, or a truncated searchable text plus relational join back to `library_chunks`?

---

## 22. Definition of Done

This feature is considered done when:

1. The repository contains a canonical Library pgvector design with a dedicated storage path.
2. pgvector can be enabled without breaking Chroma-only installs.
3. Library query-time retrieval for pgvector is real, native, and end-to-end.
4. Lifecycle operations are provider-complete.
5. Tests prove both pgvector functionality and Chroma non-regression.
6. Operators have rollout and rollback confidence.

---

## 23. Recommended Planning Follow-Up

The next planning artifact should break this feature into implementation phases with explicit ownership and test gates:

1. Canonical schema + store decision finalization
2. Provider-safe search adapter introduction
3. pgvector-native query path
4. lifecycle completion
5. test matrix + rollout runbook

That follow-up plan should assume this spec as the source of truth for:

- backward compatibility rules
- canonical identifiers
- canonical pgvector table choice
- rollout strategy
- acceptance criteria
