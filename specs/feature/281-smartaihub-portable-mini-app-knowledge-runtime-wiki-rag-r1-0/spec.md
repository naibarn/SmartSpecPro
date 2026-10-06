# Spec 281 — SmartAIHub Portable Mini App Knowledge Runtime & Wiki RAG

**Short name:** Portable Knowledge Runtime (PKR)  
**Revision:** R1.0 — Initial Implementation-Ready Design  
**Date:** 2026-10-04  
**Status:** Proposed — Additive / Implementation-Ready  
**Scope:** Mini App / SPAAS knowledge runtime portability, provider abstraction, local Wiki RAG, knowledge bundle import/export, managed/portable/connected/external deployment interoperability  
**Primary owners:** Mini App Runtime, SPAAS Runtime, Knowledge/Retrieval Platform  
**Primary consumers:** Spec 261 SPAAS, Spec 224 Development Orchestrator, Spec 256 Capability/Skill-first routing, Mini Apps, Chat/Assistant Runtime, Marketplace/White-label deployment  
**Canonical dependencies:** Spec 261 SPAAS; Spec 266 SmartAIHub Intelligence Fabric; Spec 229 Unified RAG / Retrieval Broker; Spec 268 Memory Runtime  
**Non-normative external design reference:** `https://github.com/rohitg00/pro-workflow` persistent Wiki knowledge plane (SQLite/FTS5, sources, claims, seeds, embeddings, hybrid BM25+vector retrieval)  
**Normative language:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY are normative.

---

# 0. Executive Decision

SmartAIHub SHALL support Mini Apps whose knowledge/RAG capability can operate in more than one deployment topology without rewriting application logic.

A Mini App MAY:

1. run fully inside SmartAIHub;
2. run outside SmartAIHub on a user/customer machine with a portable local knowledge runtime;
3. run outside SmartAIHub while calling SmartAIHub-managed knowledge services;
4. run outside SmartAIHub against a customer/external knowledge provider.

The application MUST depend on a **capability contract**, not on Cloudflare Vectorize, PostgreSQL, SQLite, pgvector, Qdrant, Pinecone, Elasticsearch, OpenSearch, or any other provider-specific implementation.

Canonical principle:

```text
Mini App
   │
   ▼
Portable Knowledge Contract
   │
   ├── SmartAIHub Managed Adapter
   │      └── Spec 266 + Spec 229 + PostgreSQL/R2/AI Search/Vectorize
   │
   ├── Portable Local Adapter
   │      └── SQLite + FTS5 + files + optional local vectors
   │
   ├── Connected Adapter
   │      └── remote SmartAIHub Knowledge API/MCP
   │
   └── External Adapter
          └── customer/provider-specific backend
```

The portable unit is the **canonical knowledge content and metadata**. Search indexes and embeddings are derived artifacts and MUST be rebuildable.

---

# 1. Why Spec 281 Exists

Spec 261 defines a portable application/product contract and already permits knowledge schemas, index configuration, and distributable seed documents while separating application packages from authorized data export.

Spec 266 defines SmartAIHub's canonical Data/Evidence/Knowledge/Spatial Intelligence semantics and governance.

Spec 229 defines SmartAIHub's canonical managed RAG/search path through Retrieval Broker, Cloudflare AI Search and Vectorize.

Those specifications do not by themselves define how the same Mini App knowledge capability survives deployment to:

- Windows/macOS/Linux;
- customer-owned infrastructure that consumes an OCI-compatible export artifact outside the SmartAIHub-managed execution boundary;
- customer servers;
- private clouds;
- NAS/edge systems;
- offline or intermittently connected installations;
- environments using an existing enterprise RAG stack.

Without Spec 281, Mini Apps are likely to hard-code SmartAIHub infrastructure or independently invent incompatible local RAG systems.

Spec 281 creates one portable runtime contract while preserving existing authorities.

---

# 2. Canonical Ownership Boundaries

## 2.1 Spec 261 — SPAAS

Spec 261 remains authority for:

- application/package identity;
- application manifest;
- deployment target;
- product lifecycle;
- packaging/signing/install/update/uninstall;
- marketplace/white-label portability;
- application-level data export policy declarations.

Spec 281 defines a knowledge capability extension consumed by SPAAS.

Spec 281 MUST NOT create a second application package standard.

## 2.2 Spec 266 — Intelligence Fabric

Spec 266 remains authority for canonical knowledge/evidence semantics including:

- sources;
- datasets/documents;
- evidence;
- claims;
- provenance;
- rights;
- freshness;
- verification/admission;
- knowledge spaces and portable exchange semantics added by Spec 266 R1.2.

Spec 281 implements portable runtime/adapters around those semantics.

Spec 281 MUST NOT become a second canonical evidence authority.

## 2.3 Spec 229 — Unified RAG / Retrieval Broker

When a Mini App executes against SmartAIHub-managed retrieval, every search/RAG request MUST use Spec 229 Retrieval Broker.

Spec 281 MUST NOT create a parallel SmartAIHub production ranking pipeline.

Portable/external runtimes MAY use their own retrieval engine only when they are outside the SmartAIHub-managed retrieval boundary. They MUST still return the normalized Spec 281 evidence contract.

## 2.4 Spec 268 — Memory Runtime

Memory and knowledge remain separate:

```text
Memory    = what the user/app/agent learned or retained
Knowledge = what documents/data/sources/evidence say
```

A Mini App MAY use both Spec 268 portable memory and Spec 281 portable knowledge, but MUST NOT silently merge their stores, retention semantics, or authorization models.

## 2.5 Spec 224 — Development Orchestrator

Spec 224 SHALL compile Mini App knowledge requirements into SPAAS + Spec 281 declarations rather than generating provider-specific RAG code by default.

Before implementing a new retrieval/database subsystem, development orchestration SHOULD resolve whether an existing Spec 281 provider satisfies the requested capability.

## 2.6 Spec 256 — Capability/Skill-first Routing

Knowledge operations SHOULD be exposed as capabilities discoverable through the Capability Resolver.

Provider selection SHALL occur after capability/policy resolution, not from provider name in the user prompt.

---

# 3. Core Invariants

