# Spec 266 R1.2 — Implementation Plan

## Goal and architecture

Implement the SmartAIHub Intelligence Fabric as one logical governance, identity, lineage, and resolution authority using the repository's established TypeScript/Drizzle service conventions. Expose provider-neutral contracts and narrow server-owned persistence services. Preserve existing subsystem ownership. The durable execution chain is request/admission → canonical `worker_jobs` and outbox → approved runtime binding → immutable run receipt → candidate artifacts → full evidence/rights admission → append-only canonical evidence/knowledge → authorized projections and notices.

The implementation must not equate parser success with policy approval, a vector match with authorization, object storage with canonical authority, or a local test with production readiness. Every transition that crosses trust boundaries revalidates references from server-owned state.

## Current baseline and constraints

- Existing code includes Fabric registry/evidence/research contracts, a Phase-A migration/foundation, registry and request/run persistence helpers, decision adapter seams, and 260/262 geospatial persistence.
- Source-level implementation is partial: durable evidence promotion, full activation/revocation workflow, authoritative health history/composition, canonical research executor/router, artifact scan receipt workflow, research watch outbox consumers, and R1.2 knowledge object persistence/runtime composition remain gaps.
- Focused test runner is Vitest via pnpm. Use only affected tests and bounded package commands.
- `orchestra/.wave-active` is present at the branch base and names an active schema-owner wave. No schema, SQL migration, migration-journal/snapshot edit is allowed during this session. Do not bypass the marker. Schema-dependent acceptance remains explicit and blocked pending its owner.
- The repository prohibits full TypeScript typecheck because of RAM. No repository-wide builds or broad integration suites in this implementation session.
- The source checkout supplied by the user is dirty and on a Spec 261 branch; all work occurs on isolated branch `codex/spec266-unified-data-evidence-20261005` and only the exact Spec 266 R1.2 `spec.md` delta was carried over.

## Shared contracts and ordering

1. Contracts accept bounded plain data, reject unknown/secret-bearing fields, deep-detach nested arrays/objects, and carry explicit contract version and PUBLIC/TENANT scope.
2. DB identities and authorization come from authenticated/server-owned context, never caller JSON, search metadata, provider output, or a job envelope.
3. Registry persistence owns source/dataset identity and review lifecycle. Policy evaluators are pure; persistence/composition loads authoritative policy receipts.
4. Evidence append/promotion requires current source/dataset/revision, rights, scope, methodology where applicable, parent lineage closure, provenance/capture identity, and de-duplication. Rejected candidates do not mutate canonical evidence.
5. Request and canonical job/outbox admission share one transaction. Dispatch carries references only. ResearchRun and evidence receipts are immutable and replay-safe. Outbox publication follows committed durable state.
6. Notice consumers reauthorize current scope and deduplicate stable notice identities.
7. Knowledge canonical objects use stable IDs/source anchors; page/chunk/citation/claim records remain independent of embeddings and provider-specific indexes. Import/export re-evaluates rights and tenant/scope policy.
8. Cross-subsystem adapters map to 260/262/265/278 contracts without duplicating authorities or adding ad hoc runtimes.

## Section 01 — Authority inventory and versioned contracts

**Scope:** §§2–4, 6, 44–45 Phase 0, 46.11–46.12, Appendix A–F.

Verify the compatibility inventory for emergency sources/captures, hydrology observations, watches, refresh jobs, MapLibre projections, Decision Intelligence, Retrieval Broker, SPAAS, and Spec 278 knowledge providers. Ensure each item has one owner, one canonical write path, and an additive adapter boundary. Define versioned source/data/evidence/knowledge references and explicit public/tenant scope; reject unknown versions and ambiguous authority. Reuse `worker_jobs` plus outbox and canonical secrets/auth/audit.

**Likely code areas:** `server/services/intelligenceFabric/contracts.ts`, `researchContracts.ts`, `decisionIntelligence/researchAdapter.ts`, existing compatibility inventory and focused contract tests. Do not rewrite established contracts merely for naming consistency.

**Acceptance:** compatibility inventory names owners and current writer; parser tests cover version/scope/size/secrets; no alternate authority or retired system is introduced.

## Section 02 — Registry, rights, provenance, evidence, health

**Scope:** §§5–9, 12–15, 33, 46.1–46.3, 46.8, 46.11.

Complete server-owned registry/review and rights-policy loading around existing pure fail-closed evaluators. Build schema-free service boundaries for activation/revocation and health evaluation only where existing persistence can support them. For evidence, define append-only admission boundaries that resolve source/dataset/rights and lineage from canonical stores, detach and normalize payloads, bind capture/content identity and actor/time/methodology, reject cycles or out-of-scope parents, and allocate deterministic revisions. Never weaken existing DB constraints; any missing persistence schema is deferred under the active schema-owner marker.

**Acceptance:** rights unknown/expired/revoked, tenant mismatch, mutable references, invalid time, missing derived lineage/methodology, and source drift fail closed. Health dimensions stay independent and quarantine only a source/dataset offer.

## Section 03 — Semantic, entity, geo-time foundation

**Scope:** §§16–21, 34.2–34.12, 46.4–46.5, 46.9.

