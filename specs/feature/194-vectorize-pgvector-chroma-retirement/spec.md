# Feature 194 — Vectorize Workload Search and Legacy Vector Store Retirement

**Status:** In progress — automatic gate-controlled cutover implemented; production target proof remains required
**Created:** 2026-09-15
**Priority:** High
**Estimated scope:** Large, cross-runtime, multi-phase data migration
**Depends on:** Feature 186, Feature 187, Feature 192

## 1. Executive Summary

SmartAIHub currently contains several overlapping vector-storage paths:
Cloudflare Vectorize, multiple PostgreSQL/pgvector tables, a generic Python
vector store, Node runtime vector tables, Python Chroma collections, and a Kilo
SQLite embedding path. Keeping all of them alive creates operational ambiguity,
duplicate indexing, inconsistent embedding dimensions, orphan vectors, and
unbounded storage growth.

This feature moves approved semantic-search workloads to a small set of shared,
versioned Cloudflare Vectorize indexes, then retires unused pgvector, Chroma,
generic vector-store, and other vector-only infrastructure through a gated
decommission process.

The rebuild source is always the canonical domain record in SQL and the
canonical file or artifact referenced by R2. Existing embedding values and
vector payloads from pgvector, Chroma, generic vector tables, or SQLite are
never migration input. Legacy stores are inspected only to identify active
callers, stale/orphan data, retention requirements, and retirement evidence.
The word “migration” in this specification means changing the search projection
and read path; it does not mean moving legacy vector payloads. A legacy row that
contains text, captions, or a file path is not canonical merely because it is
non-vector data in a vector-owned table. It must be mapped to an independently
verified SQL/R2 owner before it can be used for a rebuild.

The feature also makes vector search materially more useful than title/name
matching. It supports:

- Text-to-image search, for example “ภาพกระต่าย” or “ภาพผู้หญิง”.
- Text-to-video search using captions, visual labels, OCR, ASR, and indexed
  time segments.
- Image-to-image/product-image search by attaching a reference image.
- Returning canonical PostgreSQL/R2 records and video time ranges after
  Vectorize returns matching IDs.

PostgreSQL remains the source of truth for domain data, ownership, ACLs,
content, indexing state, and migration checkpoints. R2 remains the source of
truth for files and durable artifacts. Vectorize stores only the rebuildable
semantic retrieval projection: embeddings, stable IDs, bounded metadata, and
the selected namespace.

This feature does not drop any table or delete any Chroma data until the
retirement gates in this specification pass. “No longer used at runtime” and
“safe to delete permanently” are separate states.

## 2. Problem Statement

### 2.1 Current storage is fragmented

The repository has at least these persistent or runtime-owned vector paths:

| Area | Current path | Intended disposition |
|---|---|---|
| Library chunks | `library_chunk_vectors` with 384D pgvector | Read `library_chunks` and R2 again; create new embeddings; never read old vector values; drop vector projection table after retention |
| Generic Python store | `vector_documents`, `vector_collections`, `embedding_jobs` | Prove all callers; rebuild active source records from SQL/R2 or approve as unused; drop unused structures |
| Node provider adapter | `smartspec_vector_entries` with JSON metadata and vector arrays | Retire after all Node reads/writes use Vectorize |
| Conversation chunks | `message_chunks.embedding` at 1536D | Keep canonical chunk/content table; move embedding projection to Vectorize; remove embedding column/index only after cutover |
| Scoped memories | `scoped_memories.embedding` at 1536D | Keep memory/content/ACL table; move embedding projection; remove embedding column/index only after cutover |
| Agency memories | `agency_agent_memories`, `agency_memory_chunks` embeddings | Keep domain memory records; move vector projection; remove only vector storage that is replaced |
| Multimodal memories | `multimodal_memory_vectors` at 768D | Read canonical multimodal records/files again and rebuild by modality; drop vector-only table after replacement is proven |
| Python Chroma | `episodic_memories`, `code_snippets`, `conversation_history`, tenant collections, social archive collections | Rebuild from canonical SQL/R2 or receive explicit legacy approval; stop writes; remove service/volume/files after retention |
| Kilo memory | SQLite embedding blob path | Inventory Worker App callers; rebuild from canonical source or explicitly approve; remove only after evidence |
| pgvector extension | PostgreSQL `vector` extension | Drop only after no vector columns, indexes, functions, migrations, or active clients remain |

The exact current inventory is maintained in
[`ops/feature-187/vectorize-readiness-manifest.yaml`](../../../ops/feature-187/vectorize-readiness-manifest.yaml).
The manifest currently identifies thirteen source families; only four have a
Vectorize contract ready and the remaining sources are explicit migration
gates.

Existing Vectorize indexes are also legacy projections for this feature. Before
creating any new workload index, the Feature 187 manifest must map each current
index to exactly one disposition: `reuse_with_contract`, `rebuild_then_retire`,
or `retire_unused`. A `rebuild_then_retire` disposition reads canonical SQL/R2
again and never copies vectors from the old Vectorize index. No old and new
index may remain active for the same source family without a named read/write
owner, retention deadline, and retirement gate.

### 2.2 Existing dimensions cannot be copied into one target index

The legacy paths contain 384-, 768-, and 1536-dimensional embeddings. The
target index contract currently uses
`@cf/baai/bge-base-en-v1.5` at 768 dimensions. A legacy vector must not be
read as rebuild input, cast, padded, truncated, or otherwise resized to fit a
new index. The rebuild must read canonical content/files, generate new
embeddings with the target model, and record the resulting
model/dimension/version in PostgreSQL.

An embedding model, dimension, metric, chunking strategy, and normalization
policy together form the vector schema. A model change creates a new index
version and a new backfill/canary cycle; it never mutates the dimension of an
existing Vectorize index.

### 2.3 Current media search is not sufficient

The existing web adapter can embed document text and image descriptions, and
the Vertical Drama path can retrieve indexed media evidence. However, the
target contract must explicitly distinguish:

1. Text-to-media retrieval: text query against indexed captions/descriptions,
   labels, OCR, ASR, and metadata.
2. Image-to-media retrieval: an attached image is embedded or transformed by a
   documented multimodal query path using the same compatible model contract as
   the indexed media.