```text
KNOWLEDGE CONTENT ≠ VECTOR INDEX
EMBEDDING ≠ CANONICAL KNOWLEDGE
SEARCH INDEX ≠ SOURCE OF TRUTH
KNOWLEDGE BUNDLE ≠ LIVE RUNTIME DATABASE
PACKAGE EXPORT ≠ AUTHORIZED DATA EXPORT
EXPORTABLE ≠ REDISTRIBUTABLE
SOURCE ≠ CLAIM
CLAIM ≠ VERIFIED FACT
CLAIM CONFIDENCE ≠ SOURCE AUTHORITY
PAGE ≠ CHUNK
CHUNK ≠ DOCUMENT
RETRIEVAL HIT ≠ AUTHORIZATION
RETRIEVAL HIT ≠ FACTUAL VERIFICATION
LOCAL COPY ≠ GLOBAL CANONICAL AUTHORITY
SYNCED COPY ≠ CURRENT COPY
OFFLINE AVAILABLE ≠ FRESH
CONNECTED MODE ≠ SMARTAIHUB-HOSTED MODE
PORTABLE ≠ PROVIDER-IDENTICAL
PORTABLE ≠ OFFLINE-CAPABLE UNLESS DECLARED
MEMORY ≠ KNOWLEDGE/RAG
```

These invariants MUST survive export/import, synchronization, indexing, RAG context construction, citations, UI, agent execution and Marketplace distribution.

---

# 4. Deployment Modes

Spec 281 defines four first-class provider modes.

## 4.1 `managed`

The application runs with SmartAIHub-managed knowledge services.

```yaml
knowledge:
  mode: managed
  provider: smartaihub
```

Expected path:

```text
Mini App
  → Spec 281 SmartAIHub Adapter
  → Spec 229 Retrieval Broker
  → Spec 266 Intelligence Fabric
  → PostgreSQL / R2 / AI Search / Vectorize
```

## 4.2 `portable`

The application carries or provisions a local knowledge runtime.

```yaml
knowledge:
  mode: portable
  provider: sqlite
```

Default reference profile:

```text
SQLite metadata/content index
+ FTS5 lexical/BM25 retrieval
+ local files/object directory
+ optional local embedding/vector provider
+ rebuildable derived indexes
```

Portable does not require one specific vector extension.

## 4.3 `connected`

The application is deployed elsewhere but calls SmartAIHub knowledge remotely.

```yaml
knowledge:
  mode: connected
  provider: smartaihub_remote
```

The connection MUST use scoped authentication and MUST NOT embed reusable platform secrets in the package.

## 4.4 `external`

The application binds to a customer/provider-owned knowledge backend.

```yaml
knowledge:
  mode: external
  provider: customer_pgvector
```

External adapters MAY target:

- PostgreSQL/pgvector;
- Qdrant;
- Elasticsearch/OpenSearch;
- Weaviate;
- Pinecone;
- existing enterprise RAG APIs;
- custom MCP/API providers;
- future providers.

Provider names are examples, not required dependencies.

---

# 5. Deployment Capability Profiles

Each provider MUST declare a machine-readable capability profile.

```ts
interface KnowledgeProviderCapabilities {
  exactSearch: boolean;
  keywordSearch: boolean;
  semanticSearch: boolean;
  hybridSearch: boolean;
  rerank: boolean;
  citations: boolean;
  claimStore: boolean;
  sourceStore: boolean;
  researchSeeds: boolean;
  attachments: boolean;
  incrementalIndexing: boolean;
  importBundle: boolean;
  exportBundle: boolean;
  offline: boolean;
  readOnly: boolean;
  sync: boolean;
  maxDocumentBytes?: number;
  maxIndexItems?: number;
  supportedEmbeddingProfiles?: string[];
}
```

Capability negotiation MUST occur before deployment/materialization.

If a required capability is unavailable, installation/deployment MUST:

1. resolve another provider;
2. offer a permitted degraded profile; or
3. fail with a precise compatibility error.

It MUST NOT silently remove citations, authorization checks, or required search semantics.

---

# 6. Knowledge Provider Contract

```ts
interface PortableKnowledgeProvider {
  describe(): Promise<KnowledgeProviderDescriptor>;
  capabilities(): Promise<KnowledgeProviderCapabilities>;

  createSpace(req: CreateKnowledgeSpaceRequest): Promise<KnowledgeSpace>;
  getSpace(spaceId: string): Promise<KnowledgeSpace | null>;
  listSpaces(req: ListKnowledgeSpacesRequest): Promise<KnowledgeSpace[]>;

  upsertDocument(req: UpsertKnowledgeDocumentRequest): Promise<KnowledgeWriteReceipt>;
  deleteDocument(req: DeleteKnowledgeDocumentRequest): Promise<KnowledgeWriteReceipt>;
  getDocument(documentId: string): Promise<KnowledgeDocument | null>;

  upsertSource(req: UpsertKnowledgeSourceRequest): Promise<KnowledgeWriteReceipt>;
  upsertClaim(req: UpsertKnowledgeClaimRequest): Promise<KnowledgeWriteReceipt>;

  search(req: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse>;
  hydrate(req: KnowledgeHydrationRequest): Promise<KnowledgeHydrationResponse>;

  importBundle?(req: KnowledgeBundleImportRequest): Promise<KnowledgeImportReport>;
  exportBundle?(req: KnowledgeBundleExportRequest): Promise<KnowledgeExportReport>;
  sync?(req: KnowledgeSyncRequest): Promise<KnowledgeSyncReport>;

  rebuildIndexes?(req: RebuildKnowledgeIndexesRequest): Promise<KnowledgeIndexReceipt>;
  health(): Promise<KnowledgeProviderHealth>;
}
```

Provider-specific extensions MUST be optional and MUST NOT be required for baseline Mini App portability unless declared in the SPAAS capability contract.

---

# 7. Canonical Knowledge Objects

Spec 281 uses the semantic model owned by Spec 266 and adds runtime representations needed for portable execution.

## 7.1 KnowledgeSpace

```ts
interface KnowledgeSpace {
  id: string;
  stableId: string;
  title: string;
  description?: string;
  scope: 'app'|'project'|'team'|'tenant'|'user'|'public';
  ownerRef: string;
  appId?: string;
  projectId?: string;
  schemaVersion: string;
  rightsPolicyRef?: string;
  retentionPolicyRef?: string;
  retrievalPolicyRef?: string;
  researchPolicyRef?: string;
  createdAt: string;
  updatedAt: string;
}
```

`stableId` MUST survive provider migration where identity equivalence is preserved.

