# SPEC-268 Wiki-first W0 — source inventory and migration seams

**Observed:** 2026-10-19  
**Status:** W0 **PARTIAL (static repository read-only inspection)**. No runtime/production inspection, workload measurements, or migration acceptance.  
**Baseline:** Current `main` files fetched via GitHub connector; per-file blob hashes below. Branch or repository HEAD may move independently; revalidate before implementation.
**Predecessor:** [Wiki-first Managed/BYO R2 decision](wiki-first-managed-byorr2-20261019.md), integrated by PR #1158. Design merge is not runtime deployment.

## Source-confirmed current implementation

| Existing surface | Source-backed findings | Migration implication |
|---|---|---|
| `apps/web/server/services/scopedMemoryService.ts` (blob `419759e5cc45ae6a56ef3c07a3b36dcfd25e2249`) | Imports `getDb`, `scopedMemories`; create/get/update/delete/list/promote/search operate on the SQL table. Search uses PostgreSQL `to_tsvector('english', ...)` and, when available, `embedding <=> ...::vector(1536)`; tenant and project filters are part of queries. | Main adapter seam for future authorized memory CRUD and retrieval. A storage-provider configuration cannot replace this direct SQL implementation without preserving filtering, expiry, ordering, paging and scoring. Thai language search must be evaluated separately. |
| `apps/web/server/services/memoryService.ts` (blob `661e96b97f82122d0da3764068956506d071be00`) | Legacy buffer, summary, entity memory; reads/writes `entityMemories`, `conversationSummaries`, chat-related SQL entities and current ACL/provenance inputs. | Must inventory *all* entity and summary writer entrypoints and avoid making R2 Wiki a second active writer of the same facts. |
| `apps/web/server/routers/memory.ts` (blob `ea9f5d4917733f7aab5e9d0189fa31662c88e53c`) | Protected tRPC router exposes memory/context/archive functions and calls the existing SQL-backed services. | Keep public API behavior; route through existing authorization and the canonical memory authority rather than a new unscoped Wiki endpoint. |
| `apps/web/server/routers/chat.ts` (blob `cd6d980c6def74faaab5d1ed29aaf47358a97aab`) | Chat router imports memory CRUD/context from `chatService`. | Separate ingress path; direct changes only to `memoryRouter` would miss legacy Chat operations. |
| `apps/web/server/services/promptComposer.ts` (blob `0e3aeb789b2a5bf4b20f00102c6db91e0a5afc0c`) | Combines persona, scoped retrieval, entity memory and context budgets. | Preserve authorized context assembly and final reauthorization; never hydrate R2 links into prompts before scope checks. |
| `apps/web/server/services/teamRoomMemoryService.ts` (blob `61812d41ad747fb14855fa3f1f1371ada6e746a2`) | Uses scoped/entity service, captured canonical Project binding and team-room policy. | Do not enable disabled durable team-room memory as a side effect of Wiki rollout. |
| `apps/web/server/services/memoryArchiveService.ts` (blob `b240369bc93730569c9d8f1089dba0196d4d3581`) | Encrypted JSONL **raw-chat archive**, file-backed, indexed by `memory_archive_metadata` in SQL. | Not the proposed Wiki content store. Do not silently migrate raw chat transcripts or remove archive retention/restore semantics. |
| `apps/web/server/services/queryEmbeddingService.ts` (blob `1765a3cc5f4b5fea57980f81303cddf4ab2b6652`) | Wraps 1,536-dimensional query embeddings with a short-lived cache. | Retrieval projection migration must preserve model/dimension version and avoid accidental platform retention of BYO private embeddings. |
| `apps/web/server/routers/infrastructure.ts` (blob `45cae6597b56cc3c424592276be03cb5ba7fbe09`) | Imports `cloudflareCredentialCenter` operations used for platform/admin Cloudflare deployment credentials. | Credential center may supply patterns, **not** a verified user/tenant-scoped BYO R2 Memory binding. A new user-owned credential flow needs separate authority and negative tests. |
| `apps/web/server/services/__tests__/integration/smartAiHubR5PersistedMemory.integration.test.ts` (blob `db0a2b124bba88a817fbe1ab9d207db7a98bf384`) | Guarded native persisted memory isolation acceptance cases using a disposable PostgreSQL test database and trusted App-context assertions. | Extend rather than replace isolation evidence; no R2 tests have been observed in this file. |
| `apps/web/server/services/__tests__/memoryServiceNativeProvenance.integration.test.ts` (blob `b34413b9d28bb8015d47784e7bfa3799ad3152b5`) | Existing native PostgreSQL provenance/owner and source-conversation regression harness. | Migration must preserve source attribution and foreign conversation denial. |

The above files were fetched directly from current GitHub repository paths. The inventory is intentionally *not* a claim to have discovered every memory, R2, attachment, vector, or secret writer in the repository.

## Existing protections and non-regressions

