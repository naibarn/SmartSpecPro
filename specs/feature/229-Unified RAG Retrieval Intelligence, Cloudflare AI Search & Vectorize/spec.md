# Spec 229 — Unified RAG Retrieval Intelligence, Cloudflare AI Search & Vectorize V2

**Status:** Proposed / Target post-cutover retrieval architecture; partial provider/search implementation exists  
**Spec ID:** 229  
**Revision:** 3.0 — R2 canonical + 15-round production audit + media vector lifecycle  
**Target repository path:** `specs/feature/229-Unified RAG Retrieval Intelligence, Cloudflare AI Search & Vectorize/spec.md`  
**Target:** SmartAIHub / SmartSpecPro  
**Date:** 2026-09-22  
**Owner:** SmartAIHub Core Platform  
**Primary scope:** RAG, Search, Retrieval Broker, Cloudflare AI Search, Cloudflare Vectorize V2, multilingual retrieval, reranking, retrieval quality certification  
**Companion specs:** Universal Assistant / Retrieval consumers, MCP Gateway, External Agent Gateway, A2A, Workflow Studio/Runtime, Skill/Exploration/Development Runtime, Issue/Feedback automation, Library RAG  
**Supersedes:** Retrieval implementation details that assume pgvector is the production vector database. It does not retroactively rewrite already-implemented specs; consumers shall migrate to this spec through the shared Retrieval Broker contract.

---

## 0.1 Codebase alignment snapshot — 2026-09-22

Current source evidence is mixed and must not be collapsed into the post-cutover table below:

- `vectorizeContract.ts` implements a Vectorize v2 contract with `@cf/baai/bge-base-en-v1.5`, 768 dimensions, cosine metric and tenant namespace validation.
- `vectorProvider.ts` supports Chroma, pgvector and Cloudflare Vectorize with persisted provider-switch state; current resolution defaults to pgvector until an explicit cutover state is recorded.
- `vectorize-search.ts`, Library/federated search, public knowledge/RAG routes, Python hybrid-RAG and Vectorize/pgvector tests are existing retrieval surfaces.
- No canonical `RetrievalBroker`/`SAH-RETRIEVAL-2` runtime, Cloudflare AI Search provider or unified consumer migration was found in the current source tree.

Therefore this spec is a migration target with partial existing infrastructure, not proof that Cloudflare AI Search, 1024-dimensional `bge-m3` or the complete V2 broker is already active.

## 0. Executive Decision

This spec establishes one production retrieval architecture for SmartAIHub.

### 0.1 Target post-cutover technology decisions — not current codebase state

| Layer | Production technology |
|---|---|
| Canonical relational/source-of-truth metadata | Existing PostgreSQL |
| Canonical object/file storage | Cloudflare R2 |
| Canonical direct vector database | **Cloudflare Vectorize V2** |
| Primary document RAG/search plane | **Cloudflare AI Search** |
| AI Search built-in vector index | **Vectorize-backed managed index** |
| Default embedding model | **`@cf/baai/bge-m3`** |
| Embedding dimensions | **1024** |
| Vector metric | **cosine** |
| Keyword retrieval | **Cloudflare AI Search BM25** |
| Keyword tokenizer | **trigram** |
| Hybrid fusion | **Reciprocal Rank Fusion (`rrf`)** |
| Default keyword match mode | **`or`** for broad hybrid recall |
| Reranker | **`@cf/baai/bge-reranker-base`** |
| Query rewrite model | **`@cf/zai-org/glm-5.3-flash`**, enabled only when Query Planner determines rewriting is needed |
| Final answer generation | **SmartAIHub LLM Gateway**, not AI Search Chat Completions |
| RAG ingestion format | Normalized Markdown/text search projections |
| Default AI Search chunk size | **384 tokens** |
| Default chunk overlap | **15%** |
| Retrieval candidate budget | Up to **50** AI Search chunks per searched instance/set |
| Context evidence budget | Normally **8–12** reranked evidence chunks |
| Production vector provider | `cloudflare_vectorize` |
| Legacy pgvector | Migration-only rollback path, then removed |
| Public AI Search endpoint | **Disabled for private tenant RAG**; server-side binding/API only |
| Similarity response cache | **Disabled by default during migration/certification**; may be enabled later only with proven ACL-safe cache keys |

### 0.2 Mandatory architectural rules

1. **pgvector MUST NOT remain the production vector database after cutover.**
2. **PostgreSQL remains the canonical data/metadata/ACL store, not the vector store.**
3. **Document RAG MUST use Cloudflare AI Search unless a documented capability or security constraint routes the request to Direct Vectorize.**
4. **Direct Vectorize MUST be used for non-document vectors and custom vector workflows that do not fit AI Search.**
5. **All retrieval consumers MUST call the shared Retrieval Broker.**
6. **No consumer may implement its own ad-hoc `0.x * keyword + 0.x * vector` ranking after this migration.**
7. **No answer may be considered RAG-grounded unless evidence passes ACL, provenance, freshness and evidence-quality gates.**
8. **Retrieval quality MUST be certified with a reproducible benchmark before full cutover.**
9. **Thai, English, mixed Thai/English, code, error strings, paths, model names and spec identifiers are first-class retrieval cases.**
10. **Security filtering happens before evidence is exposed to a model or user.**

---

# 1. Motivation

The current repository already contains meaningful vector-search infrastructure, but retrieval behavior is fragmented and not yet suitable as the long-term production RAG architecture.

Observed current-state examples include:

- `apps/web/server/services/vectorizeContract.ts`
  - Vectorize V2 contract already exists.
  - Current embedding is `@cf/baai/bge-base-en-v1.5`.
  - Current dimension is 768.
  - Current metric is cosine.
  - Tenant Vectorize namespace support already exists.
- `apps/web/server/services/libraryService.ts`
  - Library search can call Cloudflare Vectorize.
  - Search currently combines keyword and vector score with a fixed `0.45 / 0.55` weighted sum.
  - Current local tokenizer splits on `[^a-z0-9]`, which is not acceptable for Thai retrieval.
  - pgvector and Vectorize paths coexist.
- `python-backend/app/orchestrator/vector_store/pgvector_store.py`
  - Contains an older hybrid implementation using `0.7 * vector + 0.3 * keyword`.
  - PostgreSQL full-text path uses English configuration.
- `apps/web/server/services/vectorProvider.ts`
  - Provider migration controls already exist.
  - Current logic keeps pgvector authoritative until explicit cutover.
- Library search and generic vector search use different retrieval logic.

The objective is therefore **not to add another RAG subsystem**. The objective is to consolidate retrieval into one measurable, secure and provider-governed system.

---

# 2. Goals

## 2.1 Functional goals

The system MUST:

- search Thai, English and mixed-language knowledge accurately;
- support semantic, keyword, exact/symbolic and hybrid queries;
- support follow-up questions that require query rewriting;
- handle code identifiers, UUIDs, error strings, API paths, filenames, model names and spec IDs;
- rerank initial candidates before context construction;
- preserve source provenance and citation information;
- enforce tenant, user, group, project and visibility rules;
- detect insufficient evidence and avoid fabricating a grounded answer;
- expose the same retrieval capabilities to Chat, Help, Library, workflows, agents, MCP, A2A, external harnesses and development runtimes;
- provide an admin quality/operations console;
- support safe migration from pgvector and the existing 768-dimensional Vectorize indexes.

## 2.2 Quality goals

The system MUST be measurable through:

- Recall@K;
- Hit Rate;
- MRR;
- nDCG;
- exact-identifier success rate;
- multilingual/Thai quality;
- no-answer quality;
- citation correctness;
- freshness correctness;
- ACL leakage tests;
- latency;
- cost per search;
- indexing lag;
- provider error rate.

## 2.3 Non-goals

This spec does NOT:

- replace PostgreSQL as transactional source-of-truth;
- replace R2 as durable asset storage;
- require all data to be passed to Cloudflare AI Search;
- require AI Search to generate the final user answer;
- make every query agentic;
- remove local/dev vector adapters immediately;
- redesign unrelated Library UI.

---

# 3. Terminology

**Retrieval Broker** — SmartAIHub-owned service that receives a retrieval request, resolves scope/security, chooses retrieval strategy/providers, merges evidence and returns a normalized evidence contract.

**AI Search Provider** — Cloudflare AI Search adapter used for document RAG, BM25, hybrid retrieval, RRF, query rewriting and reranking.

**Direct Vectorize Provider** — Cloudflare Vectorize V2 adapter used when direct vector operations are needed.

**Search Projection** — derived text/Markdown representation of a source item prepared for retrieval. It is not the canonical source.

**Evidence** — a retrieved chunk with provenance, ACL, version and scores that may be considered for LLM context.

**ACL Scope** — a deterministic search authorization partition such as tenant-shared, owner-private, group or explicit-share scope.