Use explicit semantic/metric versions and units; keep ambiguous entities unresolved; carry geometry precision, source, CRS and temporal distinctions. Geometry parsing must enforce bounded dense nesting, coordinate ranges and polygon closure, and reject unsupported CRS without relabeling. Spatial operations and CRS conversion belong to explicit supported engine boundaries. Project `GeoEvidenceFeature` into Spec 262 while preserving evidence class and confidence; never create another renderer or elevate model/community reports to official warnings.

**Acceptance:** geometry/CRS/time/entity edge cases pass and every projection preserves authority and source lineage.

## Section 04 — Resolver, retrieval, index lifecycle

**Scope:** §§22–31, 46.6–46.8.

Validate direct resolver callers at the boundary, then apply scope/tenant, current rights, status, health, semantic compatibility, geography/time, freshness, quality, privacy, placement, and cost gates before ranking. Unknown/missing values remain unknown, not zero. Vector search is discovery only; hydration and deterministic retrieval reauthorize. Cache lifetimes cannot exceed rights/freshness/retention limits. Revocation/deletion invalidates derived projections and caches without rewriting immutable evidence. Reject connector SSRF, prompt injection, secret leakage, and unbounded fan-out.

**Acceptance:** cross-tenant and revoked offers never rank; malformed direct requirements reject; health quarantine is offer-specific; stale projection cannot bypass canonical authorization; deterministic data paths do not depend on vector index availability.

## Section 05 — Autonomous research plane

**Scope:** §§10–11, 46.10, 46.12, §47 items 15–22.

Keep idempotent request/job/outbox admission and immutable run receipt behavior. Bind an approved executor only after server-owned runtime, provider/connection secret, allowed tools, placement, budget, cancellation/lease/fencing, and artifact policies are available. The execution envelope contains opaque references only. Record provider trace references as observability metadata, not canonical authority. Treat source/evidence/knowledge output as candidates; require source identity, dependency-root/corroboration, rights, schema, scan receipt, and full evidence/knowledge admission before promotion. Research watches emit outbox notices only after canonical evidence commit and reauthorize/dedupe at consumption. PUBLIC execution remains disabled until a canonical public principal policy exists.

**Acceptance:** failed runtime binding creates no execution; idempotent retries do not create duplicate requests/runs/jobs; candidate artifacts cannot be promoted with caller-asserted scan or rights; echo/repost chains do not count as independent corroboration; notices cannot leak revoked/cross-tenant evidence.

## Section 06 — Emergency profile compatibility

**Scope:** §§34–37, 46.9, compatibility items 48–57, 78–79, 85.

Adapt existing source/hydrology/observation/camera/vision/timeline records as references/projections. Preserve current 260/262 write authority and classifications. Do not activate the initial Thailand source candidate catalog absent reviewed external endpoint and rights evidence. No dual-write or destructive cutover. If a future operator-approved per-source transition is needed, require replay parity, correction/staleness proof, rollback sequence, and an explicit owner gate.

**Acceptance:** projections are lossless for owned fields, source class is unchanged, no second writer exists, and candidate sources stay inactive.

## Section 07 — Governance, packs, admin, observability

**Scope:** §§32–33, 38–43, 48–49, 46–47.

Implement only authorized admin actions backed by real services and audit receipts; show rights/review/health/admission status without exposing restricted payloads. Apply scoped kill switches to providers, datasets, and projections; every mutation is tenant/admin authorized and idempotently audited. Pack install/upgrade requires signer, digest, dependency, permission, rights, revocation, and rollback validation. Metrics/logs redact credentials, restricted content, and unbounded provider text. Browser surfaces, if present in approved code paths, must satisfy repository Astryx/UI contract and browser evidence gates; no hand-rolled design-system bypass.

**Acceptance:** protected mutation tests, redaction tests, scoped kill-switch tests, and actual loading/empty/error/success UI states where a UI surface is included.

The existing admin surface's complete UI/UX contract (target user, existing-pattern evidence, surface/component map, state/responsive matrices, accessibility, token direction, copy, and browser evidence) is recorded in `sections/section-07-governance-admin-observability.md`.

## Section 08 — Migration, acceptance, production gates

**Scope:** §§44–48, appendices A–F.

Map every current writer and accepted row. Do not run or create migrations while the single-writer marker remains active. For local code, map each criterion to code/test evidence or a typed external gate. External gates include production DB migration proof, source rights/endpoints, approved runtime and credentials, provider rate/retention policy, package signing, deployment, rollback, observability, and operator procedure. Never mark §47 complete using source-only or test-only proof.

**Acceptance:** metadata/snapshot checks only when schema owner permits; migration rehearsal/replay/rollback evidence must identify dataset counts/checksums and authority handoff; all unobserved gates remain open with owner and evidence needed.

## Test strategy

Use Vitest in `apps/web` following neighboring test patterns, dependency injection/mocks already used by services, and migration metadata tests only when relevant and allowed. Add tests before behavior changes. After each section run its focused tests; after integration run the section manifest's bounded service test command and `git diff --check`. Do not run full typecheck or full monorepo tests. Database/provider/browser/live proof is a separate gate and must not be inferred from unit tests.

## Completion criteria

All eight sections have implementation/test/documentation outcomes recorded; scoped tests and static whitespace checks are fresh after final fixes; ten distinct post-implementation gap-audit rounds are recorded with examined surfaces, findings, fixes, and verification; no open local MUST_FIX remains. External gates and active schema-owner limitations are reported as residual blockers, so no claim of production completion is made.