3. Video retrieval: a result identifies the source asset and the relevant
   segment/time range, not merely the video title.

Returning a title match or an unverified URL is not acceptance of semantic
media search.

## 3. Goals

### 3.1 Primary goals

1. Establish a small, versioned, workload-oriented Vectorize topology:

   ```text
   smartaihub-knowledge-v1
   smartaihub-media-v1
   smartaihub-agent-memory-v1
   ```

   The final number of indexes may be smaller or larger only when justified by
   model dimensions, modality, query behavior, isolation, or provider limits.
   One index per user or tenant is prohibited by default.

2. Define a consistent boundary model:

   - native Vectorize `namespace` for an intentional partition, normally
     `tenant:<tenant_id>` for private tenant data or `global` for explicitly
     shared data;
   - metadata filters for `tenant_id`, `user_id`, `workspace_id`, `plugin_id`,
     `source_family`, `source_id`, `asset_id`, and ACL/scope fields;
   - server-derived authorization for every query, mutation, and delete.

3. Add a PostgreSQL vector projection registry that records at least:

   ```text
   embedding_model
   embedding_dimensions
   embedding_version
   metric
   vector_index
   namespace
   indexed_at
   content_hash
   ```

   It must also retain the canonical source identity, vector ID, tenant
   ownership, source revision, indexing status, and last mutation/checkpoint
   evidence.

4. Make semantic image and video retrieval useful in real product flows:

   - text queries retrieve visually or semantically matching images and video
     segments;
   - an attached product image retrieves visually similar product images;
   - video results return source asset IDs and relevant timestamps;
   - result hydration reads canonical data from PostgreSQL/R2 before returning
     user-facing content.

5. Rebuild active vector workloads from canonical SQL/R2 source data, with
   resumable checkpoints, deterministic IDs, mutation reconciliation, canary
   reads, and a bounded rollback window. Legacy vector values are never copied
   into the new provider.

6. Retire unused vector systems and vector-only structures without deleting
   canonical content, ACLs, media assets, audit records, or recovery evidence.

7. Prevent migration bloat by rebuilding only eligible canonical source rows.
   The backfill must never mean “copy every row from every vector table”, and
   must never read an old embedding as the new embedding input. It
   excludes orphan vectors, deleted/unpublished source rows, expired memories,
   duplicate legacy projections, rows with no active reader, and stale index
   versions outside the approved retention window.

### 3.2 Secondary goals

- Remove duplicate indexing paths and provider-selection ambiguity.
- Make storage growth attributable by workload, index version, tenant, and
  source family.
- Make model upgrades an explicit re-index operation rather than an implicit
  dimension failure.
- Reduce operational dependencies by removing unused Chroma services, volumes,
  packages, tables, indexes, and environment variables after the gates pass.

## 4. Non-Goals

This feature does not:

1. Replace PostgreSQL or R2 as the canonical data stores.
2. Store full document text, full image files, or full video files in
   Vectorize.
3. Create a separate Vectorize index for every user, tenant, workspace, or
   plugin unless an approved isolation requirement proves it necessary.
4. Drop a domain table merely because it contains an embedding column.
5. Delete legacy data during the backfill phase.
6. Claim production readiness from local mocks, local index contracts, or
   health checks without target-account evidence.
7. Guarantee pixel-perfect image identity from text captions alone. The
   selected image-to-image strategy must be documented and tested against a
   representative product-image set.
8. Migrate all thirteen source families in one deployment or one database
   migration.

## 5. Design Principles and Invariants

### 5.1 Data ownership

- PostgreSQL/domain tables own content, identity, tenant ownership, ACLs,
  deletion decisions, source revisions, and migration state.
- R2 owns file bytes and durable artifacts.
- Vectorize owns only a rebuildable search projection.
- A Vectorize result is never sufficient authorization to return content.
- Every result must be hydrated and authorized from PostgreSQL/R2.

### 5.2 Index topology

An index represents a stable workload and embedding contract, not an account
boundary. Each index has a registry entry containing:

```text
index_name
workload
embedding_model
embedding_dimensions
embedding_version
metric
supported_modalities
namespace_policy
metadata_indexes
active_read_version
active_write_version
retention_until
```

The initial logical mapping is:

| Workload index | Initial source families | Notes |
|---|---|---|
| `smartaihub-knowledge-v1` | library chunks, web documents, later approved text knowledge | Same chunking/model contract required; distinguish source family in metadata/namespace |
| `smartaihub-media-v1` | web images, product images, Vertical Drama media, later approved video segments | Must support text-to-media; image-to-image requires a compatible multimodal contract |
| `smartaihub-agent-memory-v1` | conversation chunks, scoped memories, agency memories, episodic memories | Rebuild from canonical memory/content records only after privacy scope and retention semantics are proven |

If two source families need incompatible dimensions or incompatible modality
models, they must use separate versioned indexes rather than mixed vectors.
The index name and its vector schema are immutable after creation. A model,
dimension, metric, modality, or normalization change creates a new explicit
name (for example `smartaihub-media-visual-v2`) and a separate backfill; it
must never mutate `smartaihub-media-v1` in place. A workload may therefore have
paired indexes such as media-text and media-visual when text and image query
vectors are not mathematically compatible. The registry must state which query
modes each index supports and which index is used for each mode.

### 5.3 Namespace and metadata boundaries

Cloudflare native namespace is a partition within an index. The implementation
must choose and document one deterministic policy per workload. The default
policy is:

```text
private tenant data: namespace = tenant:<tenant_id>
global/shared data:  namespace = global
```

`global` is allowed only for a canonical record whose sharing policy explicitly
permits the requesting scope. It must never be selected merely because a tenant
ID is missing, and a namespace is never an authorization decision by itself.
Shared/marketplace records still carry their canonical ACL or visibility class
and are re-authorized during hydration. A private record with unresolved tenant
ownership is ineligible and fails closed.

Every vector also carries bounded metadata sufficient for defense-in-depth and
canonical hydration:

```text
tenant_id
user_id                 optional
workspace_id            optional
plugin_id               optional
source_family
source_id
chunk_id                optional
asset_id                optional
media_type              optional
source_revision
content_hash
embedding_version
```