**Certification Corpus** — labeled queries plus relevant/non-relevant source judgments used to measure retrieval quality.

---

# 4. Target Architecture

```text
                         +----------------------+
                         | User / Agent / Tool  |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |  Retrieval Broker V2 |
                         +----------+-----------+
                                    |
                     +--------------+--------------+
                     |                             |
                     v                             v
          +----------------------+       +----------------------+
          | Query Planner        |       | Security Resolver    |
          | - classify intent    |       | tenant/user/group    |
          | - exact vs semantic  |       | project/visibility   |
          | - rewrite decision   |       | authorized scopes    |
          +----------+-----------+       +----------+-----------+
                     |                             |
                     +--------------+--------------+
                                    |
              +---------------------+----------------------+
              |                     |                      |
              v                     v                      v
     +----------------+    +-------------------+   +------------------+
     | Exact/Symbolic |    | Cloudflare        |   | Direct Vectorize |
     | Metadata Lane  |    | AI Search         |   | V2               |
     | PostgreSQL     |    | Document RAG      |   | Memory/custom    |
     +-------+--------+    +---------+---------+   +---------+--------+
             |                       |                       |
             |               Vector + BM25                  |
             |               Trigram tokenizer              |
             |               RRF                            |
             |               Reranker                       |
             |                       |                       |
             +-----------------------+-----------------------+
                                     |
                                     v
                         +------------------------+
                         | Evidence Normalizer    |
                         | dedup / provenance     |
                         | authority / freshness  |
                         +-----------+------------+
                                     |
                                     v
                         +------------------------+
                         | Evidence Quality Gate  |
                         +-----------+------------+
                                     |
                      +--------------+-------------+
                      |                            |
                   enough                        weak
                      |                            |
                      v                            v
            +--------------------+      rewrite / alternate source /
            | Context Builder    |      multi-query / agentic tier
            +---------+----------+
                      |
                      v
              SmartAIHub LLM Gateway
                      |
                      v
          Answer + citations + provenance
```

---

# 5. Storage Responsibilities

## 5.1 PostgreSQL

PostgreSQL remains authoritative for tenant/user/project records, Library metadata and permissions, group membership, document versions, source links, index job state, projection state, evaluation datasets/runs, trace metadata, provider configuration and migration state.

It MUST NOT be the production vector database after final cutover.

PostgreSQL MAY perform deterministic exact lookup over canonical metadata because this is relational search, not vector storage.

## 5.2 Cloudflare R2

R2 remains authoritative for uploaded/generated files, normalized parsed outputs, OCR/transcript artifacts and durable source assets.

Search projections MAY be persisted in R2 for audit/rebuild, but AI Search indexing does not depend on the original binary being directly searchable.

## 5.3 Cloudflare Vectorize V2

Vectorize becomes the only production direct vector database.

Use cases include agent/semantic memory, skill embeddings, workflow/template embeddings, capability discovery, non-document semantic entities, custom vector searches and optional fallback retrieval when AI Search is unavailable.

## 5.4 Cloudflare AI Search

AI Search becomes the primary document RAG search engine and owns managed projection indexing, the Vectorize-backed vector index, BM25 keyword index, hybrid search, RRF, metadata filtering, relevance boosting, optional query rewrite and cross-encoder reranking.

Final answer generation remains outside AI Search.

---

# 6. Cloudflare AI Search Deployment Model

## 6.1 Namespace strategy

Create environment-scoped namespaces:

- `smartaihub-prod`
- `smartaihub-staging`
- `smartaihub-dev`

Namespaces are operational groupings, not the only tenant security boundary.

## 6.2 Capacity-aware instance topology

The architecture MUST NOT assume that one tenant per AI Search instance scales forever.

Current provider constraints treated as architecture inputs:

- Workers Paid: up to **5,000 AI Search instances/account**;
- hybrid/keyword-enabled instances: up to **500,000 files/instance**;
- vector-only instances: up to **1,000,000 files/instance**;
- maximum **4 MB** per indexed file/item;
- maximum **10 instances** in one cross-instance search;
- maximum **5 custom metadata fields** per AI Search instance;
- only the first **64 UTF-8 bytes** of an indexed string are filterable.

SmartAIHub uses four logical deployment modes.

### A. Shared product knowledge

```text
shared-product-rag-v2
```

Contains Help, product documentation, approved shared platform knowledge and retrieval-safe canonical specs.

### B. Dedicated tenant instance

```text
tenant-<stable-hash>-rag-v2
```

Preferred for enterprise, regulated, high-volume or isolation-sensitive tenants.

### C. Pooled small-tenant shard

```text
tenant-pool-<shard>-rag-v2
```

Used for small/low-volume tenants where dedicated instances would waste account capacity.

Tenant isolation is enforced with opaque tenant/ACL metadata filters plus canonical PostgreSQL authorization re-check. Pooled retrieval MUST fail closed when tenant scope cannot be deterministically resolved.

### D. Oversized tenant shards

```text
tenant-<stable-hash>-rag-v2-s<N>
```

Created before a tenant approaches the safe hybrid file ceiling.

Shard assignment MUST be deterministic by source family or stable hash. A normal request SHOULD remain within:

```text
<= 9 tenant shards + 1 shared instance
```

to respect the current 10-instance cross-search ceiling.

## 6.3 Canonical route registry

Create `retrieval_instance_routes`.

It records:

```text
tenant_id
environment
topology_mode
namespace
instance_ids[]
source_class_routes
shard_policy
capacity_state
profile_version
enabled
updated_at
```

Feature code MUST NOT independently derive provider instance names.

## 6.4 Capacity guardrails

Use soft limits below provider hard ceilings:

```text
hybrid warning                 >= 350,000 projection files
hybrid rebalance target        >= 400,000 projection files
provider hybrid hard ceiling   = 500,000 files
projection soft file maximum   <= 3.5 MB
provider file hard maximum     = 4 MB
cross-instance request maximum = 10
```

Capacity forecasts MUST include ACL projection duplication, version overlap, blue/green reindex overlap, media lifecycle tiers and growth rate.

## 6.5 Public endpoints

For private tenant RAG:

- public AI Search endpoints disabled;
- server-side Worker binding or authenticated backend REST only;
- AI Search MCP endpoint MUST NOT become the authorization boundary;
- SmartAIHub MCP Gateway + Retrieval Broker remain the policy/security boundary.

---

# 7. Search Projection Model

Create `RagProjectionService`.

## 7.1 Sources

Eligible sources may include Library Markdown, parsed PDFs, Office extraction, OCR output, webpage extraction, Help, specs, workflow/Skill documentation, transcripts, media captions/summaries and approved memory summaries.

## 7.2 Output

Use normalized Markdown/text.

Security metadata MUST come from trusted SmartAIHub/provider metadata, not user-authored front matter.

## 7.3 Deterministic key

```text
rag/<tenantHash>/<sourceType>/<itemId>/<version>/<aclProjectionId>.md
```

## 7.4 Structure-aware preprocessing

Before AI Search recursive chunking:

- Markdown/specs → heading-aware;
- source code → file/class/function-aware;
- transcript/chat → turn/topic-aware;
- tables → retain headers;
- OCR/PDF → retain page/source coordinates.

## 7.5 Large files

AI Search has a 4 MB file/item hard limit. SmartAIHub uses **3.5 MB** as the projection soft maximum.

Large sources MUST split into deterministic logical projections while preserving:

- canonical source ID/version;
- page/section/time-range provenance;
- stable order;
- ACL scope;
- digest/checksum;
- deterministic rebuild identity.

A source is not fully `index_ready` until every required projection for the active version is ready.

## 7.6 Unicode and multilingual normalization

Normalization MUST NOT destroy Thai or technical identifiers.

Rules:

- preserve original text for display/citation;
- apply Unicode normalization such as NFKC only where safe;
- preserve Thai characters;
- never reduce searchable content to `[a-z0-9]`;
- preserve punctuation-significant API paths, filenames, model IDs and error strings through a protected exact-token channel;
- language detection is advisory metadata, never an exclusion rule;
- mixed Thai/English/code chunks are first-class inputs.

Thai/English/mixed-language normalization MUST have regression tests.

---

# 8. Embedding Standard

Use the pinned production profile:

```text
model      = @cf/baai/bge-m3
dimensions = 1024
metric     = cosine
profile    = bge-m3-1024-v1
```

Every indexed vector/projection state stores the profile ID.

The existing 768D Vectorize indexes cannot be converted in place. Create new `*-v2` indexes, re-embed from canonical sources, shadow-read, cut over and retire old indexes after retention.

## 8.1 Model pinning and lifecycle

Production MUST use explicit embedding/reranker/rewrite profiles. Do not rely on provider Smart Default for canonical embeddings.