## 7.2 KnowledgeDocument

```ts
interface KnowledgeDocument {
  id: string;
  stableId: string;
  spaceId: string;
  sourceId?: string;
  title: string;
  mediaType: string;
  language?: string;
  canonicalUri?: string;
  contentRef?: string;
  contentHash: string;
  sourceRevision?: string;
  rightsPolicyRef?: string;
  createdAt: string;
  updatedAt: string;
}
```

## 7.3 KnowledgePage / Section

```ts
interface KnowledgePage {
  id: string;
  stableId: string;
  documentId: string;
  path: string;
  title?: string;
  summary?: string;
  ordinal?: number;
  content?: string;
  contentHash: string;
  anchors?: KnowledgeAnchor[];
}
```

A page may represent a literal page, Markdown section, HTML section, code module, transcript segment, or another source-preserving structural unit.

## 7.4 KnowledgeChunk

```ts
interface KnowledgeChunk {
  id: string;
  stableId: string;
  pageId: string;
  documentId: string;
  text: string;
  startAnchor?: string;
  endAnchor?: string;
  tokenCount?: number;
  contentHash: string;
  chunkerProfile: string;
  ordinal: number;
}
```

Chunking is a retrieval projection. Stable source anchors MUST be preserved so citations can resolve back to the source structure.

## 7.5 KnowledgeSource

```ts
interface KnowledgeSource {
  id: string;
  stableId: string;
  spaceId: string;
  sourceType: 'file'|'url'|'api'|'database'|'mcp'|'manual'|'research'|'other';
  title?: string;
  canonicalUri?: string;
  providerRef?: string;
  fetchedAt?: string;
  publishedAt?: string;
  contentHash?: string;
  rightsPolicyRef?: string;
  provenanceRef?: string;
}
```

## 7.6 KnowledgeClaim

```ts
interface KnowledgeClaim {
  id: string;
  stableId: string;
  spaceId: string;
  statement: string;
  sourceRefs: string[];
  evidenceRefs?: string[];
  pageRefs?: string[];
  claimType: 'source_assertion'|'derived'|'summary'|'manual';
  verificationState?: string;
  confidence?: number;
  lastVerifiedAt?: string;
  limitations?: string[];
}
```

Confidence MUST NOT be presented as factual certainty unless a domain policy explicitly defines that interpretation.

## 7.7 ResearchSeed

```ts
interface ResearchSeed {
  id: string;
  stableId: string;
  spaceId: string;
  query: string;
  status: 'pending'|'active'|'done'|'failed'|'cancelled';
  parentSeedId?: string;
  depth?: number;
  budgetPolicyRef?: string;
  createdAt: string;
}
```

ResearchSeed is optional in portable runtimes. It MUST NOT require an autonomous research agent merely to read/search a knowledge space.

## 7.8 Citation

```ts
interface KnowledgeCitation {
  citationId: string;
  sourceId?: string;
  documentId: string;
  pageId?: string;
  chunkId?: string;
  anchor?: string;
  quoteHash?: string;
  title?: string;
  canonicalUri?: string;
  sourceRevision?: string;
}
```

Citations MUST resolve without relying solely on a vector index ID.

---

# 8. Portable Local Reference Runtime

The default portable reference implementation SHOULD use SQLite because it is broadly deployable, self-contained, backup-friendly, and suitable for small-to-medium Mini App knowledge bases.

This is a reference profile, not the canonical identity of Spec 281.

## 8.1 Reference Components

```text
knowledge/
├── knowledge.db
├── blobs/
├── documents/
├── indexes/
└── runtime.json
```

`knowledge.db` SHOULD contain canonical portable metadata/content sufficient to rebuild derived indexes.

## 8.2 Reference SQLite Tables

Recommended logical tables:

```text
knowledge_spaces
knowledge_sources
knowledge_documents
knowledge_pages
knowledge_chunks
knowledge_claims
knowledge_claim_sources
research_seeds
knowledge_revisions
knowledge_tombstones
knowledge_imports
knowledge_sync_state
knowledge_index_state
```

FTS5 tables MAY include:

```text
knowledge_pages_fts
knowledge_chunks_fts
```

Embeddings SHOULD be stored in a separate derived table or provider-specific index:

```text
knowledge_embeddings
```

Deletion of canonical content MUST invalidate or delete its derived index rows.

## 8.3 FTS5 / BM25

Portable baseline keyword retrieval SHOULD support:

- phrase/exact queries;
- tokenized lexical search;
- BM25 ranking;
- field weighting where supported;
- title/path/content search;
- deterministic filters for space/document/source metadata.

Language-specific tokenization MAY be provided by optional adapters. A provider MUST truthfully report limitations for Thai/mixed-language lexical search.

## 8.4 Local Vector Search

Semantic search MAY use:

- SQLite vector extension;
- embedded/local vector engine;
- sidecar vector service;
- in-process brute-force search for small indexes;
- no semantic index at all when only keyword search is required.

The baseline portable contract MUST remain usable without a paid cloud embedding API.

---

# 9. Embedding and Index Portability

## 9.1 Canonical Rule

The following are canonical portable data:

- documents/content permitted for export;
- pages/sections;
- chunks and stable source anchors;
- sources;
- claims;
- provenance references;
- rights/retention metadata;
- content hashes;
- schema/version metadata.

The following are derived artifacts:

- embeddings;
- vector indexes;
- FTS indexes;
- reranker caches;
- query caches;
- provider-specific search IDs;
- provider-specific ranking scores.

## 9.2 EmbeddingProfile

```ts
interface EmbeddingProfile {
  profileId: string;
  provider?: string;
  model: string;
  dimensions: number;
  metric?: 'cosine'|'dot'|'euclidean';
  tokenizerOrInputProfile?: string;
  normalization?: string;
  createdAt: string;
}
```

An imported bundle containing vectors MUST declare the exact profile.

A runtime MUST NOT interpret vectors generated by one profile as compatible with another merely because dimensions match.

## 9.3 Re-embedding

If the destination provider cannot consume the source embedding profile:

```text
import canonical content
→ mark semantic index REBUILD_REQUIRED
→ rebuild embeddings/index locally or remotely
→ verify index generation
→ activate semantic/hybrid search
```

Keyword/exact retrieval SHOULD remain available during rebuild when possible.

---

# 10. Retrieval Semantics