Metadata indexes must be limited to properties actually used by query and
privacy paths. The implementation must account for Vectorize metadata-index
limits and string-index truncation when defining IDs and authorization fields.
The contract must publish an allowlist of indexed metadata fields and the
provider-account limit used by the deployment; adding a field requires a
versioned contract review. Long IDs, labels, and derived text are stored in
PostgreSQL/R2 and referenced by bounded values, never pushed wholesale into
metadata.

The server must derive namespace and filters from authenticated/request-scoped
authority. Client-supplied tenant, namespace, or plugin values cannot widen
the search scope. The query contract must reject missing scope rather than
silently substituting `global`, and must test a private-record-versus-global
negative case for every workload.

### 5.4 Embedding schema

The registry and each projection record must make the following immutable for a
given vector version:

```text
embedding_model
embedding_dimensions
embedding_version
metric
chunking_version
normalization_version
```

The write path rejects a dimension/model mismatch before any provider mutation.
If the model changes, the system creates a new index version, backfills from
canonical content, canary-reads it, and only then changes the active version.
The contract also requires a multilingual capability probe using representative
Thai and English queries before claiming Thai semantic search. The current
`@cf/baai/bge-base-en-v1.5` default cannot be assumed to satisfy Thai or
cross-language retrieval; the implementation must either select an evaluated
multilingual model/index version or explicitly mark unsupported languages.

### 5.5 Migration eligibility and anti-bloat rules

Before any backfill, produce an eligibility snapshot per source family. A row
is eligible only when:

- it is reachable from an active canonical PostgreSQL domain row or an approved
  R2 artifact;
- its tenant/ACL authority can be resolved from the canonical source;
- it belongs to an approved source family and target workload;
- it is not deleted, unpublished, expired, quarantined, or superseded;
- its content hash and source revision can be calculated deterministically;
- it is not already represented by an equivalent active projection record.

Each snapshot must include a unique `snapshot_id`, database high-water mark or
transaction boundary, scan timestamp, R2 object version/ETag for file-backed
records, and the source-adapter/chunking version. Mutations committed after
that boundary are not silently ignored: they are captured by the canonical
mutation stream or a bounded second scan and must converge before canary.

For file-backed sources, the canonical locator is an internal R2 bucket/key (or
an equivalent server-side artifact identity), not a client URL. `content_hash`
must be calculated from canonical file bytes or a documented normalized
derived-artifact payload plus source revision; it must not be based only on a
mutable URL. Captions, OCR, ASR, and vision labels are derived artifacts and
must each carry their own producer/model/version and input hash in SQL or R2.

Legacy vector payloads may be queried for inventory and orphan detection only.
They must never provide the embedding values, searchable text, captions, ACLs,
or file URLs used to build the new projection.

The backfill report must show, per source family:

```text
canonical_rows_seen
eligible_rows
excluded_orphans
excluded_deleted_or_expired
excluded_duplicates
vectors_to_write
vectors_written
vectors_reconciled
```

The expected Vectorize count is derived from `eligible_rows`, chunk/segment
policy, and the selected embedding version—not from the raw count of any old
pgvector or Chroma table. Any unexplained target count increase blocks the next
wave and triggers reconciliation.

## 6. Semantic Media Search Design

### 6.1 Text-to-image search

The indexing pipeline builds a bounded searchable representation from the
canonical image record and available derived data:

- filename/title and product/category metadata;
- vision-generated description and subject labels;
- OCR text when present;
- optional brand, color, style, and product attributes;
- tenant/workspace/plugin ownership metadata.

The text query is embedded with the same compatible text model as the indexed
representation. The result returns an asset ID, score, source revision, and
bounded display metadata; the service then hydrates the canonical image from
PostgreSQL/R2.

Acceptance examples include queries equivalent to “rabbit image”, “woman
portrait”, and product attributes that do not occur in the filename.

Before backfill, each workload and query mode must publish an evaluation
contract containing fixture version, language set, `k`, metric (for example
Recall@k/NDCG@k), minimum threshold, negative-isolation cases, and an owner who
approves the threshold. Thresholds are not inferred after seeing migration
results; a failed evaluation keeps that workload/mode out of `active`.

### 6.2 Image-to-image/product search

The product-search contract accepts an authenticated image attachment and
supports one of these implementations:

1. Preferred: a production-supported multimodal/image embedding model with a
   documented dimension and image-to-image parity between index and query.
2. Transitional: image → vision description → text embedding, explicitly
   labeled as semantic caption similarity rather than pixel/visual embedding.

The transitional path may not be declared complete for exact product-image
similarity until a representative evaluation set proves acceptable recall.
The target index/model contract must be selected by a target capability probe;
it must not silently mix image vectors with 768D text vectors.
For the requested “attach a product image and find the same product/variants”
flow, completion requires the preferred image-to-image path (or an explicitly
approved model with equivalent visual semantics). Caption-only retrieval may be
released as a separately labeled fallback, but cannot satisfy the visual
similarity acceptance criterion.

The request path must validate MIME type, byte limit, tenant scope, and rate
limit. The uploaded query image is transient and must not be persisted unless
the product explicitly requests it.

### 6.3 Text-to-video and video-segment search

The video indexing pipeline creates searchable segments, not one opaque vector
for the entire video. Depending on source availability, each segment may use:

- sampled keyframes and visual labels;
- ASR transcript;
- OCR text;
- scene/action/object labels;
- title, tags, and asset metadata.

Video processing is asynchronous and bounded by a declared maximum duration,
keyframe sampling rate, segment count, transcript/OCR size, and per-asset retry
budget. Identical `(asset_id, source_revision, content_hash, pipeline_version)`
inputs are deduplicated and do not create another set of vectors. Derived
keyframes, captions, OCR, and ASR outputs are stored as versioned artifacts with
their input hash; a missing or stale derived artifact blocks that modality or
uses an explicit fallback status instead of silently indexing guessed text.

Each vector record includes:

```text
asset_id
segment_id
start_ms
end_ms
media_type=video
content_hash
source_revision
```

The segment boundary, keyframe references, transcript/OCR/label artifact
identities, and their provenance are canonical derived records in PostgreSQL
or R2. They must be queryable by `asset_id` and `source_revision` during
hydration; Vectorize metadata is only an optimization. If a segment artifact
cannot be resolved or its input hash is stale, the result is suppressed (or
the affected modality is marked unavailable) rather than returning a guessed
timestamp.

