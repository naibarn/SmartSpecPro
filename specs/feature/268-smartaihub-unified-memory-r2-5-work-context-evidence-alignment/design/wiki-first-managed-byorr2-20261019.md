# SPEC-268 design decision — Wiki-first user memory (Managed R2 / BYO R2)

**Date:** 2026-10-19
**Status:** Proposed architecture / design-only; not runtime acceptance or production authorization
**Canonical owner:** SPEC-268; implementation must be incorporated through its authorized handoff/spec writer and existing repository governance before claiming a normative revision
**Scope:** Durable user-owned, App-user, Project, and shared-workspace memory only
**Out of scope:** System-control memory, transactional sources of truth, raw chat transcripts, canonical SPEC-266 document/evidence records, provider-native external memory, and SPEC-224 execution/runtime changes

## Decision

Adopt **Wiki-first, single logical Memory Authority** for *durable user/workspace memory*:

1. Markdown plus portable machine-readable metadata forms the canonical content representation, stored in Cloudflare R2. A memory note keeps the same stable logical ID when its tier, path, provider, or embedding model changes.
2. The owner chooses **SmartAIHub-managed R2** (default) or **bring-your-own Cloudflare R2 (BYO R2)**. A Team/Project Wiki must be bound to the security principal controlling that shared data; a single member's private BYO bucket must not silently become the team's canonical store.
3. Existing SPEC-268 MemorySpace/MemoryView/ACL/retention/forgetting APIs remain canonical. No parallel memory manager, dual-write authority, independent Wiki ACL, or separate orchestration/control plane.
4. Keep only the minimum **platform control-plane registry** (space identity, authorized owner, provider binding, credential reference, ACL/policy epochs, lifecycle state, sync/index watermarks, quotas, migration generation, audit) in the current authorized platform SoR. It is not a second copy of note content. D1 is not mandatory for user-memory content.
5. Vector embeddings, lexical search, backlinks, summaries used for retrieval and caches are **derived, rebuildable projections**, permission-filtered at every hydration boundary. Use existing SPEC-229 Retrieval Broker and SPEC-266 data/knowledge boundaries; optional indexing must not expand the permitted residency or disclosure.
6. PostgreSQL and existing specialized stores remain canonical for platform/system memory, live job state, billing, grants, authorizations, audit and operational data according to their existing owners. This proposal narrows the user-memory storage decision; it does not replace all platform databases.

This explicitly proposes a future **user/workspace-memory-specific exception** to SPEC-268 section 26, which currently recommends PostgreSQL as the canonical platform-managed structured-memory store. The current normative contract is unchanged until the authorized SPEC-268 amendment and migration gates are integrated.

## Proposed portable Wiki format

One Wiki corresponds to an authorized MemorySpace (or an explicit, access-controlled logical grouping of spaces). A portable prefix layout:

```text
<r2-bucket>/<opaque-space-prefix>/
  wiki.json                           # bounded schema/space identity + pointer to index generation
  notes/ab/<stable-note-id>.md        # Markdown body + typed YAML frontmatter
  blobs/<content-addressed-id>        # optional attachments/evidence refs with rights
  projections/...                     # disposable/index generation outputs, never canonical truth
  checkpoints/...                     # bounded restore checkpoints, governed by retention
```

Example **illustrative** note (not a grant):

```yaml
---
schema_version: 1
note_id: mem_01JEXAMPLE
memory_space_id: space_01JEXAMPLE
revision: 3
tier: medium
state: active
updated_at: "2026-10-19T00:00:00Z"
source_refs: ["evidence-ref-1"]
links:
  - target_note_id: mem_01JRELATED
    type: relates_to
---
# Project design decision
An authorized summary with a durable source reference.
```

- Note IDs MUST remain stable across promotion from short/medium/long-term, rename, compaction, export/import and storage migration. Tier is metadata; no copy to a different "short/long memory" database.
- The note owns **outgoing** links; backlinks are computed from an indexed edge projection. Do not persist two independent mutable directions and risk divergence.
- A trimmed/archived note retains references through a permitted tombstone/summary until policy-based expiry. "Permanent links" do **not** override a lawful delete, consent revocation or subject-rights removal. Deleted IDs may use privacy-safe, nonresolving tombstones only when policy permits.
- `wiki.json` MUST NOT be rewritten as a giant per-user/per-tenant manifest on every edit. Use bounded generation pointers and incremental partitioned indexing; no platform-wide or million-note linear scan on each request.
- Storage keys MUST avoid plain user emails, private project names, titles, and guessable personal identifiers. Wiki frontmatter is **untrusted content**, never an authorization source.
- A Markdown/wiki structure is the content standard, **not a new chat transcript format** and not a replacement for SPEC-266's original evidence/document authority.

## Storage provider binding