## 10.1 Normalized Request

```ts
interface KnowledgeSearchRequest {
  spaceIds: string[];
  query: string;
  mode?: 'auto'|'exact'|'keyword'|'semantic'|'hybrid';
  filters?: Record<string, unknown>;
  limit?: number;
  citationRequired?: boolean;
  freshnessRequirement?: string;
  rightsContextRef?: string;
  principalRef: string;
}
```

## 10.2 Normalized Response

```ts
interface KnowledgeSearchResponse {
  providerId: string;
  providerMode: 'managed'|'portable'|'connected'|'external';
  plan: string;
  hits: KnowledgeSearchHit[];
  evidenceReceipt: KnowledgeEvidenceReceipt;
  degradedCapabilities?: string[];
}
```

Each hit SHOULD expose:

```text
stable object identity
source/document/page/chunk refs
snippet
rank/score metadata
citation
freshness metadata
verification/admission metadata when available
```

## 10.3 SmartAIHub-managed Retrieval

For `managed` and SmartAIHub `connected` mode:

```text
Spec 281 request
  → SmartAIHub Adapter
  → Spec 229 Retrieval Broker
  → managed retrieval plan
  → Spec 266 ACL/rights/evidence gates
  → normalized Spec 281 response
```

Spec 281 does not prescribe a second RRF or reranking formula inside SmartAIHub.

## 10.4 Portable Hybrid Retrieval

The reference portable provider MAY implement:

```text
keyword/BM25 candidates
+
semantic candidates
↓
Reciprocal Rank Fusion (RRF)
↓
optional reranking
↓
source/rights filters
↓
normalized evidence response
```

Provider-specific score magnitudes MUST NOT be treated as portable across providers.

## 10.5 Exact / Symbolic Queries

Portable providers SHOULD support deterministic lookup for:

- IDs;
- filenames;
- paths;
- version strings;
- error codes;
- API routes;
- identifiers;
- exact quoted phrases.

Semantic-only search MUST NOT be the sole retrieval method for symbolic queries.

---

# 11. Portable Knowledge Bundle

Spec 281 defines **SmartAIHub Portable Knowledge Bundle (PKB) v1**.

A PKB is an exchange artifact, not a live database format.

Recommended layout:

```text
knowledge.bundle/
├── manifest.json
├── spaces.jsonl
├── sources.jsonl
├── documents.jsonl
├── pages.jsonl
├── chunks.jsonl
├── claims.jsonl
├── citations.jsonl
├── research-seeds.jsonl          # optional
├── blobs/                        # optional / rights-gated
├── indexes/                      # optional derived cache only
├── embeddings/                   # optional derived cache only
├── licenses/
├── notices/
└── integrity/
    ├── hashes.json
    └── signature.json            # optional/required by policy
```

## 11.1 Bundle Manifest

```json
{
  "schema": "knowledge.smartaihub.app/v1",
  "bundleId": "kb_xxx",
  "createdAt": "2026-10-04T00:00:00Z",
  "createdBy": "principal_ref",
  "spaces": ["space_support"],
  "contentSchemaVersion": "1.0",
  "sourceAuthority": "managed|portable|external",
  "exportPolicyRef": "policy_ref",
  "containsRawContent": true,
  "containsEmbeddings": false,
  "embeddingProfiles": [],
  "integrityAlgorithm": "sha256"
}
```

## 11.2 Bundle Rules

A bundle MUST NOT contain:

- plaintext API keys;
- secret-store values;
- access tokens;
- refresh tokens;
- reusable user session cookies;
- unauthorized tenant/private data;
- provider data whose redistribution is forbidden.

A bundle MUST preserve attribution and license notices required by source policy.

## 11.3 Derived Index Inclusion

Embeddings/indexes MAY be included as an optimization only when:

- redistribution is permitted;
- model/provider terms permit it;
- the exact profile is declared;
- the destination validates compatibility.

The destination MUST be able to discard all included derived indexes and rebuild from canonical content.

---

# 12. SPAAS Manifest Extension

Spec 261 remains manifest authority. Spec 281 proposes the following knowledge declaration shape.

```yaml
knowledge:
  apiVersion: knowledge.smartaihub.app/v1
  required: true

  spaces:
    - id: product-support
      scope: app
      seedPath: knowledge/product-support

  capabilities:
    exactSearch: required
    keywordSearch: required
    semanticSearch: preferred
    hybridSearch: preferred
    citations: required
    claims: optional
    researchSeeds: optional

  deployment:
    allowedModes:
      - managed
      - portable
      - connected
      - external
    preferredMode: managed

  portable:
    provider: sqlite
    lexical: fts5
    semantic: optional
    bundleSchema: knowledge.smartaihub.app/v1

  providerRequirements:
    offline: false
    exportable: true

  sync:
    mode: none|pull|push|bidirectional
    authority: managed|portable|external
    conflictPolicy: reject|manual|policy
```

Secrets MUST be declared by reference through the applicable secret/credential system, not inline.

---

# 13. Package Layout

A SPAAS package MAY include:

```text
my-mini-app/
├── app.manifest.yaml
├── app.lock.json
├── knowledge/
│   ├── manifest.yaml
│   ├── spaces/
│   ├── seed/
│   ├── schemas/
│   ├── adapters/
│   └── migrations/
└── ...
```

The application package SHOULD contain definitions and redistributable seed knowledge only.

User/tenant production knowledge requires a separate authorized data export unless policy explicitly states otherwise.

---

# 14. Import Semantics

Import SHALL be staged.

```text
Receive bundle
→ validate schema/version
→ verify integrity/signature when required
→ scan content/security
→ evaluate rights/redistribution
→ map spaces/identities
→ detect duplicates
→ validate source/claim relationships
→ import canonical content
→ mark indexes stale/rebuild-required
→ rebuild provider indexes
→ verify counts/hashes/citations
→ activate
```

Import MUST produce a report containing:

- accepted objects;
- rejected objects;
- duplicate/merged objects;
- rights failures;
- missing blobs;
- unsupported schema fields;
- index rebuild state;
- citation integrity failures;
- migration warnings.

Partial import MUST NOT be reported as full success.

---

# 15. Export Semantics

Export SHALL evaluate:

- principal authorization;
- tenant/app ownership;
- raw export rights;
- result export rights;
- redistribution rights;
- retention/deletion state;
- privacy/data-subject restrictions;
- source attribution;
- secret/reference sanitization.