If a selected provider model enters deprecation/transition:

1. open an operational migration issue;
2. define a new versioned profile;
3. provision replacement Vectorize index / AI Search instance when required;
4. backfill from canonical sources;
5. run shadow retrieval and full certification;
6. cut over blue/green only after quality/security gates pass;
7. retain rollback state for the approved window.

Reranker and rewrite model versions are governed independently from the embedding profile so they can be upgraded without re-embedding when provider semantics permit.

---

# 9. Direct Vectorize V2

Recommended production indexes:

```text
sah-knowledge-v2
sah-agent-memory-v2
sah-skills-v2
sah-workflows-v2
```

Tenant namespace:

```text
tenant:<tenant-id-or-stable-hash>
```

Use namespaces to reduce the search domain before metadata filters/top-K.

Security/scope filters supported by Vectorize MUST be applied before top-K retrieval.

Recommended metadata-index candidates include source type, project, visibility class, owner, status, language, source revision, embedding profile and timestamps, subject to the active provider limit.

## 9.1 Vectorize V2 provider constraints

Configuration validation MUST enforce:

- maximum **10 metadata indexes** per Vectorize index;
- required metadata indexes exist before ingest/backfill that depends on them;
- filter JSON remains within provider serialization limits;
- filter-critical strings are designed within the provider's 64-byte indexed prefix;
- namespace + metadata filters are never dropped to recover from errors;
- large ACL scope lists are batched;
- vector IDs, dimensions and metadata stay inside provider limits;
- production uses Vectorize V2, not deprecated V1.

Index/profile creation MUST fail before ingest if required security filter indexes are absent.

---

# 10. AI Search Instance Profile

Default profile:

```json
{
  "embedding_model": "@cf/baai/bge-m3",
  "index_method": {
    "vector": true,
    "keyword": true
  },
  "fusion_method": "rrf",
  "indexing_options": {
    "keyword_tokenizer": "trigram",
    "use_ocr": false
  },
  "chunk_size": 384,
  "chunk_overlap": 15,
  "max_num_results": 50,
  "match_threshold": 0,
  "context_expansion": 0,
  "reranking": true,
  "reranking_model": "@cf/baai/bge-reranker-base",
  "rewrite_query": false,
  "cache": false
}
```

Rules:

1. For hybrid search, `match_threshold` defaults to **0**. Cloudflare applies this threshold to **vector similarity**, not the final fused RRF score. A high threshold can discard a correct BM25 exact match before reranking.
2. Any non-zero hybrid threshold requires certification proving exact/BM25 recall is not degraded.
3. `max_num_results = 50` is the current provider maximum.
4. `context_expansion = 0` by default. Certified corpus profiles MAY use 1–3 surrounding chunks for prose-heavy content; code/log/exact-ID retrieval normally remains unexpanded.
5. Response caching stays disabled during migration/certification. Any later enablement requires ACL/tenant/version-safe cache semantics.
6. SmartAIHub final answer generation remains in LLM Gateway; AI Search is the primary document retrieval plane.

---

# 11. Keyword / Hybrid Retrieval

Cloudflare AI Search BM25 is the canonical document lexical retrieval layer.

Use:

```text
keyword_tokenizer = trigram
fusion_method     = rrf
```

This replaces application-level ASCII token overlap and fixed weighted fusion.

Canonical keyword match policy:

```text
normal hybrid recall  -> keyword_match_mode = or
strict all-term case  -> keyword_match_mode = and only when planner/certification requires it
exact identifier      -> Exact/Symbolic lane first or alongside hybrid/keyword
```

Do not depend on default `and` behavior for broad multilingual RAG queries.

Legacy formulas such as:

```text
0.45 keyword + 0.55 vector
0.30 keyword + 0.70 vector
```

MUST NOT remain the production ranker.

---

# 12. Reranking

Enable:

```text
@cf/baai/bge-reranker-base
```

Pipeline:

```text
BM25 -----\
           -> RRF -> cross-encoder rerank -> evidence normalization
Vector ---/
```

Reranking is on for normal RAG, but exact deterministic metadata hits may bypass it.

---

# 13. Query Planner

Create `RetrievalQueryPlanner`.

```ts
type RetrievalPlan =
  | "exact"
  | "keyword"
  | "semantic"
  | "hybrid"
  | "hybrid_rewrite"
  | "multi_query"
  | "agentic";
```

## 13.1 Exact/symbolic detection

Detect and preserve UUIDs, spec/checkpoint IDs, error codes, snake_case identifiers, file paths, API routes, model IDs, commit hashes, filenames/extensions, class/function names and quoted literals.

Never rewrite these tokens destructively.

## 13.2 Conditional query rewrite

Use rewrite only for ambiguous follow-up, conversational shorthand and context-dependent queries.

Default model:

```text
@cf/zai-org/glm-5.3-flash
```

The original query remains available. If protected identifiers are altered, discard the rewrite.

## 13.3 Multi-query

Use only for broad comparison, multi-hop or multi-spec questions.

Default maximum expansion count: **4**.

Fuse expansion results through the Broker with RRF.

---

# 14. Fine-Grained ACL

Tenant isolation is necessary but not sufficient.

## 14.1 ACL scope

Normalize searchable authorization into opaque scope IDs:

```text
tenant_shared:<hash>
user_private:<hash>
group:<hash>
direct_share:<hash>
```

Raw email/name MUST NOT be used as an index scope key.

Filter-critical IDs such as `acl_scope` MUST be deterministic and **<= 64 UTF-8 bytes**, because provider indexed-string filtering only considers the first 64 UTF-8 bytes.

## 14.2 AI Search metadata fields

Reserve custom metadata fields for:

1. `acl_scope`
2. `project_id`
3. `source_type`
4. `status`
5. `language`

Use built-in `filename`, `folder`, `timestamp` for path/freshness.

## 14.3 Multiple shares

A canonical source may create several search projections for distinct authorization scopes. These are derived index copies, not canonical file copies.

## 14.4 Query filtering

Security Resolver calculates authorized scopes.

AI Search retrieval includes the authorization filter before candidate retrieval.

If authorized scope count exceeds provider/filter serialization constraints:

1. batch scopes;
2. run multiple filtered searches;
3. merge with local RRF;
4. deduplicate by canonical source/chunk;
5. preserve `partial/degraded` state if a batch fails.

Never send an unfiltered query as fallback.

The Broker stores authorization/filter intent as a **provider-neutral filter AST**. `cloudflareAiSearchProvider` and `cloudflareVectorizeProvider` translate that AST to the current provider API syntax. Consumer specs MUST NOT embed Cloudflare filter JSON/operator syntax directly.

## 14.5 Defense in depth

Before context construction or consequential use:

- resolve canonical source;
- re-check PostgreSQL authorization;
- reject deleted/revoked/tombstoned evidence;
- verify tenant/project/source ownership.

Permission removal triggers priority delete/reprojection.

**Release requirement: unauthorized evidence leakage = 0.**

---

# 15. Exact / Symbolic Lane

Use indexed PostgreSQL metadata for deterministic lookup of exact Library IDs, filenames, canonical paths/URLs, spec IDs, project IDs, job/error IDs and structured provider/model identifiers.

Normalize exact hits into the same evidence contract.

This lane does not make PostgreSQL a vector database.

---

# 16. Retrieval Broker V2 Contracts — `SAH-RETRIEVAL-2`

`SAH-RETRIEVAL-2` is the canonical cross-spec retrieval contract.

All production semantic/document/entity retrieval consumers MUST normalize requests into this contract before provider access.

Retrieval returns candidate evidence. It does **not** become authorization, lifecycle truth, approval, identity, policy decision or proof of requirement closure.

## 16.1 Request

```ts
type RetrievalQueryClass =
  | "EXACT_IDENTIFIER"
  | "DOCUMENT_RAG"
  | "SEMANTIC_ENTITY"
  | "SKILL_DISCOVERY"
  | "CAPABILITY_DISCOVERY"
  | "WORKFLOW_TEMPLATE_DISCOVERY"
  | "SIMILAR_CASE"
  | "HISTORICAL_ENGINEERING_EVIDENCE"
  | "POLICY_EVIDENCE"
  | "HYBRID_SEARCH";

interface RetrievalRequestV2 {
  requestId: string;

  tenantId: string;
  userId: string;
  projectId?: string | null;
  environment: string;

  purpose: string;
  queryClass: RetrievalQueryClass;

  query: string;
  structuredSelector?: Record<string, unknown>;
  messages?: Array<{ role: string; content: string }>;

  sourceClasses: string[];
  requiredVisibility?: string[];
  authorizedAclScopes?: string[];

  languageHints?: string[];
  exactIdentifiers?: string[];

  evidenceBudget?: {
    maxCandidates?: number;
    maxEvidence?: number;
    maxContextTokens?: number;
  };

  mode?: "auto" | "exact" | "keyword" | "semantic" | "hybrid";
  status?: string[];

  freshnessRequirement?: "current" | "historical_allowed" | {
    updatedAfter?: string;
    maxAgeSeconds?: number;
  };

  allowRewrite?: boolean;
  allowMultiQuery?: boolean;
  allowAgentic?: boolean;
  requireCitations?: boolean;

  consumerRef?: {
    specId?: number;
    runId?: string;
    workflowId?: string;
    taskId?: string;
    nodeId?: string;
  };

  traceId?: string;
}
```

