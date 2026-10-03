# Spec 270 Implementation Plan

## Objective and delivery boundary

Implement Spec 270 R1.4 as a provider-neutral design-time capability that can operate natively with external providers disabled. It must exchange canonical, versioned design artifacts with the existing Spec 224 development authority and consume existing Spec 256 capability discovery rather than creating parallel job, approval, capability, or orchestration systems. Every new operational flag remains default-off. No live Stitch request, credential discovery, or production enablement is part of this implementation.

This plan follows repository `AGENTS.md`: retired Agency, `/workflows`, `workpacks/*`, OpenSandbox, Docker/OpenSandbox dispatch and `sandbox_jobs` stay unused and are not revived in code, routes, schemas, tests, docs, or compatibility layers. Long-running work must use `worker_jobs` plus the outbox. UI follows Astryx 0.6.3 through SmartAIHub-owned wrappers and existing product components; do not add raw layout `<div>`/`<span>`, global reset, raw color/spacing values, or broad page rewrites. Never use repository-wide `npm run typecheck`.

## Authority and current-state reconciliation

The relevant source of truth is the codebase plus the Spec 224/256/261/269 contracts. Repository exploration found no canonical spec-number registry, so local uniqueness is evidence only and Spec 270 remains `PROVISIONAL_UNTIL_CANONICAL_SPEC_REGISTRY_CHECK`. Record this gap; do not renumber or assert global uniqueness. The codebase has an existing `worker_artifacts` table bound to `worker_jobs`, but it does not alone model independently versioned design artifacts. Before any DDL, production flag activation, credential onboarding, or modification to 224/256, require an explicit reconciliation record covering registry result, schema/owner, component catalog, capability and secret binding reuse, job/approval/audit authorities, pinned Astryx version, provider certification, and unresolved items. No destructive migration is allowed in this scope.

Use existing `worker_jobs` and outbox for async generation/external work; use Spec 224's run/evidence state for implementation handoff; map capability needs through Spec 256; preserve SPAAS semantics from Spec 261; use Spec 269 ownership/authorization rules. `worker_artifacts` can carry job outputs but needs a verified durable design-version/reference owner. If no existing general artifact owner is suitable, complete native contracts and service boundaries without adding a migration until the schema-owner gate is satisfied. Do not overload model `capabilityRegistry.ts` as design-system catalog authority without proof.

## Work sequence and gates

### Phase 0 — G0 repository and authority reconciliation

Inventory exact modules, schema, migration conventions, test harness, current Astryx package/theme wiring, secret binding path, worker executor registration, Spec 224 evidence hooks and Spec 256 extension points. Produce a checked-in `DesignIntegrationReconciliationRecord` with sources and decisions. Confirm local spec filename uniqueness and explicitly mark global registry unresolved. Separate core/native certification from optional-provider certification. Inventory `Stitch` capabilities from official references without connecting an account. Keep flags false. **Gate:** no DDL, contract mutation, provider use, or production enablement until owner/authority evidence is complete.

### Phase 1 — Canonical design contracts and invariants

Define provider-neutral request, prompt envelope, brief/context, artifact/version/digest, variant set, decision/lineage, system snapshot, component intent/resolution, semantic diff and structured visual evidence in the narrowest existing shared contract package. Include tenant/project ownership, authorization scope, immutable versions, concurrency, provenance, deterministic/reproducibility classification, no-raw-secret prompt persistence, imported-content trust labels, safe asset rights metadata, theme/locale/device coverage, and schema evolution/version rules. Validate input and reject unsupported/unsafe content before adapter calls. Keep design-provider contracts separate from user-facing runtime execution.

### Phase 2 — Native-only vertical slice and persistence boundary

Implement native design request normalization and artifact lifecycle behind default-off flags. Reuse existing durable storage if G0 verifies ownership, tenant isolation, deletion, backup/recovery and reference closure. Otherwise record the precise schema-owner blocker and keep service/contract work storage-adapter based with no speculative migration. Define create, read, immutable version, fork, compare, approve/decision and ownership transfer semantics. Ensure artifacts survive job cleanup and are not lost by `worker_jobs` cascade. Add idempotency, cancellation, authorization, tenant checks, audit, retention/deletion and asset GC references.

### Phase 3 — Astryx and product component resolution

Implement a deterministic resolver from `ComponentIntent` to approved SmartAIHub components, Astryx v0.6.3 components/patterns/themes/templates, then safe primitives. Pin catalog/snapshot identity and resolver policy; return rationale, missing capability and fallback provenance. New UI must use SmartAIHub wrappers and Astryx docs-discovered components; do not globally add reset. Add compatibility/version invalidation and design↔source drift tracking. Respect runtime content, role/permission, safe-area/input, responsive, locale/RTL, light/dark/system/high-contrast and reduced-motion states.

### Phase 4 — Spec 256 and Spec 224 integration

Map design intent/action requirements through existing Spec 256 extension points with explicit capability/permission evidence; no decorative or invented capabilities. Handoff accepted implementation work to Spec 224 with canonical artifact version/digest and freshness-bound evidence. Reuse its approvals, code execution, validation, supply-chain, policy and audit gates. Register any genuinely long-running design task only through canonical `worker_jobs` + outbox executor contracts, including cancellation, retry/idempotency and result ownership. Do not build a second retry, approval, scheduler, agent, workflow or execution engine.