Export SHOULD support:

```text
schema-only
seed-only
selected spaces
selected documents
full authorized portable data
```

An export receipt MUST record:

- exporter principal;
- source deployment;
- included scopes;
- excluded content and reasons;
- rights policy revisions;
- object counts;
- hashes;
- schema version.

---

# 16. Migration Scenarios

## 16.1 SmartAIHub → Standalone

```text
SmartAIHub Spec 266
→ authorized PKB export
→ standalone installation
→ local provider import
→ local FTS/index rebuild
→ local embedding rebuild if enabled
→ citation/integrity verification
→ activate
```

## 16.2 Standalone → SmartAIHub

```text
local portable provider
→ PKB export
→ SmartAIHub import/admission
→ Spec 266 identity/rights/provenance mapping
→ Spec 229 managed indexing
→ verification
→ activate
```

Portable local claims MUST NOT bypass Spec 266 admission merely because they existed in a local runtime.

## 16.3 External Provider → SmartAIHub

Use adapter/export when possible. If query-in-place is required by rights or scale, bind the external provider and import only permitted metadata/projections.

## 16.4 SmartAIHub → Customer External Provider

Export canonical portable content only where rights permit. Rebuild the destination's provider-specific indexes.

---

# 17. Synchronization

Portability and synchronization are separate capabilities.

A Mini App MAY be portable without supporting live sync.

## 17.1 Sync Modes

```text
none
pull
push
bidirectional
```

## 17.2 Authority

Every synchronized space MUST declare one write-authority policy:

```text
managed-authoritative
portable-authoritative
external-authoritative
policy-mediated-multiwriter
```

Bidirectional multiwriter MUST NOT be enabled merely because both sides can write.

## 17.3 Stable Identity and Revisions

Synchronized canonical objects SHOULD contain:

```text
stable_id
origin_id
revision
content_hash
updated_at
deleted_at/tombstone
source_revision
```

## 17.4 Conflict Rules

Conflicts MUST be explicit.

Default behavior SHOULD be:

```text
same stable_id + same prior revision + one newer revision → fast-forward
same stable_id + diverged revisions → conflict
```

The runtime MUST NOT silently choose the higher timestamp when clock skew or concurrent writes can lose data.

## 17.5 Tombstones

Deletion synchronization MUST use durable tombstone/receipt semantics where required so removed knowledge is not resurrected by stale peers.

---

# 18. Rights, Privacy and Security

## 18.1 Authorization

A portable provider MUST enforce the authorization model available in its environment.

If an application requires tenant/team/row-level authorization that the target provider cannot enforce, deployment MUST fail or require an approved single-principal/single-tenant profile.

## 18.2 Local Data Protection

Portable deployments SHOULD support:

- OS/filesystem permissions;
- encrypted volumes/databases where appropriate;
- per-installation credentials;
- backup encryption;
- secure deletion semantics appropriate to the storage;
- no secrets in logs/bundles;
- configurable data directory.

## 18.3 Untrusted Content

Imported/retrieved knowledge is data, not execution authority.

A document containing instructions to:

- reveal secrets;
- change system policy;
- execute code;
- call tools;
- ignore prior instructions;

MUST NOT gain authority merely because it was retrieved.

## 18.4 Rights Preservation

Local portability MUST NOT be used to bypass:

- provider licensing;
- redistribution restrictions;
- retention restrictions;
- attribution;
- geographic/data-residency restrictions;
- subscription access controls.

---

# 19. Research Seed / Wiki Growth

The portable runtime MAY support a Wiki-style knowledge workflow inspired by persistent research systems:

```text
Seed
→ Research/Acquire
→ Source
→ Page/Document
→ Claim
→ Verify
→ Index
```

Research execution is optional and provider-neutral.

A local runtime MAY:

- queue seeds for later connected execution;
- use a local research agent;
- call SmartAIHub through a connected adapter;
- use an external MCP/A2A research provider;
- remain read-only with no research capability.

Research results MUST preserve original sources and MUST NOT silently become verified canonical claims.

---

# 20. Knowledge UI Contract

Mini App users SHOULD be able to understand knowledge status without understanding RAG internals.

Recommended UI concepts:

```text
Knowledge
├── Search
├── Sources
├── Pages / Documents
├── Claims / Verified facts where applicable
├── Needs review
├── Research queue
├── Import / Export
└── Provider / Sync status
```

The UI SHOULD show:

- where knowledge is stored: SmartAIHub / This device / External;
- whether the app is online/offline;
- last sync/index time;
- source/citation for answers;
- stale or unverified status;
- degraded retrieval capability;
- exportability/rights restrictions when material.

The UI SHOULD NOT expose provider jargon such as vector dimensions unless the user opens advanced settings.

---

# 21. Answer Grounding Contract

A Mini App claiming a grounded answer MUST retain an evidence receipt.

```ts
interface KnowledgeEvidenceReceipt {
  receiptId: string;
  providerId: string;
  providerMode: string;
  spaceIds: string[];
  queryHash: string;
  retrievalPlan: string;
  indexGeneration?: string;
  sourceRevisionRefs: string[];
  citationRefs: string[];
  retrievedAt: string;
  degradedCapabilities?: string[];
}
```

The receipt MUST NOT contain secrets or unnecessary private content.

A receipt proves what retrieval occurred; it does not prove the answer is true.

---

# 22. Index Lifecycle

Each provider SHOULD expose index state:

```text
MISSING
BUILDING
READY
STALE
REBUILD_REQUIRED
DEGRADED
FAILED
```

Canonical writes MUST advance a content generation/watermark.

Search responses SHOULD expose the index generation used where practical.

An index MUST be marked stale/rebuild-required when:

- canonical content changes;
- chunker profile changes;
- embedding profile changes;
- source rights revoke indexed content;
- ACL policy invalidates indexed projections;
- import/migration invalidates provider-specific IDs.

---

# 23. Backup and Restore

Portable local deployments SHOULD support deterministic backup of:

- canonical database;
- permitted document blobs;
- runtime configuration excluding secrets;
- migration/schema version;
- optional derived indexes.

Derived indexes SHOULD be considered disposable for correctness as long as canonical content is intact.

Restore MUST verify:

- schema compatibility;
- content hashes;
- rights/retention policy;
- index generation;
- provider capability compatibility.

---