A search for “rabbit” may return a video asset with the matching 12.4–18.1
second segment. The response must preserve the asset-level authorization check
and must not expose a stale or deleted R2 object.

### 6.4 Ranking and hydration

Vectorize provides candidate IDs and similarity scores. The application then:

1. validates tenant/namespace/filter scope;
2. deduplicates by canonical asset/source where appropriate;
3. fetches canonical PostgreSQL rows and R2 references;
4. removes deleted, unpublished, stale-revision, or unauthorized records;
5. optionally combines lexical, structured, and semantic scores;
6. returns only the documented user-facing result shape.

The public search contract documents `mode=text|image`, maximum query-image
size/type, top-k and per-asset result limits, and a response containing the
canonical `source_id`/`asset_id`, score, media type, and optional video
`start_ms`/`end_ms`. Result grouping must prevent one video or asset with many
segments from crowding out other authorized assets.
It also defines a server-enforced maximum `top_k`, minimum score/quality rule,
bounded cursor pagination, stable ordering for equal scores, empty-result and
partial-hydration behavior, and a request deadline. Results that cannot be
hydrated and authorized before the deadline are omitted with an observable
count; Vectorize metadata is never returned as a substitute.

The Vectorize metadata must not be treated as the authoritative title, URL,
ACL, or file location.

## 7. PostgreSQL Schema and Projection Registry

### 7.1 New canonical projection records

Add a normalized PostgreSQL projection registry, provisionally named
`vector_index_records`, for all Vectorize-backed source families. The exact
Drizzle/SQLAlchemy name may change during implementation only with an impact
review.

Required logical fields:

```text
id
tenant_id
user_id                  nullable
workspace_id             nullable
plugin_id                nullable
source_family
source_table
source_id
chunk_id                 nullable
asset_id                 nullable
vector_id
vector_index
namespace
embedding_model
embedding_dimensions
embedding_version
metric
chunking_version
content_hash
source_revision
indexed_at
last_mutation_id         nullable
input_hash                nullable
source_locator_kind       nullable
status                   queued|indexing|indexed|stale|delete_pending|deleted|failed
failure_code             nullable
created_at
updated_at
```

Required constraints/indexes:

- unique `(vector_index, vector_id)` so the database matches the provider's
  index-level ID identity; deterministic IDs must include enough source scope
  to remain unique when the same source key exists in multiple namespaces;
- deterministic `vector_id` is derived from the immutable tuple
  `(vector_index, namespace, source_family, source_id, chunk_or_segment_id,
  source_revision, embedding_version)`; retries update the same projection and
  never append a second vector for the same tuple;
- index `(vector_index, namespace)` for namespace-scoped reconciliation;
- lookup by `(tenant_id, source_family, source_id)`;
- lookup by `(tenant_id, content_hash, embedding_version)`;
- lookup by `(vector_index, status)` for reconciliation;
- lookup by source revision for stale-vector cleanup;
- foreign keys to canonical domain rows where the source table is stable;
- no full source content or secret/token material in the projection registry.

The registry is the authoritative projection ledger for rebuild/delete/
reconciliation, not a replacement for canonical content, ACL, or file bytes;
Vectorize remains the provider projection. A delete tombstone or newer source
revision must fence an older in-flight job, so a late retry cannot recreate a
deleted or superseded vector.

Provider mutations must use a durable projection-mutation record or equivalent
outbox with an idempotency key and attempt state. The PostgreSQL transaction
may commit the intent and registry state before the provider call, but must not
remain open across a provider request. A crash can therefore be resumed by
reconciliation in either direction: provider-visible without registry
confirmation is adopted only after canonical ownership/revision checks, while
registry intent without provider visibility is retried with the same ID. Only
the confirmed/reconciled state may become `indexed` or `deleted`.

### 7.2 Existing table treatment

The implementation must classify every existing structure before changing it:

| Structure | Required action |
|---|---|
| `library_chunks` | Keep content, ownership, ACL, and chunk identity. Move vector lifecycle fields to the registry where possible; retain compatibility references only during the migration window. |
| `library_chunk_vectors` | Read `library_chunks`/R2 and rebuild from canonical content; never read its `embedding` values; verify no readers/writers; retain only for rollback/retention evidence; then drop table, HNSW/B-tree indexes, policies, and migration references. |
| `vector_documents` | Trace every caller and physical owner. Content in this table is not canonical by default; rebuild only after mapping each active record to an independently verified SQL/R2 source, otherwise freeze, archive evidence, drop indexes/table, and remove generic model/store path. |
| `vector_collections` and `embedding_jobs` | Drop only after proving they are not used by a non-vectorize workflow or job scheduler. |
| `smartspec_vector_entries` | Retire Node pgvector adapter storage after all provider switches and callers are Vectorize-only; remove auto-create behavior. |
| `message_chunks` | Keep message-range/content/tenant/user/project data. Remove only embedding-specific column/index after its Vectorize projection is active and rollback retention ends. |
| `scoped_memories` | Keep memory content, owner, visibility, scope, expiry, and ACL data. Remove only embedding-specific column/index after migration. |
| `agency_agent_memories`, `agency_memory_chunks` | Keep domain memory records and retention semantics. Remove or transform only vector-specific storage after agency retrieval is proven. |
| `multimodal_memory_vectors` | Rebuild by modality/model contract from canonical multimodal records/files; drop only if the replacement registry fully preserves required provenance and retrieval behavior. |
| Chroma collections/files/volume | Inventory both service volumes and every configured local `PersistentClient`/`CHROMA_PERSIST_DIR` root; stop collection creation and writes; rebuild each approved collection from canonical SQL/R2, or explicitly approve it as legacy; remove package/service/volume/files only after retention and proof gates. |
| Kilo SQLite embeddings | Inventory Worker App usage; rebuild from canonical source or explicitly approve; delete only after runtime release and recovery evidence. |
| PostgreSQL `vector` extension | Drop last, only when no remaining vector column, index, function, migration, ORM import, or runtime connection depends on it. |

Dropping a table is never a substitute for deleting an embedding column from a
domain table, and deleting an embedding column is never allowed to delete the
canonical content in that row.