**Managed R2:** Private platform-owned bucket/prefix, no public R2 domain, server-side scope resolution. Prefix is organization only; it is not a security boundary. The gateway enforces access on every operation.

**BYO R2:** User/tenant registers Cloudflare account, bucket and explicit region/jurisdiction where relevant, plus bucket-scoped S3-compatible read/write credentials stored only through the existing SPEC-272 secret authority. The browser must never receive long-lived keys. Provisioning performs capability, consent, region, object-access, conditional-write and delete tests. R2 S3 endpoint belongs to the *owner's* Cloudflare account; do not silently create a new platform copy.

- A BYO credential's actual bucket permissions must be tested. Do not infer prefix-level permissions from a prefix string or assume a bucket-wide token is isolated to one Wiki.
- Binding state: `PENDING_VALIDATION`, `ACTIVE`, `READ_ONLY`, `DEGRADED`, `REVOKED`, `MIGRATING`. Invalid/revoked BYO credential MUST fail closed, not silently fail over into Managed R2.
- Users must know whether SmartAIHub is retaining content-derived embeddings/summaries on its infrastructure. Indexing/export/disclosure requires explicit policy/consent for that destination. Private memory must not enter public search indexes, logs or external agents without authorization.
- Provider routing is `MemorySpaceId -> server-authorized binding -> R2 adapter`; the client cannot choose arbitrary storage references. Separate storage binding and access rights; possession of a bucket/path does not authorize a SmartAIHub MemoryView.
- Project/shared memory uses the **project/organization's authorized provider binding**, not an individual collaborator's personal BYO bucket by default. Member removal revokes future gateway access while storage owner's direct access is governed separately by R2 credentials and ownership policy.

## Safe updates, graph links and lifecycle

- For a single object, use revision + ETag conditional `PutObject` (`If-Match` /`If-None-Match`) with retry/conflict reporting. Cloudflare R2 supports atomic conditional object writes; it does **not** provide an atomic transaction across Note, Manifest and Index objects. Use durable intent/outbox plus generation-watermark reconciliation through existing job/control-plane ownership. Never report a multi-object write as committed until canonical-note/registry reconciliation is established.
- Concurrent agents may propose edits, but only the authorized MemorySpace writer commits. Failed preconditions cannot overwrite newer user edits; conflicts are merge/review inputs, not silent last-write-wins.
- Rebuildable graph projection records both query directions, source revision, authorization scope and watermark. Traversing links is denied until each target note is independently authorized; link titles/existence may be sensitive. Cross-space links remain opaque until explicit grants.
- Incremental housekeeping selects changed/due notes, not an unconditional nightly full traversal. Deduplicate near-identical notes, age short-term content by configurable policy, promote evidence-backed repeatedly useful notes, compact/archive with restore guarantees and preserve stable IDs. Frequent links alone MUST NOT imply truth.
- Track per-MemorySpace total Markdown bytes, note count, object counts, R2 Class A/B operation costs, index/vector bytes, tokens, processing and retention backlog. Quota limits apply without corrupting or silently deleting protected memory. Meter shared space to its designated owner once rather than charging each reference as a new copy.
- Export must yield a versioned, independently readable Wiki archive; restore/import verifies hashes, links, scopes, ACL rebinds and source permissions. Moving Managed <-> BYO follows `inventory -> snapshot -> copy -> hash/link validation -> fenced cutover -> monitor -> source retirement`; source remains authoritative until authorized cutover. No cross-account dual canonical writers.
- Right-to-delete and revocation must remove/deny relevant content, projections, backlinks, caches and temporary export copies subject to retention/legal obligations; verify completion via existing SPEC-268 deletion receipts.

## Security / non-regression boundaries

- Reuse SPEC-268 MemorySpace, MemoryView and grants; SPEC-302 ProjectResolutionReceipt and SPEC-269 App/Chat context authorization; SPEC-272 secret ownership; SPEC-295 production migration gates.
- Always reauthorize **before** R2 access and **after** semantic/graph retrieval, at context hydration/LLM boundary. Filtered Vectorize results are not definitive authorization.
- Guest, App installation, Agent and Team member access must be scoped by current server-verified principal, tenant, app installation, canonical Project, role, ACL/policy epoch, and operation. Revocations invalidate caches, signed URLs and workers within documented revocation boundaries; no unconstrained shared pre-signed URL for private memory.
- Reject SSRF and untrusted endpoints: BYO R2 only supports validated Cloudflare R2 S3 endpoints/account IDs, not arbitrary caller-supplied HTTP URLs. Never include access keys or full unredacted bucket credentials in logs, Wiki, handoff, or memory content.
- A BYO owner can access and edit their own bucket outside the SmartAIHub Gateway. External edits must be detected with revisions/watermarks; no claim that Gateway ACL blocks the bucket owner directly. Tenant-sharing and encryption boundaries must be documented accordingly.
- Legacy project-scope/provenance regressions fixed in PRs #995/#997 must remain covered. No persistent team-room memory enablement or weakened fail-closed behavior merely to accelerate Wiki adoption.