# 24. External Provider Adapter Requirements

Every external adapter MUST define:

- provider identity/version;
- capability mapping;
- authentication method by reference;
- tenant/scope mapping;
- canonical object mapping;
- query modes;
- citation mapping;
- import/export behavior;
- index lifecycle behavior;
- deletion/revocation behavior;
- error taxonomy;
- health probe;
- migration limitations.

An adapter MUST NOT claim portable equivalence for capabilities it cannot preserve.

---

# 25. Error Taxonomy

Minimum normalized errors:

```text
KNOWLEDGE_PROVIDER_UNAVAILABLE
KNOWLEDGE_CAPABILITY_UNSUPPORTED
KNOWLEDGE_SPACE_NOT_FOUND
KNOWLEDGE_ACCESS_DENIED
KNOWLEDGE_RIGHTS_DENIED
KNOWLEDGE_IMPORT_INVALID
KNOWLEDGE_IMPORT_PARTIAL
KNOWLEDGE_EXPORT_DENIED
KNOWLEDGE_INDEX_NOT_READY
KNOWLEDGE_INDEX_REBUILD_REQUIRED
KNOWLEDGE_EMBEDDING_PROFILE_INCOMPATIBLE
KNOWLEDGE_SYNC_CONFLICT
KNOWLEDGE_SYNC_STALE_PEER
KNOWLEDGE_CITATION_BROKEN
KNOWLEDGE_SCHEMA_INCOMPATIBLE
KNOWLEDGE_QUOTA_EXCEEDED
```

Errors SHOULD include a machine code, human-readable message, retryability and remediation hint.

---

# 26. Observability

The runtime SHOULD expose:

- provider/mode;
- knowledge space count;
- document/page/chunk counts;
- index state/generation;
- last successful import/export/sync;
- retrieval latency;
- keyword/semantic/hybrid mode distribution;
- citation resolution failures;
- stale index rate;
- import rejection reasons;
- sync conflicts;
- rights denials;
- embedding/reindex cost where applicable.

Content telemetry MUST follow privacy/retention policy.

---

# 27. Development Orchestrator Rules

When Spec 224 builds or modifies a Mini App requiring knowledge/RAG, it SHOULD follow:

```text
1. Determine required knowledge capabilities.
2. Check existing SPAAS/Spec 281 declaration.
3. Resolve deployment targets.
4. Resolve provider capabilities.
5. Reuse Spec 281 SDK/provider before generating new storage/search code.
6. Preserve Spec 266 canonical object semantics.
7. For SmartAIHub-managed mode, use Spec 229 Retrieval Broker.
8. Generate migrations only for the selected provider adapter.
9. Generate portability/import-export tests.
10. Verify deploy-outside-SmartAIHub path when portability is claimed.
```

The Development Orchestrator MUST NOT hard-code SmartAIHub cloud infrastructure into a portable Mini App unless the product explicitly declares a connected-only dependency.

---

# 28. Capability Resolver Integration

Example capability declarations:

```text
knowledge.search.keyword
knowledge.search.semantic
knowledge.search.hybrid
knowledge.citation.resolve
knowledge.document.ingest
knowledge.claim.store
knowledge.bundle.export
knowledge.bundle.import
knowledge.index.rebuild
knowledge.sync
knowledge.research.seed
```

Spec 256 may resolve an implementation appropriate to deployment and policy.

---

# 29. Marketplace and White-label Rules

Marketplace packages MAY include:

- knowledge schema;
- retrieval policy;
- index configuration;
- redistributable seed content;
- public/open licensed knowledge bundle;
- provider capability requirements.

Marketplace packages MUST NOT automatically include:

- creator private knowledge;
- tenant production documents;
- user memory;
- secrets;
- licensed provider data without redistribution rights;
- production vector index contents unless explicitly permitted and useful.

A white-label deployment MAY choose a different Spec 281 provider without forking the Mini App source when capability compatibility is preserved.

---

# 30. Performance Guidance

Portable providers SHOULD support bounded resource profiles.

Recommended runtime profiles:

```text
TINY    — small seed wiki / exact + FTS
SMALL   — local FTS + optional embeddings
MEDIUM  — local FTS + vector index + incremental indexing
LARGE   — external/managed provider recommended
```

Thresholds MUST be benchmark-derived rather than hard-coded in this spec because device/storage/provider capabilities vary.

The runtime SHOULD avoid loading the entire knowledge corpus into memory.

---

# 31. Browser-only / Edge Considerations

A SPAAS target with no native SQLite/filesystem capability MAY implement portable knowledge through:

- WASM/OPFS SQLite-like storage;
- a local companion process;
- a remote connected/external provider;
- another provider satisfying the same Spec 281 contract.

The application MUST declare the resulting offline/persistence limitations.

Spec 281 does not mandate one browser database technology.

---

# 32. Provider Selection

Provider selection SHOULD consider:

1. deployment target;
2. offline requirement;
3. dataset size;
4. tenant isolation requirements;
5. security/residency;
6. required retrieval modes;
7. citation requirements;
8. latency;
9. cost;
10. existing customer infrastructure;
11. export/import requirement;
12. operational complexity;
13. user/tenant preference;
14. provider availability.

SmartAIHub SHOULD recommend a provider but MUST preserve explicit user/tenant infrastructure constraints where policy permits.

---

# 33. Reference Flow — New Mini App

```text
User: "Create a product-support Mini App that I can later deploy to my server"

Authoring Intent
   ↓
Spec 224 / SPAAS compiler
   ↓
Knowledge requirements
   ├─ citations required
   ├─ keyword required
   ├─ semantic preferred
   └─ portability required
   ↓
Spec 281 provider policy
   ├─ SmartAIHub deploy → managed
   └─ customer server → portable SQLite or compatible external provider
   ↓
Same Mini App application logic
```

---

# 34. Reference Flow — Export From SmartAIHub

```text
Knowledge Space
   ↓
Authorization + rights check
   ↓
PKB export
   ↓
Package/data transfer
   ↓
Portable provider import
   ↓
FTS rebuild
   ↓
Embedding profile resolution
   ↓
Vector rebuild if enabled
   ↓
Citation/integrity verification
   ↓
READY
```

---

# 35. Reference Flow — Reconnect and Sync