Legacy Library/search request forms MAY remain temporarily during migration but MUST normalize into `SAH-RETRIEVAL-2` at the Broker boundary.

## 16.2 Evidence

```ts
interface RetrievalEvidenceV2 {
  evidenceId: string;

  sourceType: string;
  sourceId: string;
  itemId?: string | number;
  chunkId?: string;

  sourceRevision?: string | number;
  sourceDigest?: string;

  canonicalRef: {
    kind: string;
    id: string;
    revision?: string | number;
    digest?: string;
  };

  title: string;
  headingPath?: string[];
  text?: string;

  sourceUri?: string;
  citation?: {
    page?: number;
    lineStart?: number;
    lineEnd?: number;
    timeStartMs?: number;
    timeEndMs?: number;
  };

  retrievalProvider:
    | "cloudflare_ai_search"
    | "cloudflare_vectorize"
    | "postgres_exact";

  providerProfileId: string;
  providerProfileVersion?: string;

  retrievalMode:
    | "exact"
    | "keyword"
    | "semantic"
    | "hybrid"
    | "multi_query";

  scores?: {
    vector?: number;
    keyword?: number;
    fused?: number;
    rerank?: number;
    authority?: number;
    freshness?: number;
  };

  aclScope: string;
  aclVerified: boolean;
  provenanceVerified: boolean;
  freshnessState?: "current" | "stale" | "historical";

  projectId?: string | null;
  language?: string;
  updatedAt?: string;

  tombstoned?: boolean;
  domainEligibility?: "unknown" | "eligible" | "ineligible";
}
```

`canonicalRef` is authoritative identity. Provider-returned text/vector scores remain derived evidence.

## 16.3 Response

```ts
interface RetrievalResponseV2 {
  retrievalTraceId: string;
  plan: RetrievalPlan;

  providerProfile: {
    provider: string;
    profileId: string;
    version?: string;
  };

  rewrittenQuery?: string;
  evidence: RetrievalEvidenceV2[];

  evidenceQuality:
    | "sufficient"
    | "weak"
    | "conflicting"
    | "no_evidence";

  degraded: boolean;
  partial: boolean;
  degradationReasons?: string[];

  providerDiagnostics?: Record<string, unknown>;
}
```

Provider diagnostics are admin/debug-only and MUST NOT expose credentials or unauthorized content.

## 16.4 Partial-result contract

- ACL/Security Resolver failure → **fail closed**.
- required tenant/source filter failure → **fail closed** for the affected source.
- query rewrite failure → continue using original query, mark degraded.
- reranker failure → certified RRF order may continue, mark degraded.
- one shard/provider failure in a non-consequential broad search → available evidence MAY return only with `partial=true`.
- Cloudflare adapter MAY use provider `return_on_failure` to surface recoverable partial results, but the Broker MUST translate that into explicit `partial/degraded` state; provider defaults never decide SmartAIHub evidence sufficiency.
- consequential policy/security/billing/development-finality consumers MUST NOT treat partial/degraded retrieval as complete evidence unless their owning spec explicitly permits it.
- Evidence Quality Gate determines whether degraded evidence can still be `sufficient`.

---

# 17. Evidence Normalization

After retrieval:

1. map provider result;
2. resolve canonical source/version;
3. confirm source is active;
4. re-check caller authorization;
5. remove deleted/revoked evidence;
6. deduplicate equivalent chunks/ACL projections;
7. apply authority/freshness policy;
8. build citation/provenance.

Post-retrieval ACL is defense-in-depth, not the primary security mechanism.

---

# 18. Authority and Freshness

Define source classes such as:

```text
live_system_state
canonical_spec
official_help
project_document
library_document
approved_memory
conversation
external_import
```

Similarity alone does not determine truth priority.

For current-state questions, current authoritative sources outrank stale documents. Historical queries may intentionally retrieve older versions.

---

# 19. Evidence Quality Gate

Before sending context to an LLM, evaluate:

- evidence count and coverage;
- exact-token coverage;
- rerank/fusion confidence;
- stale/conflicting versions;
- provenance;
- authority;
- citation availability.

States:

```text
sufficient
weak
conflicting
no_evidence
```

Weak evidence triggers alternate retrieval/rewrite/multi-query before generation where policy permits.

No universal similarity threshold is hard-coded before calibration.

---

# 20. Agentic Retrieval Tier

Agentic retrieval is not the default.

Use when multi-hop evidence remains incomplete after normal retry, several sources/specs must be reconciled, or the user requests broad research.

Default maximum retrieval iterations: **3**.

Every iteration uses the same ACL contract.

---

# 21. Context Builder

Normally select **8–12** accepted evidence chunks.

Responsibilities:

- preserve headings/provenance;
- collapse overlaps;
- optionally expand parent window;
- enforce token budget;
- preserve exact strings;
- attach citation handles;
- remove duplicate ACL projections.

Final generation uses SmartAIHub LLM Gateway.

---

# 22. Indexing Pipeline

```text
Source mutation
   -> worker_jobs/outbox
   -> parse/OCR/normalize
   -> RagProjectionService
   -> ACL projections
   -> AI Search upload/delete
   -> Direct Vectorize upsert/delete where required
   -> index state/evidence
   -> ready
```

Requirements:

- idempotency;
- deterministic IDs;
- version fencing;
- bounded retry;
- dead-letter state;
- indexing lag;
- tombstones;
- reconcile/repair jobs;
- asynchronous provider mutation reconciliation;
- blue/green profile/index migration.

## 22.1 Blue/green reindex rule

Index-breaking changes MUST use versioned replacement indexes/instances.

Do not destroy the serving index until replacement passes:

- expected/actual count reconciliation;
- ACL tests;
- retrieval certification;
- shadow comparison;
- rollback test.

## 22.2 Capacity reconciliation

Scheduled reconciliation compares:

```text
canonical eligible sources
expected search projections
actual AI Search items
actual Direct Vectorize vectors
media lifecycle tier counts
```

Divergence above tolerance creates an operational issue and blocks profile promotion/cutover.

## 22.3 Media Vector Lifecycle & Archive Policy

Image, video and audio differ from durable Help/spec/document knowledge. Generated media often has high short-term value and low long-term semantic reuse.

SmartAIHub MUST NOT keep all media vectors forever.

### 22.3.1 Core rule

**Never delete the canonical media asset solely to reduce vector/search footprint.**

R2 objects and canonical PostgreSQL metadata remain governed by normal Library retention.

The lifecycle scorer evaluates at least:

```text
updated_at
last_opened_at
last_semantic_hit_at
last_used_in_project_at
semantic_hit_count_90d
reuse_count
project_status
pinned / favorite / keep_indexed
workflow_reference_count
published_asset
legal_or_retention_hold
asset_type
```

Age/`updated_at` is a major signal, but active project use, pinning, publication, workflow references or recent reuse override age-based demotion.

### 22.3.2 Default tiers

| Tier | Initial policy | Search representation | Behavior |
|---|---|---|---|
| **HOT_VECTOR** | roughly <=90 days since meaningful update/use/hit, active project, pinned, published or reused | hybrid AI Search and/or Direct Vectorize | full semantic + keyword |
| **WARM_KEYWORD** | generally 90–365 days with low semantic/project reuse | keyword-only compact AI Search projection | filename/title/tags/description/caption/transcript summary |
| **COLD_ARCHIVE** | generally >365 days, inactive/closed, low reuse, not pinned/held | no persistent vector/hybrid media projection | ordinary indexed PostgreSQL metadata/exact/prefix/trigram archive search |
| **KEEP_INDEXED** | explicit business/user rule | retained in certified searchable tier | no automatic demotion |

These windows are configurable policy defaults and MUST be validated against real usage.

Transient generated drafts MAY use shorter windows. Brand/reference/template assets SHOULD remain searchable longer.

### 22.3.3 Warm keyword archive

Warm media SHOULD use capacity-sharded keyword-only AI Search instances:

```text
media-archive-kw-<shard>-v1
index_method.vector  = false
index_method.keyword = true
keyword_tokenizer    = trigram
```

Warm projection stays compact:

```text
asset_id
filename/title
tags
description
generated caption/summary
transcript summary
project reference
updated_at
```