### Phase 5 — Optional external-provider adapter (disabled)

Create a provider adapter boundary only after the native vertical slice and policy profile exist. Stitch adapter must capability-negotiate, validate SDK/API version, bind eligible user credential through the existing secret path, enforce data residency/retention/terms and user authorization before egress, send only approved prompt envelope fields, track idempotency/cancellation, and normalize results into canonical artifacts. Cross-provider fallback starts a new provenance branch and never silently blends. Keep external and Stitch flags false. Without account credentials and terms approval, provider behavior remains uncertified and no real requests run.

### Phase 6 — Native authoring and SmartAIHub self-design

Build the native design workflow as a public? No: authenticated product surface scoped to appropriate project/tenant authorization. Include empty/loading/error/offline/permission/unsaved/recovery states; keyboard, screen reader, mobile orientation/virtual keyboard and accessibility policies. Product self-design is separately gated, cannot bypass release, security, sensitive interaction or Spec 224 review. Native-only must provide usable outcomes when all provider flags are false.

### Phase 7 — hardening and enablement evidence

Add contract, authorization, tenant-isolation, deletion/retention, provider adapter mock, schema migration, worker lifecycle, resolver determinism, visual evidence freshness, theme/device/localization/accessibility/performance, external-resource determinism and offline-degraded tests. Use focused Vitest/Python suites located by implementation. Browser visual checks require actual browser evidence if available; otherwise record unverified. Do not claim external, production, Windows-native, or provider certification without those environments. Activation remains an operator decision outside this branch.

## UI/UX contract

- **Audience/task:** authenticated creator or product operator asks for a design, reviews options, resolves them to approved components, and hands a selected version to Spec 224.
- **Route/surface inventory:** authenticated Mini App and SmartAIHub product design-authoring surfaces only; no new public route. Exact route is selected from existing product navigation during implementation.
- **Component map/ownership:** SmartAIHub-owned design workspace coordinates request, variant list, compare/decision and handoff; Spec 270 services own canonicalization/resolution; Astryx and SmartAIHub product components own primitives. No page-local provider client or competing resolver.
- **State matrix:** empty, editing, generating, partial, success, validation failure, provider unavailable, native fallback, unauthorized, stale decision, conflict, cancellation, offline, deleting/retention and recovery. Hover/focus/selected/disabled states remain visible and keyboard operable.
- **Responsive matrix:** mobile supports request/review/decision with virtual keyboard and safe-area handling; tablet uses compact compare; laptop and desktop support side-by-side review. Test portrait/landscape and supported density fixtures.
- **Accessibility:** keyboard complete, visible focus, semantic names/roles, screen-reader announcements for async state, contrast/theme matrix, reduced motion and policy gates for sensitive/auth/payment UI.
- **Visual system:** use `@astryxdesign/core` v0.6.3 and existing SmartAIHub product components through an owned wrapper; no global reset and no raw hard-coded values. Before UI code run `npm run astryx -- build "design authoring review workspace"`, `npm run astryx -- docs layout`, and component/token docs for used controls.
- **Copy/localization contract:** Thai and English labels, validation, loading, empty, success and error messages come from established localization patterns; provider terms are secondary, and missing translations use the product's existing fallback. Never display raw provider errors or secrets.
- **Evidence:** component/resolver snapshot, canonical artifact version/digest, test/browser evidence freshness, theme/locale/device matrix. External-provider labels and provenance are visible when used.

## Data and API boundaries

All RPC/API additions follow existing authentication, tenant scoping, validation, audit and rate-limit conventions. Do not expose raw secret values, provider tokens, untrusted HTML, or provider-generated executable code. Use normalized storage references, not arbitrary URLs. Cross-tenant reads, stale approvals, changed artifact digests, incompatible schema versions and missing asset rights fail closed. Public routes are not created by Spec 270. No migration before G0 schema ownership/recovery gates.

## Delivery and acceptance

Deliver in small commits by section. Each section starts with failing focused tests, implements minimum behavior, reruns focused tests, receives a diff review, updates this plan's section record and commits only owned paths. Keep all flags default-off. Core acceptance: native-only end-to-end contract and artifact lifecycle works; data and ownership are durable and isolated or explicitly blocked at schema gate; Astryx resolver is deterministic; 256/224 handoffs reuse existing authorities; no retired system is reactivated; failed/unavailable external providers leave native creation usable; the full required test matrix is documented with unverified environments named.

## Repository-specific verification

Use existing package-manager scripts; inspect package manifests and nearest tests before commands. Run focused web Vitest with jsdom for UI, focused Python tests for Python changes, lint only for touched package/files if practical. Do not run `npm run typecheck`. Browser, provider, production rollout and secret/credential behavior are external proof surfaces and remain unverified unless available and explicitly authorized. Do not create tests for retired paths.

## Known blockers and decisions

1. Canonical spec registry is absent from repository; global number uniqueness cannot be closed locally. Keep provisional status and record external gate.
2. Durable design artifact storage owner is not yet established; `worker_artifacts` alone is job-owned and cascades. No DDL until owner/recovery closure is demonstrated.
3. Stitch account/terms/credential are not available for live certification. Keep adapter disabled and native path complete.
4. Exact Spec 256 integration point must be confirmed by source before edits; avoid changing its contract absent proof.
5. Product-wide production activation and rollout are out of scope; all flags remain false.