- PR #425: constrained memory recall to authorized global/current-project scopes.
- PR #524: fixed graph-retrieval owner/tenant filters and added persisted shared-project/private isolation.
- PR #995: fixed cross-project entity memory merge.
- PR #997: enforced source-conversation owner matching.
- PR #998: fixed SQL expiry recall behavior and missing-table error handling.
- PR #999: protected Chat-side memory scope and foreign source decisions.
- Preserve Project/App/tenant receipt gates from SPEC-268/269/302; do not infer project by semantic similarity, user ID or a note's frontmatter.
- Current SPEC-268 section 26 explicitly makes PostgreSQL canonical for structured native memory pending approved future change. PR #1158 only adds a design file; until W1 normative amendment and migration, **PostgreSQL remains authoritative for existing persisted memory**.
- System memory/operational state and SPEC-266 original document/evidence authority are out of scope. Wiki-first applies to durable *user-owned memory*, not every source under the word `memory`.

## Key gaps before implementation

1. **Unverified legacy-write inventory:** All direct `scopedMemories`/`entityMemories` CRUD, `chatService` wrappers, scheduled compaction, promotions, Archive, provider-facing retrieval, app/agent consumers, workers and SQL schema constraints need read-only call graph and exact table inventory. Only sample paths above have been source confirmed.
2. **Provider/API seam unknown:** No demonstrated production-ready `ManagedR2UserMemoryProvider` or `BYOR2UserMemoryProvider`; do not conflate Mini App deployment R2 resources or Python Library R2 storage with user Memory. Confirm existing R2/storage SPI and secret authority before implementation.
3. **Real dataset/counts unknown:** No access to actual production note counts, storage volume, write QPS, vector bytes, per-scope cardinality, deletion obligations, or current migration epochs. Do not invent cost/throughput estimates.
4. **Index/authorization responsibility:** Need decide where rebuildable Wiki search/backlinks/cache live, whether BYO owner opts in to platform embeddings, and how revoked grants invalidate projections. R2 prefix and Markdown `scope` do not authorize access.
5. **R2 operational behavior:** Verify actual conditional-write SDK calls, 412 conflict behavior, incremental cursor/index limits, bucket-scoped credential policies, region/egress, propagation/cutover, outage and revocation semantics; no multi-object transaction.
6. **Migration scope split:** Session buffers, raw chat archives, platform operational memory, project-shared Wiki, user-global Wiki, Mini App-private Wiki all have different ownership and retention. Document each migration classification before copying data.

## Smallest safe execution path

**W0a — Complete source and data inventory (read-only):** Run targeted `rg` against latest `origin/main` for storage tables, direct SQL writers, `memoryRouter`/`chatService`, background workers, current R2 clients and credential interfaces. Build writer/reader matrix and snapshot migration prerequisites. Query production metrics only through explicitly authorized read-only diagnostics, not by guessing.

**W1 — Canonical authority contract:** Amend SPEC-268 via `tools.spec_handoff`/canonical authoring process with the Wiki-first exception applying only to durable user-owned memory. Define transport-independent `WikiNote`, `MemoryStorageBinding`, `WikiStorageAdapter`, versioned grants and migration fence. Keep handoff unresolved.

**W2 — Adapter-first isolated implementation:** Add a minimal test-only Managed/BYO R2 adapter behind existing memory authority and disabled by default. Unit/conformance tests: identity/scope, request-scoped auth, wrong-bucket/key, revoked key, conditional write lost-update, deletion, export, generation mismatch, no fallthrough to platform R2, no secrets logged. Use existing SPEC-272 secret authority; never put credentials into Markdown/LLM or client.

**W3–W5 — Storage/index and safe pilot:** Incremental Wiki index/links with stable IDs, shadow-read/persisted parity, export/import, fenced migration, rollback and focused non-production tenant/project/App isolation matrix. Extend existing native tests; keep legacy PostgreSQL the canonical writer until authorized cutover.

**W6 — Release gate:** Production rollout is separate and requires SPEC-295 migration authorization and SPEC-268 acceptance. Do not expand SPEC-224 before its own verified closure.

## Suggested direct Codex W0 command

> On latest origin/main, continue SPEC-268 Wiki-first W0 from `design/wiki-first-w0-source-inventory-20261019.md` and PR #1158. Complete *read-only* source writer/reader/call-graph inventory across Chat, scoped/entity/summary, background, R2, Vectorize and secrets. Produce evidence paths and exact SHA, data model and migration classes. Do not implement provider migration or touch production. Use a clean canonical checkout if current worktree is dirty, preserve concurrent sessions, then integrate only a focused verified W0 artifact through required repository gates. If evidence is missing, mark it UNKNOWN and continue independent W0 items.

## Verification at this checkpoint

- Read exact current `main` files through GitHub connector and recorded blob identities.
- Retrieved PR diff path inventories for #425, #524, #875, #995, #997, #998, #999 and #1158.
- **No source checkout, SQL runtime query, automated tests, application build, provider credentials, cloud resources, migration, deployment, or production acceptance** performed here.