## 8. Canonical Rebuild and Retirement State Machine

Each source family and index version has an independently recorded state:

```text
inventoried
  → contract_defined
  → target_created
  → backfill_running
  → backfill_verified
  → dual_write
  → canary_read
  → active
  → legacy_read_disabled
  → retention_hold
  → deletion_approved
  → permanently_retired
```

Failure or ambiguous evidence moves the source to `operator_review`; it must
not silently advance to deletion.

Source-family state is independent from workload-index state. A workload may be
marked `active` only for the explicitly listed source families that have passed
their own backfill, hydration, ACL, and canary gates; pending families are
excluded at the read router and remain visibly `pending` in the manifest. A
pending family must not block an unrelated workload, but it also must not be
silently treated as covered by the workload's active label.

### Phase 0 — Freeze scope and inventory

- Freeze new additions to legacy provider paths unless explicitly required for
  rollback.
- Inventory imports, provider resolution, environment variables, migrations,
  compose services, scheduled jobs, background workers, admin actions, tests,
  and direct table queries.
- Inventory the actual runtime storage roots, including Chroma service volumes,
  local persistent directories, SQLite files, backup copies, and any mounted
  Worker App paths. Record which process can read or recreate each root; a
  compose volume inventory alone is not proof that local persistent storage is
  covered.
- For every source family, record canonical table, source ID, content/file
  location, tenant/ACL authority, current readers, current writers, current
  dimensions/model, vector count, and retention requirement.
- Identify dead/duplicate stores separately from stores that still contain
  domain content.
- Assign exactly one disposition to every source family and physical store:
  `rebuild_from_canonical`, `retire_unused`, or
  `retain_legacy_until` with a named owner, reason, expiry timestamp, and
  replacement/read-path decision. `retain_legacy_until` is a temporary
  exception, not permission to import its vectors or extend the deadline
  implicitly. A source with no verifiable SQL/R2 owner cannot be rebuilt and
  must be explicitly approved for retirement or bounded legacy retention.
- For every legacy row selected for inspection, record `canonical_source_type`,
  `canonical_source_locator`, and `owner_verification_evidence`. An unmapped
  row may be counted as orphan/legacy evidence but may not enter the rebuild.
- Reconcile all four current Feature 187 Vectorize indexes and every later
  index against the Feature 194 workload registry. Record whether each is
  reused, rebuilt from canonical SQL/R2 and retired, or unused; an index absent
  from that disposition list blocks creation of a replacement index.
- Trace every semantic read path, including hybrid/lexical RAG engines,
  background retrieval, tool/plugin search, admin previews, and fallback code.
  Each path must be wired to the approved Vectorize workload or receive an
  explicit non-vector disposition; a provider factory default or in-memory
  fallback is not evidence that the old store is unused.

### Phase 1 — Define contracts and registry

- Add the vector index registry and projection record schema.
- Define workload index names, namespace policy, metadata indexes, model,
  dimensions, metric, chunking, and version.
- Add fail-closed validation for missing tenant scope, missing source identity,
  unsupported dimensions, and model/index mismatch.
- Define media evaluation fixtures for text-to-image, image-to-image, and
  video-segment retrieval.
- Record the evaluation contract and baseline for every activated workload,
  modality, and supported language before generating the first backfill batch.
- Make the Feature 187 readiness manifest the signed/versioned rollout source
  for index names, model contracts, source dispositions, feature flags, and
  evidence links. A checksum/config drift between the manifest, deployed Node,
  Python, Worker App, and target account blocks activation.

### Phase 2 — Build target indexes and semantic pipelines

- Create target indexes only in the approved Cloudflare account and only after
  the existing-index disposition is recorded. Do not create a second index as
  an untracked compatibility copy.
- Create metadata indexes before backfill and verify their target behavior.
- Implement text/image/video source adapters that read canonical data from
  PostgreSQL/R2.
- Add native namespace to upsert, query, get, and delete contracts.
- Keep Vectorize metadata bounded and free of full documents or secrets.
- Define one versioned cross-runtime contract for IDs, namespace encoding,
  metadata names/types, filter semantics, status/error codes, and hydration
  response shape. Node, Python, and Worker App adapters must pass the same
  contract fixtures; casing or serialization differences cannot create a second
  implicit schema.

### Phase 3 — Resumable canonical rebuild/re-embedding

- Read canonical source rows in stable batches.
- Build and approve the eligibility snapshot before generating embeddings.
- Capture the snapshot boundary and replay all source mutations after that
  boundary through the same deterministic projection path; a completed row
  count alone is not proof of coverage.
- For file-backed records, resolve and read the authoritative R2 object or
  server-side artifact locator; never persist or fetch a user-supplied or
  signed URL as the canonical source, and do not use an old vector payload as a
  substitute. Any external fetch must be disabled unless the source is an
  explicitly allowlisted managed artifact.
- Re-chunk/re-embed using the target contract; do not transform, import, or
  reuse old pgvector/Chroma/SQLite embeddings.
- Write deterministic IDs and projection registry records in PostgreSQL.
- Commit a durable mutation intent before the provider call and reconcile
  provider-visible/registry-missing and registry-visible/provider-missing
  states without opening a long database transaction.
- Persist source checkpoint, content hash, source revision, and mutation ID.
- Set `indexed_at` only after the provider mutation is confirmed visible (or
  reconciled by a read-after-write check); dispatch time alone is not proof that
  the projection is indexed.
- Retry only bounded transient operations using the same deterministic IDs.
- Reconcile stale vectors when chunks/assets disappear or revisions change.
- Record `legacy_vector_values_read=0` for the rebuild job. Do not delete legacy
  vectors during the initial canonical rebuild.
- Enforce a resumable job budget for batch size, concurrency, embedding calls,
  provider writes, video duration/keyframes, and estimated spend. A budget
  breach pauses the job and requires operator resume; it must not continue by
  creating unbounded vectors. Provide a dry-run report before each source
  family is enabled.

### Phase 4 — Dual-write and parity observation

- New/updated canonical rows write the Vectorize projection and registry record.
- If rollback requires the legacy provider, legacy writes may remain enabled only
  for newly changed canonical rows during the bounded rollback window; this is
  compatibility maintenance, not migration of old vector data.