Binary media remains in R2.

### 22.3.4 Cold ordinary search

Cold media remains discoverable through normal indexed metadata search without vector storage.

Default RAG does not scan the entire cold archive. UI MUST expose explicit archive inclusion such as:

```text
Include archived media
```

### 22.3.5 Rehydration

Warm/cold media promotes/re-embeds when:

- user pins or marks keep-indexed;
- asset enters an active project/workflow;
- user selects the asset for an AI task and semantic neighborhood is required;
- archive search finds it and user requests related/semantic discovery;
- reuse crosses policy threshold;
- admin restores a collection/project.

Rehydration recreates the **current** embedding profile from canonical data.

Direct asset-ID selection does not require re-embedding merely to edit/process that known asset.

### 22.3.6 Anti-thrashing

Use hysteresis:

- minimum dwell time per tier;
- promotion faster than demotion;
- no immediate demotion after rehydration;
- bounded batch transitions;
- idempotent jobs.

### 22.3.7 Lifecycle worker

`MediaRetrievalLifecycleJob` runs on a configurable schedule, initially daily in bounded batches:

1. evaluate policy;
2. build transition plan;
3. verify holds/pins/project references;
4. mutate/delete vector/search representations;
5. verify provider mutation;
6. record evidence;
7. update capacity/cost metrics.

### 22.3.8 Retrieval routing

Normal retrieval searches:

```text
durable knowledge
+ HOT media when media source classes are requested
+ relevant WARM keyword sources when planner needs them
```

COLD archive is excluded unless explicitly requested.

This reduces index bloat without making old media undiscoverable.

---

# 23. New/Adapted Persistence

## `rag_projection_items`

Stores tenant, source type/id/version, ACL scope, projection key/hash, provider, instance/item IDs, embedding profile, status/indexed/deleted timestamps and last error.

Unique logical identity:

```text
(tenant_id, source_type, source_id, source_version, acl_scope, embedding_profile)
```

## `retrieval_provider_profiles`

Stores provider/profile/model/dimension/metric/hybrid/rerank/rewrite settings and activation history.

## `retrieval_query_traces`

Stores trace metadata by default, not raw private content:

```text
trace_id
tenant_id
opaque user ID
query_class
plan
provider/profile/version
instance/shard IDs
stage latency
result counts
evidence IDs
rewrite/rerank flags
quality result
partial/degraded flags
error
cost estimate
```

## `media_retrieval_lifecycle`

Recommended fields:

```text
tenant_id
asset_id
asset_type
tier
policy_version
updated_at
last_opened_at
last_semantic_hit_at
last_used_in_project_at
semantic_hit_count_90d
reuse_count
keep_indexed
hold_reason
last_transition_at
next_evaluation_at
active_embedding_profile
provider_projection_refs
```

## `retrieval_instance_routes`

Recommended fields:

```text
tenant_id
environment
topology_mode
namespace
instance_ids
source_class_routes
shard_policy
capacity_state
profile_version
enabled
updated_at
```

---

# 24. pgvector Migration

## Final target

```text
production vector read  = Cloudflare
production vector write = Cloudflare
document RAG            = Cloudflare AI Search
pgvector                 = disabled after rollback window
```

## Phases

### M0 Inventory
Enumerate all pgvector/direct-vector consumers and classify each as AI Search document RAG or Direct Vectorize workload.

### M1 New profiles
Create BGE-M3 1024 indexes and `rag-v2` AI Search instances.

### M2 Backfill
Reproject/re-embed from canonical sources. Do not copy old vectors because model/dimensions change.

### M3 Dual write
Keep old/new mutation paths synchronized temporarily.

### M4 Shadow read
Compare existing production results with new retrieval without exposing shadow results.

### M5 Canary
Roll out approximately:

```text
5% -> 25% -> 50% -> 100%
```

### M6 Cutover
Persist Cloudflare as authoritative read path.

### M7 Freeze pgvector
Stop vector writes and retain rollback evidence only.

### M8 Remove
After stable releases/retention, remove runtime vector dependency and old vector tables/indexes according to backup policy.

---

# 25. Required Repository Changes

## `apps/web/server/services/vectorizeContract.ts`

Change production V2 profile from:

```text
@cf/baai/bge-base-en-v1.5 / 768D
```

to:

```text
@cf/baai/bge-m3 / 1024D
```

Create new indexes; do not mutate existing index dimensions.

## `apps/web/server/services/vectorProvider.ts`

- make Cloudflare the post-cutover production path;
- make pgvector migration-only;
- add document-RAG capability routed to AI Search;
- report active profile/version/capabilities.

## `apps/web/server/services/libraryService.ts`

Replace production ranking based on ASCII `tokenize()` and fixed `0.45/0.55` scoring with Retrieval Broker V2.

Do not call token overlap a vector score in fallback mode.

## Python pgvector services

`python-backend/app/orchestrator/vector_store/pgvector_store.py` and `python-backend/app/services/library_pgvector_service.py` become migration-only and are removed from production after cutover.

## Suggested new modules

```text
apps/web/server/retrieval/
  retrievalBroker.ts
  retrievalContracts.ts
  retrievalQueryPlanner.ts
  retrievalSecurityResolver.ts
  retrievalEvidenceNormalizer.ts
  evidenceQualityGate.ts
  contextBuilder.ts

apps/web/server/retrieval/providers/
  cloudflareAiSearchProvider.ts
  cloudflareVectorizeProvider.ts
  postgresExactProvider.ts

apps/web/server/retrieval/indexing/
  ragProjectionService.ts
  ragProjectionAclService.ts
  aiSearchIndexService.ts
  vectorizeV2MigrationService.ts

apps/web/server/retrieval/evaluation/
  retrievalEvalRunner.ts
  retrievalMetrics.ts
  retrievalGoldenDataset.ts
  retrievalRegressionGate.ts
```

Equivalent repository conventions are acceptable.

---

# 26. Consumers

All search/RAG consumers migrate to Retrieval Broker V2:

- Chat / Universal Assistant;
- Help;
- Library;
- workflows;
- skills;
- Marketplace semantic search;
- MCP Gateway;
- External Agent Gateway;
- A2A;
- development runtime;
- exploration/self-improvement;
- issue/feedback triage;
- mobile/desktop assistants;
- future bot/runtime systems.

No consumer may bypass security/retrieval policy by calling a raw vector provider directly.

---

# 27. Retrieval Certification Suite

## 27.1 Golden dataset

Start with at least **500** reviewed queries and grow beyond **1,000**.

Required classes include Thai, English, mixed language, semantic paraphrase, exact IDs, UUID, error code, API path, filename, spec ID, follow-up, ambiguous, typo, multi-hop, stale/conflict, no-answer, ACL attacks, deleted/revoked, OCR, long docs, code/config/log.

## 27.2 Compare

```text
A legacy baseline
B Vectorize dense
C AI Search BM25
D AI Search vector
E hybrid + RRF
F E + reranker
G F + conditional rewrite
H G + multi-query
```

## 27.3 Metrics

```text
Recall@5/10/20/50
Hit@K
MRR@10
nDCG@10
Exact-ID Hit@5
Thai Recall@20
English Recall@20
Mixed Recall@20
No-answer precision/recall
Citation precision
Freshness correctness
ACL leakage
P50/P95/P99 latency
cost/query
```

## 27.4 Initial release gates

```text
Cross-tenant leakage              = 0
Unauthorized evidence leakage     = 0
Exact identifier Hit@5            >= 0.99
Overall Recall@20                 >= 0.95
Thai Recall@20                    >= 0.92
English Recall@20                 >= 0.95
nDCG@10                           >= 0.85
MRR@10                            >= 0.85
Citation precision                >= 0.95
Fresh/current version correctness >= 0.98
No-answer precision               >= 0.90
No-answer recall                  >= 0.90
```

Retrieval latency targets excluding final answer generation:

```text
simple exact/keyword P95        <= 800 ms
hybrid + rerank P95            <= 1500 ms
rewrite + hybrid + rerank P95  <= 2500 ms
```

Targets may only be revised through a documented benchmark decision.

---

# 28. Online Feedback

Capture result use, opened citations, retries/rephrases, explicit not-relevant feedback and admin labels.

Do not treat engagement alone as ground truth.

Every meaningful production retrieval bug should become a benchmark/regression case.

---

# 29. Admin UI — AI / Retrieval

Provide a unified admin surface.

## 29.1 Overview

Show:

- active retrieval/profile version;
- AI Search / Vectorize health;
- indexed projections;
- indexing backlog/errors;
- P95 retrieval latency;
- latest Recall@20 / Thai Recall;
- ACL certification;
- last certification result.

## 29.2 Configuration

Show/edit governed configuration:

- namespaces/instance templates;
- embedding/reranker/rewrite profiles;
- tokenizer/fusion;
- chunk size/overlap;
- direct Vectorize indexes;
- migration/cutover state.

Dangerous changes MUST explain whether reindex/certification is required.

## 29.3 Search Inspector

Admin can simulate tenant/user/project and inspect:

```text
query classification
rewrite
authorized scopes
exact lane
BM25 rank
vector rank
RRF
rerank
dedup
authority/freshness
quality gate
final context
partial/degraded state
```

Never expose evidence unavailable to the simulated user.

## 29.4 Evaluation

Run benchmark/subsets, compare profiles, inspect regressions and approve/reject promotion.

## 29.5 Index operations

Reindex tenant/item, repair projection, inspect errors, pause/resume backfill, cut over/rollback.

## 29.6 Capacity/topology

Show:

- instance/shard routing;
- projection count versus warning/rebalance/hard limit;
- ACL projection multiplier;
- projected days to capacity;
- blue/green overlap;
- rebalance status;
- cross-instance fan-out count.

## 29.7 Media lifecycle

Show:

- HOT/WARM/COLD/KEEP_INDEXED counts;
- vector count/storage avoided;
- upcoming demotions;
- rehydration queue;
- lifecycle errors;
- pin/hold overrides;
- policy windows;
- per-tenant tier distribution.

Manual lifecycle operations are audited and MUST respect canonical retention/hold policy.

---

# 30. Observability

OpenTelemetry spans:

```text
retrieval.request
retrieval.route.resolve
retrieval.security.resolve
retrieval.query.classify
retrieval.query.rewrite
retrieval.exact
retrieval.ai_search
retrieval.vectorize
retrieval.shard.fanout
retrieval.merge
retrieval.rerank
retrieval.normalize
retrieval.partial
retrieval.quality_gate
retrieval.context_build
retrieval.reindex.reconcile
media.lifecycle.evaluate
media.lifecycle.transition
media.lifecycle.rehydrate
```

Metrics include:

- requests by plan/query class;
- provider/shard errors;
- empty/weak retrieval;
- rewrite/multi-query/rerank rate;
- stage latency;
- indexing/projection lag;
- ACL revocation lag;
- cost estimate;
- AI Search instance/shard file count;
- capacity percentage + projected exhaustion;
- cross-instance fan-out;
- partial/degraded rate;
- active provider/model/profile version;
- HOT/WARM/COLD media counts;
- media vector eviction/rehydration rate;
- vector storage/cost avoided;
- provider mutation reconciliation lag.

Secrets and private content are redacted by default.

---

# 31. Failure Policy

- AI Search unavailable → exact lane, then Direct Vectorize only for source/workload types explicitly supported by the active profile with strict filters; otherwise explicit degraded/insufficient state.
- Reranker unavailable → certified RRF order MAY continue with `degraded=true`.
- Rewrite unavailable → original query continues with `degraded=true`.
- One AI Search shard unavailable → follow `SAH-RETRIEVAL-2` partial-result semantics; missing shard MUST NOT look like “no match”.
- Direct Vectorize unavailable → document RAG may continue through AI Search; direct-vector workloads degrade/fail according to caller policy.
- ACL/Security Resolver unavailable → **fail closed**.
- Canonical domain-authority revalidation unavailable for consequential candidate → candidate is ineligible for consequential use.
- Never fall back to an unrestricted scan.
- Never convert timeout/partial provider state into falsely `sufficient` evidence.

---

# 32. Security

Mandatory:

- least-privilege Cloudflare tokens;
- server-side credentials;
- no public tenant RAG endpoint;
- tenant instance isolation;
- pre-retrieval ACL filtering;
- PostgreSQL authorization re-check;
- revocation/delete propagation;
- prompt-injection-safe context handling;
- provider response ownership validation;
- audit log for reindex/cutover/admin actions.

Retrieved content is untrusted evidence and can never grant tool/admin/network/secret/cross-tenant permission.

---

# 33. Data Lifecycle

Canonical deletion flow:

```text
canonical delete
 -> projection delete
 -> AI Search delete
 -> Direct Vectorize delete when applicable
 -> provider deletion verification
 -> cache expiry
 -> stale-result prevention
```

Tenant/account deletion includes indexed data cleanup.

Media retrieval lifecycle is **not** canonical asset deletion:

- HOT → WARM/COLD demotion changes/removes retrieval representations;
- canonical R2 asset remains unless normal retention policy deletes it;
- legal/retention hold overrides retrieval-cost optimization;
- rehydration rebuilds from canonical state.

---

# 34. Testing

Required test families:

## 34.1 Unit

Query planner, exact-token protection, ACL scope generation, projection IDs, evidence dedup, authority/freshness, quality gate, provider normalization, lifecycle scoring and migration version checks.

## 34.2 Provider contract

Cloudflare AI Search/Vectorize create/update/search/filter/rerank/rewrite/upsert/delete and namespace behavior.

## 34.3 Integration

Source update → projection → index → search; permissions; group changes; delete; restore/version; provider failure; reindex; tombstones.

## 34.4 Security

Wrong tenant/user, revoked/expired permission, removed group, private content, malicious filter override, prompt injection, stale projection and unexpected provider evidence.

## 34.5 Performance

Small→large corpora, concurrency, large ACL scope sets, shard fan-out, reindex storms and indexing lag.

## 34.6 Provider-limit / topology

Test:

- pooled tenant isolation;
- oversized-tenant shards;
- 10-instance fan-out guard;
- 3.5/4 MB projection split;
- 5 custom metadata fields;
- 64-byte filter-critical IDs;
- ACL scope batching;
- blue/green capacity overlap;
- expected/provider count reconciliation.

## 34.7 Hybrid threshold semantics

Golden cases MUST include strong BM25/exact matches with weak vector similarity to prove:

```text
match_threshold = 0
```

preserves exact recall.

Any proposed non-zero threshold must pass regression certification.

## 34.8 Media lifecycle

Test:

- recent asset stays HOT;
- old unused asset demotes;
- pinned/reused/published/active-project asset stays indexed;
- WARM is keyword-discoverable without vector;
- COLD appears in ordinary archive search only when requested;
- rehydration builds current-profile vector;
- direct ID use does not trigger needless embedding;
- anti-thrashing;
- async provider deletion reconciliation;
- hold overrides optimization;
- demotion never deletes canonical R2 asset.

---

# 35. Feature Flags

```text
retrieval_v2_enabled
ai_search_document_rag_enabled
vectorize_v2_direct_enabled
retrieval_reranker_enabled
retrieval_query_rewrite_enabled
retrieval_multi_query_enabled
retrieval_agentic_enabled
retrieval_shadow_compare_enabled
pgvector_legacy_read_enabled
retrieval_capacity_sharding_enabled
retrieval_partial_result_contract_enabled
media_vector_lifecycle_enabled
media_archive_keyword_enabled
```

No feature flag may bypass ACL/security filtering.

---

# 36. Cutover Checklist

- [ ] AI Search topology provisioning works.
- [ ] BGE-M3 1024 profile active and pinned.
- [ ] Direct Vectorize V2 indexes created.
- [ ] corpus backfilled/reconciled.
- [ ] ACL scopes reconciled.
- [ ] delete/revoke verified.
- [ ] BM25 + trigram + hybrid + RRF active.
- [ ] reranker active.
- [ ] conditional rewrite tested.
- [ ] exact lane tested.
- [ ] Thai/English/mixed benchmarks pass.
- [ ] exact identifier benchmark passes.
- [ ] no-answer benchmark passes.
- [ ] unauthorized/ACL leakage = 0.
- [ ] `SAH-RETRIEVAL-2` used by migrated consumers.
- [ ] domain-authority revalidation acceptance tests pass.
- [ ] partial/degraded behavior verified.
- [ ] capacity/shard routing + 10-instance guard verified.
- [ ] provider model lifecycle alert/migration flow verified.
- [ ] media HOT/WARM/COLD lifecycle verified.
- [ ] WARM keyword-only and COLD ordinary archive search verified.
- [ ] media rehydration/anti-thrashing verified.
- [ ] latency gates pass.
- [ ] rollback tested.
- [ ] Admin Search Inspector/evaluation/topology/lifecycle UI exists.
- [ ] certification persisted.
- [ ] pgvector vector writes stopped.
- [ ] production vector reads no longer depend on pgvector.

---

# 37. Definition of Done

Spec 229 is complete only when:

1. all production retrieval consumers route through `SAH-RETRIEVAL-2`;
2. Cloudflare AI Search is the primary document RAG plane;
3. Cloudflare Vectorize V2 is the canonical direct vector store;
4. pgvector is off production vector reads/writes;
5. `@cf/baai/bge-m3` / 1024D / cosine is the pinned embedding profile;
6. BM25 + trigram + vector + RRF + reranker is active and benchmarked;
7. query rewriting is conditional, observable and exact-token-safe;
8. Thai/English/mixed-language and exact-identifier gates pass;
9. ACL pre-filtering + canonical post-retrieval authorization reaches zero unauthorized leakage;
10. evidence carries canonical revision/digest, provenance, freshness, tombstone and partial/degraded state;
11. Skill/domain candidates are revalidated by their owning authority before consequential use;
12. Evidence Quality Gate prevents weak/partial evidence from silently becoming complete trusted context;
13. capacity-aware routing/sharding is live and monitored;
14. blue/green model/index migration and rollback are tested;
15. old low-reuse image/video/audio can demote from vector search to keyword-only/ordinary archive search;
16. rehydration, anti-thrashing, pin/hold overrides and archive opt-in work;
17. Admin Search Inspector, certification, topology and lifecycle operations exist;
18. all security/quality/performance gates pass.

---

# 38. Implementation Order

```text
P229.0  inventory + architecture freeze
P229.1  RetrievalBrokerV2 / SAH-RETRIEVAL-2 + security
P229.2  BGE-M3 1024 Direct Vectorize V2
P229.3  AI Search provider + capacity-aware tenant provisioning
P229.4  RAG Projection + ACL projections
P229.5  Library migration
P229.6  BM25 + trigram + RRF + reranker
P229.7  conditional rewrite + exact lane
P229.8  evidence normalization + quality gate + citations
P229.9  Help/Specs/shared knowledge migration
P229.10 agents/workflows/MCP/A2A/runtime migration
P229.11 evaluation suite + Admin UI
P229.12 shadow pgvector/768D migration
P229.13 canary + cutover
P229.14 pgvector freeze/remove + final verification
P229.15 media HOT/WARM/COLD lifecycle + archive search + rehydration
P229.16 Skill/domain-authority contract acceptance + migrated consumers
P229.17 capacity/shard/partial-result/model-lifecycle hardening
```

Certification infrastructure SHOULD begin no later than P229.4, not at the end.

---

# 39. Regression Rule

Every production retrieval bug MUST result in at least one golden query, ACL test, provider contract test or indexing regression test.

A retrieval bug without a regression test is not fully closed.

---

# 40. Future Extension Points

Keep Broker contracts extensible for alternate embedding/reranker models, sparse neural retrieval, learned fusion, late interaction, multimodal/graph retrieval, agentic web+private search and enterprise connectors.

Future providers may not bypass the common ACL/evidence contract.

---

# 41. Deprecated Patterns

Deprecated after Spec 229 cutover:

```text
pgvector as production vector DB
ASCII-only [a-z0-9] multilingual tokenization
fixed 0.45/0.55 ranking
fixed 0.70/0.30 ranking
feature services calling raw vector providers
pre-cutting recent items before semantic retrieval
token overlap mislabeled as vector score
LLM context without ACL/provenance/evidence gate
per-feature independent production RAG
English-only FTS as platform-wide lexical retrieval
permanently vector-indexing old image/video/audio regardless of reuse
unbounded one-AI-Search-instance-per-tenant assumption
using AI Search match_threshold as fused-RRF relevance
silently accepting partial shard/provider results as complete evidence
provider Smart Default changing canonical embeddings without certification
```

---

# 42. Technology References

Cloudflare documentation current at design time:

- https://developers.cloudflare.com/ai-search/
- https://developers.cloudflare.com/ai-search/concepts/how-ai-search-works/
- https://developers.cloudflare.com/ai-search/configuration/indexing/hybrid-search/
- https://developers.cloudflare.com/ai-search/configuration/indexing/keyword-search/
- https://developers.cloudflare.com/ai-search/configuration/indexing/vector-search/
- https://developers.cloudflare.com/ai-search/configuration/retrieval/reranking/
- https://developers.cloudflare.com/ai-search/configuration/retrieval/query-rewriting/
- https://developers.cloudflare.com/ai-search/configuration/retrieval/filtering/
- https://developers.cloudflare.com/ai-search/configuration/models/supported-models/
- https://developers.cloudflare.com/ai-search/how-to/per-tenant-search/
- https://developers.cloudflare.com/ai-search/platform/limits-pricing/
- https://developers.cloudflare.com/vectorize/reference/metadata-filtering/

Repository paths reviewed:

- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/vectorProvider.ts`
- `apps/web/server/services/vectorize.ts`
- `apps/web/server/services/vectorizeContract.ts`
- `python-backend/app/api/internal_library.py`
- `python-backend/app/services/library_pgvector_service.py`
- `python-backend/app/services/embedding_service.py`
- `python-backend/app/orchestrator/vector_store/pgvector_store.py`

---

## 42.1 Revision 3.0 provider assumptions verified

The implementation MUST code to currently verified provider behavior and keep contract tests for it:

- Workers Paid AI Search: 5,000 instances/account;
- hybrid/keyword: 500,000 files/instance;
- cross-instance search: maximum 10 instances/request;
- maximum 5 custom metadata fields/instance;
- maximum indexed item/file size 4 MB;
- `match_threshold` filters vector similarity, not fused RRF score;
- `context_expansion` supports 0–3 surrounding chunks;
- Vectorize V2: up to 10 metadata indexes/index and metadata filters execute before top-K;
- `@cf/baai/bge-m3`: 1024D cosine embedding model supported by AI Search;
- `@cf/baai/bge-reranker-base`: supported reranker used by this profile.

Provider changes are handled through versioned profiles and certification rather than silent assumptions.

# 43. Canonical Architecture Statement

```text
PostgreSQL  = canonical metadata / ACL / transactional state
R2          = canonical assets and durable source data
AI Search   = primary document RAG + BM25 + Vector + RRF + Reranker
Vectorize   = canonical direct vector database
Workers AI  = BGE-M3 embeddings + reranker + conditional rewrite model
LLM Gateway = final answer generation
Retrieval Broker = mandatory policy/security/evidence boundary
```

Any future spec that requires RAG/search MUST reference Spec 229 instead of introducing another independent vector/search pipeline.
---

Old/low-reuse media is not permanently vector-indexed:

```text
HOT_VECTOR   -> semantic + keyword retrieval
WARM_KEYWORD -> keyword-only compact projection
COLD_ARCHIVE -> ordinary canonical metadata/archive search
```

Rehydration returns selected/reused media to the current embedding profile when semantic retrieval becomes worthwhile again.

# 44. Cross-Spec Canonical Ownership Alignment — Specs 221/222/224/227/230

This section removes ambiguity created by adjacent development/learning specs.

| Concern | Canonical owner |
|---|---|
| Skill contract/evals/publication | Spec 221 |
| Cross-run learning/replay/strategy evidence | Spec 222 |
| Development lifecycle/closure/finality/hardening | Spec 224 |
| Media policy rules/certification/publication readiness | Spec 227 |
| **Production retrieval/search/vector/RAG data plane** | **Spec 229** |
| Repository engineering context/methodology/harness preparation | Spec 230 |

Mandatory rules:

1. Specs 221, 222, 224, 227 and 230 SHALL use the shared Spec 229 Retrieval Broker for production semantic/document retrieval after cutover.
2. Those specs MAY own domain-specific query planning, interpretation or decisions, but SHALL NOT create independent production vector stores, hybrid rankers or ACL-bypassing search paths.
3. Retrieved evidence is derived context, not authorization and not lifecycle truth.
4. Spec 220/shared policy remains authoritative for identity, authorization, tenant isolation and secret governance.
5. External harnesses such as Kimi/Claude/Codex/ZCode consume retrieval only through governed SmartAIHub contracts or bounded context packs; they do not receive provider credentials.

## 44.1 Development/Skill Retrieval Examples

```text
Spec 230 relevant-Skill lookup
 → Spec 229 `sah-skills-v2` / document projection
 → candidate evidence
 → Spec 221 trust/version checks
 → Spec 230 selection/materialization
```

```text
Spec 224 hardening campaign historical-finding lookup
 → Spec 229
 → evidence
 → Spec 224 AuditLens/Finding Judge