```text
Standalone changes
   ↓
Create canonical revisions
   ↓
Reconnect
   ↓
Compare stable_id + revision/hash + tombstone
   ↓
Fast-forward OR explicit conflict
   ↓
Apply accepted changes
   ↓
Rebuild affected indexes
   ↓
Issue sync receipt
```

---

# 36. Testing Matrix

At minimum the implementation test matrix SHOULD cover:

| Scenario | Managed | Portable | Connected | External |
|---|---:|---:|---:|---:|
| create/read space | ✓ | ✓ | ✓ | ✓ |
| keyword search | ✓ | ✓ | capability | capability |
| semantic search | ✓ | optional | capability | capability |
| hybrid search | ✓ | optional | capability | capability |
| citations | ✓ | ✓ when required | ✓ when required | ✓ when required |
| import/export | ✓ | ✓ | ✓ where allowed | adapter-defined |
| ACL/rights | ✓ | deployment-profile | ✓ | adapter-defined |
| offline | no requirement | capability | no | adapter-defined |
| index rebuild | provider-managed | ✓ | remote | adapter-defined |
| sync | optional | optional | optional | optional |

---

# 37. Acceptance Criteria

## 37.1 Architecture

1. Mini App knowledge calls use a provider-neutral Spec 281 SDK/contract.
2. Managed SmartAIHub retrieval routes through Spec 229 Retrieval Broker.
3. Spec 266 remains canonical knowledge/evidence semantic authority.
4. Spec 261 remains package/deployment authority.
5. Spec 268 memory stores are not silently merged with knowledge stores.

## 37.2 Portable Runtime

6. One reference portable provider operates without SmartAIHub cloud dependency for read/search.
7. The reference provider supports SQLite canonical storage and FTS5/BM25 keyword retrieval.
8. Semantic search can be absent or rebuilt without losing canonical knowledge.
9. Provider capabilities are negotiated before deployment.
10. Unsupported required capability produces an explicit compatibility failure.

## 37.3 Data Model

11. KnowledgeSpace, Source, Document, Page, Chunk and Claim preserve stable identities across export/import where possible.
12. Chunk citations resolve back to source/document/page anchors.
13. Canonical content hashes permit integrity validation.
14. Provider-specific vector/search IDs are not required for canonical recovery.

## 37.4 Bundle Portability

15. PKB export/import roundtrip preserves canonical object counts and hashes subject to authorized exclusions.
16. A bundle can be imported into a destination with a different embedding model by rebuilding the semantic index.
17. Bundles contain no plaintext secrets/tokens.
18. Rights-restricted content is excluded or causes export failure according to policy.
19. Attribution/license metadata survives export/import.
20. Partial import is explicitly reported.

## 37.5 Retrieval

21. Keyword/exact retrieval remains available while embeddings rebuild when supported by the provider.
22. Exact identifiers are not forced through semantic-only retrieval.
23. Grounded answers contain resolvable citations when citations are required.
24. Evidence receipts identify provider/mode/retrieval plan/index generation where available.
25. Provider score values are not compared across incompatible providers as though calibrated identically.

## 37.6 Migration / Sync

26. SmartAIHub → standalone migration can complete without rewriting Mini App application logic.
27. Standalone → SmartAIHub import passes Spec 266 rights/provenance/admission checks.
28. Divergent bidirectional writes produce an explicit conflict rather than silent last-writer data loss.
29. Tombstones prevent deleted content from being automatically resurrected by stale peers.
30. Re-indexing after migration invalidates incompatible old derived indexes.

## 37.7 Security

31. Retrieved/imported content cannot grant execution/tool authority.
32. Cross-tenant data is not exported without authorization.
33. Local deployment does not embed reusable SmartAIHub secrets.
34. Rights and attribution remain enforceable across white-label/export flows.
35. Degraded provider modes never silently disable required authorization/citation guarantees.

## 37.8 Developer Experience

36. Spec 224 can generate a Mini App against Spec 281 without provider-specific application code for baseline operations.
37. Changing from managed to portable provider requires deployment/binding changes rather than business-logic rewrite.
38. Capability Resolver can discover/select knowledge capabilities by semantic capability names.
39. Provider health/index state is observable.
40. Mini App UI can show storage/provider/sync/citation status in user-readable terms.

---

# 38. Implementation Phases

## Phase 0 — Contract and Ownership

- register Spec 281;
- add Spec 266 R1.2 portability boundary;
- align Spec 261 knowledge declaration;
- map Spec 229 normalized retrieval/evidence contract;
- document Spec 268 memory boundary;
- prevent duplicate Mini App RAG implementations.

## Phase A — Core SDK and Types

- KnowledgeSpace/Source/Document/Page/Chunk/Claim types;
- provider capabilities;
- provider SPI;
- normalized request/response/errors;
- evidence receipt;
- health/index state.

## Phase B — SmartAIHub Adapter

- Spec 281 → Spec 229 Retrieval Broker;
- Spec 266 knowledge-space/object mapping;
- managed ingest/hydration;
- rights/ACL/citation mapping;
- export/import bridge.

## Phase C — SQLite Portable Provider

- SQLite schema/migrations;
- FTS5 search;
- source/document/page/chunk/claim storage;
- local file/blob paths;
- index generation;
- backup/restore;
- optional embedding provider SPI.

## Phase D — Portable Knowledge Bundle

- PKB schema;
- export/import;
- hash verification;
- rights/attribution;
- optional signing;
- derived index handling;
- roundtrip tests.

## Phase E — SPAAS / Deployment Integration

- manifest schema extension;
- provider capability resolution;
- installation/materialization bindings;
- white-label/external deployment path;
- Development Orchestrator generation rules.

## Phase F — Sync / Migration

- stable IDs/revisions;
- authority modes;
- pull/push;
- tombstones;
- conflicts;
- sync receipts;
- managed ↔ portable certification.

## Phase G — External Provider SPI

- one reference external adapter;
- adapter conformance suite;
- enterprise/custom provider documentation;
- MCP/API bridge profile where appropriate.

## Phase H — UX / Observability

- Knowledge settings UI;
- source/citation UI;
- provider/deployment state;
- sync/import/export flows;
- index health;
- actionable compatibility errors.

---

# 39. Production Definition of Done

The first production-ready Spec 281 slice requires:

1. provider-neutral SDK/types available;
2. SmartAIHub managed adapter passing Spec 229 path verification;
3. SQLite portable provider passing conformance tests;
4. PKB export/import roundtrip certified;
5. embedding-profile mismatch rebuild tested;
6. citation preservation tested;
7. rights/ACL export denial tested;
8. no-secrets bundle scan passing;
9. one Mini App deployed both inside SmartAIHub and standalone without application-logic fork;
10. provider capability negotiation visible in deployment diagnostics;
11. backup/restore of the portable provider tested;
12. one managed → portable → managed roundtrip tested with explicit admission/reconciliation;
13. index stale/rebuild lifecycle observable;
14. Spec 224 generation path uses the contract rather than creating ad-hoc RAG code;
15. Spec 261 package validates knowledge declarations and data/package separation.

---

# 40. Hard Non-Goals

Spec 281 does NOT:

- replace Spec 261 SPAAS;
- replace Spec 266 Intelligence Fabric;
- replace Spec 229 Retrieval Broker inside SmartAIHub;
- replace Spec 268 Memory Runtime;
- require every Mini App to use RAG;
- require semantic search for every Mini App;
- require SQLite in every deployment;
- require Cloudflare services in standalone deployments;
- require SmartAIHub connectivity for portable read/search;
- make embeddings canonical data;
- treat local Wiki pages as automatically verified facts;
- bypass rights/redistribution policy through export;
- promise identical ranking across different providers;
- permit silent multiwriter conflict resolution;
- require external provider data to be copied into SmartAIHub when query-in-place is preferable.

---

# 41. Reference Design Notes from `pro-workflow`

The `rohitg00/pro-workflow` project demonstrates a useful local knowledge-plane pattern:

```text
Wiki
├── pages
├── sources
├── claims
├── research seeds
└── embeddings

Retrieval
├── FTS5/BM25
├── vector search
└── RRF hybrid fusion
```

Spec 281 adopts the useful abstractions, but intentionally differs in several areas:

1. SmartAIHub requires multi-tenant/ACL/rights-aware semantics.
2. A Mini App may run managed, portable, connected or external.
3. Canonical data must survive provider migration.
4. Chunk-level source anchoring is required for scalable RAG precision.
5. Embeddings/indexes are explicitly derived and rebuildable.
6. SmartAIHub-managed retrieval remains owned by Spec 229.
7. Canonical evidence/provenance remains owned by Spec 266.
8. SPAAS remains the package/deployment authority.

`pro-workflow` is a design reference, not a runtime dependency.

---

# 42. Canonical Architectural Principle

> **A SmartAIHub Mini App owns a portable knowledge requirement, not a database vendor. Canonical knowledge content, provenance, rights and stable identities move across deployments; provider-specific indexes and embeddings are rebuildable projections. SmartAIHub-managed deployments use the shared Intelligence Fabric and Retrieval Broker, while standalone and customer deployments may satisfy the same contract locally or through external providers without rewriting application logic.**

---

## Appendix A — Responsibility Matrix

| Concern | Canonical owner |
|---|---|
| App/package identity | Spec 261 |
| Deployment/materialization | Spec 261 |
| Knowledge/evidence semantics | Spec 266 |
| SmartAIHub managed RAG/search | Spec 229 |
| Memory | Spec 268 |
| Portable knowledge provider contract | Spec 281 |
| SQLite portable Wiki RAG reference provider | Spec 281 |
| Portable Knowledge Bundle | Spec 281 + Spec 266 rights semantics |
| App build/development protocol | Spec 224 |
| Capability discovery/routing | Spec 256 |
| Provider secrets | canonical secret/credential system |

## Appendix B — Minimum Conformance Profile

A provider claiming `portable-basic` MUST support:

```text
KnowledgeSpace
KnowledgeSource
KnowledgeDocument
KnowledgePage
KnowledgeChunk
keyword search
citation resolution
import/export canonical content
index rebuild state
health
```

A provider claiming `portable-hybrid` additionally MUST support:

```text
semantic search
hybrid search
embedding profile
semantic index rebuild
```

A provider claiming `portable-sync` additionally MUST support:

```text
stable revisions
tombstones
sync authority
conflict reporting
sync receipts
```

## Appendix C — Suggested Local SQLite Indexes

```text
knowledge_spaces(stable_id)
knowledge_sources(space_id, stable_id)
knowledge_documents(space_id, stable_id, content_hash)
knowledge_pages(document_id, stable_id, ordinal)
knowledge_chunks(document_id, page_id, stable_id, ordinal, content_hash)
knowledge_claims(space_id, stable_id)
research_seeds(space_id, status)
knowledge_revisions(stable_id, revision)
knowledge_tombstones(stable_id, deleted_at)
knowledge_index_state(space_id, index_kind, generation)
```

FTS/vector implementation details remain provider-specific.

## Appendix D — Migration Proof Artifact

A migration certification SHOULD emit:

```json
{
  "sourceProvider": "smartaihub",
  "destinationProvider": "sqlite",
  "bundleSchema": "knowledge.smartaihub.app/v1",
  "spaces": 1,
  "documents": 84,
  "pages": 213,
  "chunks": 1482,
  "claims": 617,
  "sourceHashCheck": "pass",
  "citationCheck": "pass",
  "rightsCheck": "pass",
  "embeddingAction": "rebuilt",
  "destinationIndexState": "READY"
}
```

Counts are illustrative; conformance tests MUST use actual fixture values.


## 14. Policy-conformance amendment — managed runtime and OCI boundary

This amendment preserves Spec 281 as the Portable Mini App Knowledge Runtime & Wiki RAG specification and reconciles its deployment wording with current repository runtime policy. It is a policy-conformance amendment, not abandonment or retirement of this Spec.

- SmartAIHub-managed execution MUST use runtime substrates approved by current lifecycle and security policy.
- Docker and OpenSandbox MUST NOT be used or described as SmartAIHub-managed execution or dispatch runtimes. SmartAIHub itself MUST NOT require a Docker daemon or OpenSandbox dispatch to run this capability.
- OCI-compatible packaging MAY be provided as a portability/export target for external or customer-owned infrastructure when required. Customer-owned container infrastructure MAY consume that artifact outside the SmartAIHub-managed runtime boundary.
- OCI packaging grants no execution authority. Packaging, deployment, signing, installation, and lifecycle authority remain governed by Spec 261 and current lifecycle/security policy.
- Portable runtime behavior and the knowledge capability contract remain in scope; provider-specific execution substrate selection remains outside this Spec.