- Compare old/new result identity, tenant isolation, deletion behavior, and
  hydration success without issuing duplicate paid/provider side effects.
- Record per-index coverage, stale count, missing registry rows, failed
  mutations, latency, and semantic-media evaluation results.

### Phase 5 — Workload/tenant canary cutover

- Switch reads for one workload and bounded canary population at a time.
- Require tenant-positive and tenant-negative tests, namespace tests, ACL
  tests, source revision tests, delete replay, and provider outage behavior.
- Once the server-side target probe, canonical snapshot campaign, projection
  coverage, projection parity, and reconciliation checks pass, promote the
  read provider immediately in the same control-plane flow. No second manual
  approval click is required.
- A campaign being `completed` means only that all eligible canonical records
  were enqueued; automatic promotion must additionally wait until the
  Vectorize registry shows acknowledged projections with no failed or pending
  source records.
- Rollback changes the read provider only; it does not rewrite canonical rows
  or erase committed history.
- Keep the old index/table available for the declared retention window.
- The retention window must be a non-null, environment-specific duration and
  `retention_until` must be recorded per source/index target before canary
  begins; “until migration is done” is not an acceptable value.

### Phase 6 — Legacy runtime retirement

- Disable legacy readers and writers through configuration and code paths.
- Remove automatic creation of legacy tables, collections, indexes, locks, and
  fallback files.
- Remove old admin provider choices and misleading stats only after the
  migration registry reports no active legacy source.
- Replace legacy provider settings with workload/index status, dry-run,
  pause/resume, reconciliation, and deletion-manifest actions. Destructive
  actions require an operator role, typed exact-target confirmation, and an
  audit event; there is no “delete all vectors” fallback.
- Release and observe the new runtime before destructive cleanup.
- Roll out in a backward-safe order: registry/read-path code that can observe
  both states, target index and rebuild workers, canonical mutation writers,
  canary readers, then legacy-reader/writer disablement. Node, Python, and
  Worker App releases must report the same contract version before a source
  family is canaried.
- Remove implicit provider fallback from every semantic read path. During the
  declared rollback window, fallback is an explicit, observable provider choice
  for the affected workload only; after retirement, an outage is reported as a
  Vectorize failure and does not revive Chroma/pgvector automatically.

### Phase 7 — Destructive cleanup

Only after every gate passes:

- freeze legacy writes, stop new legacy jobs, and drain or cancel in-flight
  readers/reconcilers;
- take and verify the approved backup/PITR checkpoint;
- export the retirement manifest and row/count/hash evidence, then deploy the
  code/configuration that removes legacy readers, writers, and auto-creation;
- re-scan the deployed artifact and database catalog for the exact target;
- delete provider data and Chroma/SQLite physical roots named in the manifest;
- drop vector-only tables/indexes and remove vector columns from retained domain
  tables where approved;
- remove unused packages, compose services, volumes, env vars, and provider
  configuration;
- add a forward-only cleanup migration for the current schema. Never rewrite or
  delete an already-applied historical migration; remove the pgvector extension
  last, after the forward migration and import/catalog audit pass;
- retain the migration manifest, checksums, rollback evidence, and audit record;
- verify a clean deployment starts without recreating retired structures.

After permanent retirement, rollback means restoring canonical SQL/R2 data and
rebuilding a new Vectorize projection or index version. It must not restore a
deleted legacy provider as an undeclared runtime dependency.

Retirement also requires a bounded garbage-collection policy for superseded
Vectorize indexes, obsolete derived media artifacts, and deleted projection
rows. Audit evidence (IDs, hashes, counts, approvals, and timestamps) is
retained separately from searchable payloads; it must not preserve full private
content or create an unbounded registry. The exact old Vectorize index names,
metadata indexes, namespaces, and provider deletion results must appear in the
retirement manifest alongside pgvector/Chroma/SQLite targets.

## 9. Deletion and Safety Gates

Permanent deletion requires all of the following for the exact target:

1. No production reader, writer, scheduler, worker, migration, admin action,
   test fixture, or fallback path references the target.
2. The source family is `active` on the replacement index or has an explicit,
   auditable `legacy_explicitly_approved` disposition with a named owner,
   reason, and unexpired `retention_until`; that exception never authorizes
   importing a legacy vector payload.
3. PostgreSQL/R2 canonical content and ACLs are present and queryable.
4. Projection registry coverage is complete for the approved source snapshot.
5. New-index semantic, tenant-negative, namespace, ACL, delete, update, and
   stale-revision tests pass.
6. The target index/table has passed the retention window and rollback is no
   longer required.
7. Backup/PITR or export verification has completed and the restore procedure
   is documented.
8. No in-flight embedding/reconciliation job can recreate the retired target.
9. An operator-approved deletion manifest names exact tables, indexes,
   collections, files, volumes, packages, and environment variables.
10. A post-delete check proves the retired structures are absent and are not
    recreated by startup, migrations, or scheduled jobs.

Missing, partial, cross-tenant, or ambiguous provider evidence fails closed and
requires operator review. No cleanup command may use an unresolved wildcard,
whole workspace path, or unverified database target.

## 10. Failure Handling and Recovery

- Provider 429/5xx/network failures use bounded retry with deterministic IDs.
- Unknown asynchronous mutation results are reconciled by mutation ID and
  source checkpoint; the system does not blindly duplicate or delete.
- A model/dimension mismatch fails before upsert and marks the projection
  `failed` with a stable error code.
- Missing canonical source rows cause stale-vector reconciliation, not content
  reconstruction from Vectorize metadata.
- Cross-tenant results, namespace mismatch, missing ownership, or ambiguous
  deletion evidence fail closed.
- If Vectorize is unavailable during an active rollout, reads return to the
  previous provider only while the rollback window is open; the system does
  not silently fall back to an unrelated vector store.
- Once `retention_until` has passed and the exact target is permanently retired,
  the previous provider is no longer a rollback target; recovery uses the
  canonical rebuild path and a new projection version.
- A failed destructive cleanup is recoverable from the backup/export and must
  not be retried until the exact failure is understood.

## 11. Security and Privacy

- Tenant/user/workspace/plugin authority is derived on the server.
- Every write and query carries a verified namespace and tenant metadata.
- Every delete correlates vector ID, namespace, tenant, source ID, and current
  canonical ownership before mutation.