```

## 44.2 Learning Plane

Spec 222 may evaluate alternative retrieval profiles using replay/shadow evidence but cannot activate an uncertified retrieval profile directly. Production activation remains under Spec 229 configuration/certification plus canonical policy gates.


## Shared Retrieval Contract Family — `SAH-RETRIEVAL-2`

All production consumers in Specs 214–230 that require semantic/document/entity search SHALL use the canonical Spec 229 Retrieval Broker contract rather than provider-specific search APIs.

The shared request MUST carry at least:

```text
request_id
principal / tenant / project / environment
purpose
query_class
query_text or structured selector
source_classes
required_visibility / ACL scope
language hints
exact identifiers if present
maximum evidence budget
freshness requirement
consumer spec / run / workflow references
```

The normalized response MUST carry at least:

```text
retrieval_trace_id
provider/profile/version
query plan
EvidenceRef[]
source identity + source revision/digest
ACL/provenance/freshness state
retrieval/rerank scores as non-authoritative evidence
quality-gate result
partial/degraded indicators
```

`EvidenceRef` SHALL be a reference to authorized canonical content; retrieved text/vector similarity SHALL NOT become lifecycle state, authorization, approval, identity or source-of-truth data.


---

# R2 Canonical Layer — Skill-First Cross-Domain Retrieval Contract

Revision 2 expands Spec 229 from a storage/provider migration specification into the canonical **retrieval data plane** used consistently by Skills, development intelligence, workflows, Help, Library, policy RAG, maintenance similarity, Marketplace discovery and future retrieval consumers.

# 45. Retrieval Query Classes

The Broker SHALL distinguish at least:

```text
EXACT_IDENTIFIER
DOCUMENT_RAG
SEMANTIC_ENTITY
SKILL_DISCOVERY
CAPABILITY_DISCOVERY
WORKFLOW_TEMPLATE_DISCOVERY
SIMILAR_CASE
HISTORICAL_ENGINEERING_EVIDENCE
POLICY_EVIDENCE
HYBRID_SEARCH
```

Query class influences planning/evaluation but never weakens ACL/security.

# 46. Two-Stage Authority Model

Retrieval is candidate/evidence generation, not domain authority.

```text
authorized query
→ retrieve/rank evidence
→ authoritative domain revalidation
→ consumer decision/action
```

Examples:

```text
Skill candidate → Spec 221 lifecycle/trust + Spec 230 methodology fit
Maintenance similar issue → Spec 228 canonical item state
Policy evidence → Spec 227 rule engine
Workflow capability → Spec 214/215 registry/compiler
```

# 47. Skill Discovery Architecture

Skill discovery SHALL use a hybrid of deterministic filters and semantic retrieval.

Preferred pipeline:

```text
1. normalize purpose / phase / artifact / failure mode / language
2. apply Spec 220 tenant/project/visibility scope
3. exact ID/version/tag/capability lane when available
4. retrieve semantic/keyword candidates from `sah-skills-v2` / approved Skill projections
5. hybrid fusion/rerank
6. evidence-quality threshold / hard-negative controls
7. authoritative Spec 221 lifecycle/trust/version revalidation
8. Spec 230 methodology/WorkPackage/AuditLens fit evaluation when development-related
9. lazy materialization of selected canonical Skill source only
10. record selection provenance/effectiveness feedback
```

The Broker SHALL NOT auto-execute or auto-install a Skill.

# 48. `SkillSearchProjection`

Recommended normalized projection fields:

```text
skill_id
version
source_kind
source_ref / repository / revision / path
digest
tenant / project / owner / visibility
lifecycle_status
trust_tier
certification_refs
summary
domains
capability_tags
applicable_phases
artifact_classes
positive_triggers
negative_triggers
required_tool/capability classes
risk/effect class
compatibility constraints
language
updated_at
```

Index text MUST be safe for the provider boundary; secrets and unrestricted implementation internals are excluded by default.

# 49. Skill Body vs Discovery Projection

The searchable projection is not the Skill package. After selection, the consumer loads the canonical `SKILL.md`/package/repository source from its authoritative location using the pinned version/revision/digest.

This supports progressive disclosure:

```text
metadata/projection → selected SKILL.md → selected references/scripts only when required
```

rather than injecting all Skill bodies into every prompt.

# 50. Ranking Signals and Non-Authority

Retrieval relevance MAY combine semantic, lexical, exact-match and reranking evidence. Downstream selectors MAY additionally consider:

```text
Spec 221 certification/trust quality
Spec 222 historical effectiveness (advisory)
Spec 230 phase/methodology fit
current provider/harness compatibility
cost/latency where policy permits
```

These signals SHALL remain distinguishable in evidence. Historical popularity/success MUST NOT override tenant scope, lifecycle state, risk policy or explicit negative triggers.

# 51. Freshness / Revocation / Tombstone Contract

Projection updates SHALL be event/outbox-driven and idempotent. Revoked/deleted/visibility-changed Skills and sources MUST be tombstoned/inactivated promptly.

Because index propagation can lag, a retrieved candidate that will cause execution MUST be reread/revalidated against authoritative current state before use.

# 52. Exact Lane Protection

Queries containing exact Skill IDs, Spec IDs, UUIDs, file paths, API paths, error codes or version strings SHALL preserve those tokens and use deterministic/exact lookup before or alongside semantic expansion. Query rewriting MUST NOT corrupt exact identifiers.

# 53. Skill Discovery Evaluation Corpus

Certification SHALL include labeled tests for:

```text
Thai intent
English intent
mixed Thai/English
exact Skill ID/version
synonyms/paraphrases
negative triggers
hard negatives
near-duplicate Skills
wrong phase
wrong tenant/private visibility
revoked/deprecated Skill
stale index candidate
no relevant Skill
multiple equally valid Skills
```

Metrics SHOULD include Recall@K, MRR/nDCG where appropriate, hard-negative rejection, exact-ID success, wrong-tenant leakage (=0), stale-candidate execution (=0), and end-to-end selected-Skill usefulness.

# 54. Cross-Domain Search Isolation

One physical provider may serve multiple logical indexes/instances, but Skill, maintenance, policy, private Library and shared product knowledge SHALL preserve distinct security/source semantics. Cross-domain retrieval MUST be intentional and expressed in `source_classes`; broad default search across everything is prohibited for consequential decisions.

# 55. Retrieval Evidence as Untrusted Input

All retrieved text—including Skill descriptions, docs, historical issues and policy pages—is untrusted content. Retrieved instructions cannot grant tool, secret, network, admin or cross-tenant authority.

# 56. Retrieval Contract Acceptance Tests

At minimum:

1. Skill semantic search finds an eligible relevant Skill and returns canonical ref/digest.
2. revoked Skill remains non-executable even during index lag.
3. wrong-tenant Skill never appears as eligible evidence.
4. exact Skill ID is not damaged by query rewriting.
5. similar Skill with negative trigger is rejected by downstream resolver.
6. repository-local Skill selection rereads the pinned file/digest before materialization.
7. Spec 222 effectiveness signal can reorder otherwise eligible candidates but cannot resurrect revoked/incompatible Skills.
8. Help/Library/Skill/maintenance/policy consumers all use the same Broker contract while retaining domain authority.
9. provider outage produces explicit degraded/insufficient evidence state.
10. deletion/revocation propagates to projections and execution revalidation prevents stale use.

---

# 57. Revision 3.0 — Production Gap Audit Record

Revision 3.0 preserves canonical Spec 229 R2 and applies an additional production audit.

| Audit round | Focus | Gap / improvement |
|---|---|---|
| 1 | Core architecture | Reconfirmed AI Search document RAG, Direct Vectorize custom vectors, PostgreSQL/R2 canonical stores and mandatory Broker boundary. |
| 2 | Cloudflare capacity | Added dedicated/pooled/oversized sharding, soft ceilings and 10-instance fan-out guard. |
| 3 | Security/ACL | Added opaque <=64-byte filter-critical IDs, batching, pooled-tenant fail-closed behavior and canonical revalidation. |
| 4 | Hybrid semantics | Corrected `match_threshold`: vector similarity, not fused RRF; hybrid default 0 unless certified otherwise. |
| 5 | Thai/multilingual | Added Unicode-safe normalization and explicit ban on ASCII-only multilingual tokenization. |
| 6 | Chunk/context/rerank | Added 3.5/4 MB projection policy and controlled context expansion. |
| 7 | Media lifecycle/cost | Added HOT/WARM/COLD/KEEP_INDEXED, ordinary cold search and rehydration. |
| 8 | Migration/index correctness | Added blue/green reindex and provider/canonical count reconciliation. |
| 9 | Operability/Admin UX | Added topology/capacity/media lifecycle inspection and controls. |
| 10 | Testing/release | Added provider-limit, shard, threshold, archive, rehydration and lifecycle regression gates. |
| 11 | Failure/degradation | Added explicit partial/degraded contract and fail-closed consequential behavior. |
| 12 | Future scale | Deprecated unlimited tenant-instance assumptions and permanent stale-media vectors. |
| 13 | Canonical R2 merge | Preserved `SAH-RETRIEVAL-2`, query classes, Skill-first retrieval, tombstones, hard negatives and domain-authority revalidation. |
| 14 | Provider model lifecycle | Pinned model profiles and required certified replacement migration. |
| 15 | Evidence completeness | Prevented provider/shard partial results from silently becoming `sufficient` evidence. |

**Revision 3.0 is the canonical implementation/freeze-candidate baseline unless superseded by a later approved revision.**