## WorkUnits (all planned, no implementation claimed)

| Unit | Deliverable | Exit criteria |
|---|---|---|
| W0 Inventory | Map actual legacy Chat/structured memory writers, SPEC-268 provider SPI, scope/ACL and R2 adapters. Confirm live ownership, counts and cost baselines. | Evidence-backed source paths, owner and safe migration strategy; no speculative deletion |
| W1 Contract | Promote this decision through the canonical SPEC-268 amendment and handoff writer; approve portable schema, scope/binding model and conformance tests. | Canonical source/handoff/index reconciled; no duplicate SPEC |
| W2 Provider | Build managed/BYO R2 adapters behind existing Memory API, secure binding test and Secret Store references. | Positive/negative conformance and credential-revocation proof |
| W3 Wiki mechanics | Stable ID, Markdown parser, ETag conflict, revisions, opaque cross-space edges, incremental index/rebuild. | Concurrent-write/crash/recovery and graph integrity tests |
| W4 Migration | Per-scope shadow/read comparison, dedup, export/import, fenced cutover, rollback and deletion reconciliation. | No dual canonical writer, source/target counts and quality evidence |
| W5 Pilot | Isolated non-production end-to-end acceptance under current SPEC-268/269/302/295 gates. | Direct persisted tests + quotas/latency/cost measurements |
| W6 Release | Optional, separate production decision after SPEC-224 acceptance and all migration/security gates. | Explicit authorized approval, monitored rollout, rollback drill |

## Mandatory acceptance matrix — NOT EXECUTED

1. Managed R2 personal Wiki write/read/delete/export: tenant/user isolation.
2. BYO R2 connects by bucket-scoped credential; wrong account/bucket or expired key fails closed.
3. An App cannot read USER_GLOBAL or another App's memory without an explicit authorized view.
4. Two Projects and two members cannot traverse private/cross-Project Wiki links.
5. Mid-session grant revocation blocks subsequent R2 hydration and cached/indexed retrieval.
6. User switches providers while another Agent writes: exactly one canonical writer; retry/recovery does not lose an accepted edit.
7. Concurrent same-note edits produce an explicit CAS conflict or safe merge, never silent lost updates.
8. Markdown link rename/tier promotion/compaction leaves stable IDs; backlinks rebuild from source notes.
9. Deletion propagates to Graph, Vector, lexical, cache, temporary exports and policy-governed tombstones.
10. Large Wiki uses incremental operation counts and bounded index work; quotas/meters reflect R2 reads/writes and compute.
11. Cross-region, revoked provider and storage outages do not silently replicate/redirect private data.
12. Export to BYO, re-import to managed and standalone Markdown readability reproduce the same authorized note graph.
13. Owner-edited BYO Wiki changes are detected; corrupt manifest/index is repairable from permitted canonical notes.
14. SPEC-266 citations/provenance survive compaction without converting RAG chunks into canonical user facts.
15. Existing SPEC-268/269/302 cross-scope, trusted-ingress, App clone and legacy provenance tests continue to pass.
16. No production migration, user-data copying, SPEC-224 dispatch change or acceptance status update occurs absent required authority.

## Evidence and rollout status

- Current SPEC-268 source (R2.6) already defines Markdown/Wiki providers, MemorySpace/MemoryView isolation, provider portability, and lifecycle rules, but its section 26 places platform-managed structured memory in PostgreSQL; this proposal is a future user-memory-specific storage change, **not** a claim the current runtime is Wiki-first.
- Existing memory isolation improvements are documented in PRs #995 and #997; their scoped tests do **not** constitute end-to-end Wiki/R2 acceptance.
- SPEC-268's generated handoff currently reports `PARTIAL_INTEGRATED` with unresolved requirements. This design document must not be used to upgrade it.
- This document contains no credentials, schema migrations, code changes, production actions or inferred runtime results.

## Source references

- Canonical: `specs/feature/268-smartaihub-unified-memory-r2-5-work-context-evidence-alignment/spec.md` (R2.6; §§5–6, 24, 26, 33, 45 and R2.6 amendment).
- Cloudflare R2 S3: https://developers.cloudflare.com/r2/get-started/s3/
- Conditional writes: https://developers.cloudflare.com/r2/api/s3/api/
- Consistency model: https://developers.cloudflare.com/r2/reference/consistency/
- R2 token scope: https://developers.cloudflare.com/r2/api/tokens/
- R2 pricing: https://developers.cloudflare.com/r2/pricing/