- Image attachments are size/MIME/rate limited and are not persisted by the
  search path unless explicitly requested.
- Vectorize metadata contains no secrets, raw private documents, unnecessary
  signed URLs, or unbounded user content.
- Tenant deletion, user deletion, workspace deletion, plugin uninstall, and
  source deletion must enqueue and reconcile all projection records.
- Audit logs record migration state, operator approval, target, counts, and
  evidence references without storing credentials or raw private content.

## 12. Observability and Capacity

Track by index, namespace, workload, source family, and embedding version:

- canonical source count;
- projection-record count;
- Vectorize vector count and coverage percentage;
- stale/missing/orphan vector count;
- pending/failed mutation count;
- backfill checkpoint age and throughput;
- query latency, provider error rate, and fallback rate;
- text-to-media and image-to-media recall evaluation;
- evaluation metric/threshold, fixture version, language, and top-k result for
  each workload/mode;
- storage growth before and after legacy retirement.
- backfill budget consumption, embedding/provider call counts, per-asset
  segment/vector cardinality, and estimated cost;

The system must alert when Vectorize count grows without corresponding
canonical source growth, when repeated content hashes create duplicate
projection records, or when an old index receives writes after retirement
freeze.
It must also alert on budget exhaustion, unexpected per-asset segment growth,
metadata-index or quota rejection, and any legacy physical root that remains
mounted after its deletion gate claims completion.

## 13. Verification Plan

### 13.1 Static and schema verification

- Search all runtimes for legacy imports, provider names, env vars, table names,
  Chroma collection names, compose services, migrations, and direct SQL.
- Verify every source family has `rebuilt_from_canonical` evidence or an
  explicit legacy approval; a legacy-vector import is never valid evidence.
- Verify each of the thirteen manifest families has one named owner, canonical
  source locator, eligibility snapshot, target index/version, outcome, and
  evidence link. “Not found” or “probably unused” is an operator-review state,
  not a deletion approval.
- Verify schema migrations are additive until the destructive cleanup phase and
  that retained domain tables still contain canonical content and ACLs.
- Verify index registry uniqueness and no index-per-tenant/user creation path.
- Verify applied migration history was preserved and any cleanup is represented
  by a new forward-only migration.

### 13.2 Contract tests

- Model/dimension/metric mismatch is rejected before mutation.
- Native namespace and metadata filters are applied on upsert/query/delete.
- Tenant-positive, tenant-negative, user, workspace, plugin, and ACL tests pass.
- Deterministic IDs make replays idempotent.
- Mutation IDs and asynchronous visibility are reconciled safely.
- Result hydration rejects deleted, stale, or unauthorized canonical rows.
- Node/Python/Worker App adapters pass identical namespace, metadata, filter,
  ID, error, and hydration contract fixtures.

### 13.3 Semantic media tests

Use a versioned, non-sensitive evaluation fixture containing known labels and
near-neighbor negatives:

- text “rabbit” retrieves rabbit images above unrelated images;
- text “woman portrait” retrieves matching subject images without relying on
  filenames;
- an attached product image retrieves the same product family and visually
  similar variants using the approved visual/multimodal path; a caption-only
  fallback is reported separately and cannot pass this visual test;
- Thai and English equivalents of the representative media queries meet the
  declared per-workload recall threshold, or unsupported-language behavior is
  explicit and fail-closed;
- text queries retrieve video segments with the expected object/subject and
  return correct timestamps;
- OCR/ASR-only matches and visual-only matches are both tested;
- tenant/workspace/plugin filters never return another scope's asset.

### 13.4 Migration and retirement tests

- Backfill resumes from a checkpoint after process/provider/database failure.
- Rebuild telemetry proves `legacy_vector_values_read=0` and records the SQL/R2
  source snapshot used for every target projection.
- Content mutation changes the content hash and replaces stale vectors.
- Delete/update replay converges without orphan vectors.
- Canary rollback returns to the old provider without losing canonical IDs.
- A representative database restore preserves source rows, registry records,
  and replayable checkpoints.
- A restore rehearsal also verifies R2 object versions/ETags and derived media
  artifacts, then replays one projection without reading a legacy vector.
- Destructive cleanup operates only on an exact approved target list.
- A failed or incomplete source family blocks only its own target wave but never
  authorizes bulk cleanup of other sources; every deletion remains exact,
  source-scoped, and independently evidenced.
- A clean start after cleanup does not recreate retired tables or Chroma
  collections.

### 13.5 External evidence

Local tests do not prove the target Cloudflare account. Before activation and
before deletion, capture target-account evidence for:

- index dimensions, metric, namespace, and metadata indexes;
- write, query, get, delete, and asynchronous mutation visibility;
- cross-tenant and namespace-negative queries;
- 429/5xx/ambiguous mutation recovery;
- rebuild coverage and checkpoint replay;
- R2/PostgreSQL hydration;
- backup/PITR and deployment rollback.
- target-account quota/budget behavior and the pause/resume kill switch;
- absence of legacy imports, mounts, startup creation, scheduled writes, and
  applied-migration rewrites after cleanup.

## 14. Acceptance Criteria

1. SmartAIHub has a documented workload-index registry and does not create one
   Vectorize index per tenant or user by default.
2. Every active Vectorize projection has model, dimensions, version, index,
   namespace, content hash, and indexed timestamp recorded in PostgreSQL.
3. No incompatible embedding dimensions coexist in one index/version.
4. Text-to-image and text-to-video work against representative fixtures without
   relying only on title/name matching, and attached-image product search passes
   the approved visual/multimodal evaluation. A caption-only fallback is not
   counted as visual product similarity.
5. Video results identify canonical assets and relevant time segments.
6. Vectorize results are hydrated and authorized from PostgreSQL/R2.
7. All thirteen source families have a named owner and a rebuild result:
   rebuilt from canonical SQL/R2 data with proof, or explicitly approved by an
   operator to remain on a named legacy store with a retention/deletion plan.
8. Legacy readers/writers and automatic legacy-store creation are disabled
   before destructive cleanup.
9. Vector-only tables, columns, indexes, Chroma collections/services/volumes,
   and unused dependencies are removed only after the retention, backup,
   caller-inventory, and deletion-approval gates pass.
