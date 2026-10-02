# Spec 270 TDD Plan

For every section, write focused failing tests first, then implementation, then rerun. Test files and exact commands must follow the nearest existing package conventions discovered at implementation time. Use Vitest for web TypeScript (jsdom for React-facing tests) and pytest for Python only where relevant. Never run repository-wide `npm run typecheck`.

## Phase 0 — G0 repository and authority reconciliation
- Tests/checks: reconciliation record parser/schema validation if record is machine-readable; assertions that flags are false by default; guard tests preventing DDL/provider enablement while required owner/certification fields are unresolved.
- Proof: current migration/schema owner and version inventory; no live credentials read or provider call.

## Phase 1 — Canonical design contracts and invariants
- Contract tests: valid/invalid request and envelope; version/digest stability; immutable artifact version; concurrency conflict; tenant/project ownership; no secret persistence; imported content remains untrusted; unsupported schema rejection; rights/provenance completeness.
- Security tests: cross-tenant identifiers, malformed URLs/HTML, prompt injection labels, executable payload and oversized input rejection.

## Phase 2 — Native-only vertical slice and persistence boundary
- Service tests: native creation with all provider flags false; lifecycle read/version/fork/decision; idempotency/cancel; ownership transfer reauthorization; retention/delete; asset reference and job cleanup behavior.
- Persistence tests: tenant isolation, crash/retry closure, recovery and reference-aware GC. If owner gate unresolved, test adapter contract only and explicitly assert that no migration was introduced.

## Phase 3 — Astryx and product component resolution
- Resolver tests: stable intent-to-component mapping; fallback order and rationale; catalog snapshot pin/invalidation; no unsupported capability; theme/locale/RTL/responsive/safe-area/role fixtures; design/source drift detection.
- UI tests: loading, empty, error, focus, keyboard, reduced motion, screen-reader async announcements and denied permission states.

## Phase 4 — Spec 256 and Spec 224 integration
- Contract tests: capability resolution reuses 256 authority; nonexistent or denied capability fails closed; 224 handoff binds immutable digest and fresh evidence; stale approval rejected.
- Worker tests where required: canonical job type/executor/outbox registration, idempotent dispatch, cancellation, retry ownership, result linking. Prove no second queue/approval engine was added.

## Phase 5 — Optional external-provider adapter (disabled)
- Mock adapter tests: capability negotiation, version mismatch, consent/credential binding abstraction, data profile/egress denial, idempotency/cancel, normalization, provenance branch isolation, native fallback.
- Default-off tests for all external/Stitch flags. No real request or credential test.

## Phase 6 — Native authoring and SmartAIHub self-design
- Component tests for all state matrix cases and native-only flow; authorization/tenant checks; unsaved changes, recovery, offline, keyboard, orientation and virtual keyboard behavior.
- Product self-design cannot skip 224 release/security/sensitive UI gates.

## Phase 7 — hardening and enablement evidence
- Focused integration suite across contracts, authorization, deletion, worker lifecycle, resolver, visual evidence freshness, themes, accessibility, locale, performance fixtures and offline mode.
- Browser proof for key authoring and handoff flows when available; otherwise mark browser acceptance unverified. No production/provider certification claim.