10. Canonical content, media files, ownership, ACLs, audit history, and
    recovery evidence remain intact.
11. A clean deployment and migration verification prove retired structures are
    not recreated.
12. Feature 186/187/192 readiness status remains truthful: local contract
   readiness is not reported as target-account or production proof.
13. Cross-runtime contract fixtures, multilingual media evaluation, processing
    budgets, and post-retirement no-recreation checks pass for every activated
    workload.
14. Every superseded Feature 187 Vectorize index has an explicit reuse,
    rebuild-and-retire, or retire-unused outcome; no untracked index or broad
    cleanup target remains.

## 15. Implementation Deliverables

### 15.1 Current implementation checkpoint (2026-09-15)

Completed in the current phase:

- PostgreSQL/Drizzle projection registry with model, dimension, metric,
  namespace, source identity, content hash, source revision, status, and
  mutation evidence; no embedding-value column is introduced.
- Python and Node contract helpers for the 768D BGE schema and tenant
  namespace boundary.
- Library indexing integration that records queued intent before a Vectorize
  mutation and indexed/failed reconciliation state afterward. It continues
  to rebuild from canonical SQL content while preserving the R2 locator
  contract; legacy vector payloads remain out of scope.
- Node and Python provider resolution now read saved Vectorize credentials and
  workload index names from the database, while treating the provider setting
  as preparation state unless a governed switch-state row authorizes the
  active read provider. Native namespaces are derived from tenant authority
  and checked against tenant metadata/filter scope before provider calls.
- Vectorize data-plane authentication is separate from Workers AI
  embedding/vision authentication: `VECTORIZE_API_TOKEN` is never reused as
  `CLOUDFLARE_AI_API_KEY`; the latter must be provided independently before
  embedding-based rebuild or media evaluation can proceed.
- The Admin Settings connection test can test a prepared Vectorize knowledge
  index using saved credentials without activating it; it fails closed on a
  dimension or metric mismatch. After a cutover request, server-side health
  polling and successful index-job completion re-evaluate the gates and
  activate Vectorize immediately when they pass.
- The admin cutover request now re-reads the saved Vectorize target from
  `system_settings`, probes the remote index, validates 768D/cosine, and
  verifies the referenced canonical campaign is completed before entering the
  staged switch state. Health diagnostics use the same DB-backed provider
  resolution, so the UI cannot report a Cloudflare target merely because an
  old switch row or unrelated environment variable exists.
- Admin tRPC now exposes the cutover state/request/approval bridge, and the
  Settings action stages a verified request when a campaign is available. The
  active read provider is promoted automatically after the server measures a
  completed campaign, full registry coverage/parity, zero reconciliation
  drift, and a successful target probe; the legacy approval route remains a
  backward-compatible server-evaluation endpoint, not a manual authority.
- Node provider configuration cache is invalidated after Vector DB settings,
  cutover request, and cutover approval mutations, so an approved switch is
  observed by subsequent Node reads without waiting for the normal cache TTL.
- Canonical library backfill campaigns now persist a snapshot ID, source
  high-water mark, source-adapter version, and `legacy_vector_values_read=0`;
  subsequent batches retain the rebuild mode and cannot silently include rows
  created after the snapshot boundary.
- Added explicit rollout artifacts for the source/legacy disposition ledger and
  predeclared text-image, image-image, video-segment, and Thai/English media
  evaluation gates; these artifacts deliberately remain pending until their
  source mappings, fixtures, and target-account evidence are verified.
- Non-`pgvector` reads are now fenced by `status=cutover_complete` in the
  governed switch state across Node, Python, and Admin settings/stat paths;
  legacy or manually prepared Vectorize rows fail closed to pgvector.
- Python retry, Google Drive, and OneDrive indexing/cleanup paths now resolve
  the governed provider and credentials per tenant at execution time; a
  cutover cannot leave those background paths writing to an environment-only
  pgvector or Chroma provider.
- Google Drive and OneDrive Vectorize writes now use the same deterministic
  projection-registry IDs as library writes, record queued/indexed mutation
  evidence, and include bounded source/schema provenance in provider metadata.
  Source deletion also reconciles registry IDs, including provider-visible
  records whose current SQL chunk reference is missing.
- Backfill orchestration has an explicit `rebuild_from_canonical` mode that
  includes eligible records even when old chunks/vector references exist;
  ordinary missing-chunk backfill behavior remains unchanged.
- New provider-switch state defaults to `pgvector`; no existing switch-state
  row is changed by the default migration. Vectorize remains a prepared
  target until target-account tests, rebuild coverage, parity, smoke, and
  rollback gates pass; once they pass, the read switch is automatic and
  immediate, while pgvector remains available for bounded rollback.

Still intentionally gated:

- target Cloudflare index creation/verification and production-account proof;
- full media/image/video source adapters and semantic evaluation fixtures;
- complete source-family backfill, parity/canary cutover, and rollback proof;
- retirement or deletion of pgvector, Chroma, generic vector tables, or
  vector-only columns/volumes.

- Updated Vectorize index/model/namespace registry and migration manifest.
- PostgreSQL migration for the projection registry and required indexes.
- Node and Python adapter support for namespace, provenance, and canonical
  hydration.
- Text/image/video indexing and retrieval workers with bounded retries and
  checkpoints.
- Semantic media evaluation fixtures and focused tests.
- Per-source migration manifests and reconciliation reports.
- Per-source eligibility snapshots proving that old vector payloads were not
  used as rebuild input.
- Legacy caller/dependency/table/collection retirement checklist.
- Backup/PITR and destructive-cleanup runbook with operator approval record.
- Post-retirement verification proving no old store is recreated.

## 16. Related Documents

- [`Feature 186 spec`](../186-unified-job-control-plane-adapters/spec.md)
- [`Feature 187 Vectorize readiness manifest`](../../../ops/feature-187/vectorize-readiness-manifest.yaml)
- [`Feature 192 local Cloudflare readiness spec`](../192-cloudflare-local-migration-readiness/spec.md)
- [`Feature 013 historical vector database spec`](../013-VectorDatabase/spec.md)
- [`Feature 050 historical Library pgvector spec`](../050-library-pgvector-full-integration/spec.md)
