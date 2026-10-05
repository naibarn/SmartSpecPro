# Section 07 — Hardening and Evidence

## Partial hardening record — 2026-10-02

- Added focused boundary regression coverage across canonical contracts/flags, pinned resolver, injected artifact lifecycle, handoff authority, provider policy/normalization and public crawl truth. Current combined focused run: `cd apps/web && npm test -- --run server/services/__tests__/designProviderAdapter.test.ts server/services/__tests__/designHandoffService.test.ts server/services/__tests__/designArtifactService.test.ts shared/designIntelligence.test.ts shared/__tests__/featureFlags.designIntelligence.test.ts shared/designComponentResolver.test.ts shared/__tests__/smartaihubPublicTruth.test.ts server/services/publicSeoPrerender.test.ts server/routers/publicSitemap.test.ts` — 9 files, 66 tests passed.
- Independent code review found and closed issues in Sections 02, 04 and 05, including concurrent append/idempotency, caller-forged handoff artifact/evidence, provider egress/rights/idempotency/cancellation and untrusted policy response validation. Re-review found no remaining P1/P2 in the current injected Section 02 and Section 04 boundaries or Section 05 policy boundary.
- Ten scoped audit passes were completed across schema references, default-off feature gates, trusted catalog/determinism, provider policy and cancellation, handoff tenant/evidence binding, retired-system boundaries, public crawl/claim truth, plan-section validity, machine progress states and final focused suites/diff checks. Findings from independent Section 03, Section 04/05, and Spec 263 reviews were fixed and retested.
- Full hardening acceptance remains blocked: there is no durable artifact adapter, SmartAIHub wrapper/catalog authority integration, live Spec 224/256 authority, user-facing UI, real provider certification or browser evidence. This record does not claim end-to-end or production verification.

## Goal

Close cross-cutting correctness, security, lifecycle and UI proof for the native Spec 270 vertical slice. Provider/live/production certification remains disabled and explicitly unverified unless independent environments and authorization become available.

## Dependencies

- Depends on: Sections 02–06; Section 05 is required only for mock/provider-boundary coverage.
- Final implementation section.

## Tests and verification first

1. Run focused suites from each prior section: contracts/flags, lifecycle/authorization, resolver snapshot, 224/256 handoff, disabled provider mock, and React jsdom UI suite. Keep commands scoped to touched packages/files.
2. Add integration fixtures that prove tenant isolation, decision/digest freshness, deletion/retention/reference-aware GC, idempotency/retry/cancellation, artifact/job cleanup closure, schema compatibility and resolver drift invalidation.
3. Add security tests for cross-tenant IDs, privilege escalation, stale approvals, untrusted HTML/URL/code, raw-secret persistence, rights metadata, provider egress denial and unsafe export/import.
4. Test supported theme/locale/RTL/device/reduced-motion fixtures and responsive UI state. Record actual performance fixture bounds rather than inventing thresholds.
5. If browser tooling is available, capture genuine key-flow evidence at 390x844, 768x1024 and 1440x900 plus extended risk viewports chosen in Section 06; verify keyboard, focus, errors, theme and locale. If unavailable, record a skipped/unverified evidence item.
6. Do not run `npm run typecheck`; do not use real provider credentials, production, Windows native, or external API calls as a substitute for tests.

## Implementation and audit work

1. Audit every new public RPC/API boundary for existing authentication, tenant scoping, authorization, validation, audit and rate-limit conventions. Remove or correct any bypass discovered within Spec 270-owned paths.
2. Confirm feature flags remain false in defaults, fixture seed paths and rollout configuration. Verify provider adapter cannot run with a missing certification/consent/secret-binding reference.
3. Confirm no imports, endpoints, jobs, migrations, docs or compatibility code reintroduce Agency, work/request(s), workpacks, `/workflows`, OpenSandbox, Docker dispatch or `sandbox_jobs`.
4. Confirm no second job/queue/retry/approval/orchestration system was added. Any asynchronous task must appear in canonical `worker_jobs` plus outbox evidence.
5. Reconcile the final `DesignIntegrationReconciliationRecord` with actual code paths, migrations (if and only if the G0 gate authorized them), tests, unresolved blockers and environment claims. Preserve the canonical registry, storage-owner and provider-certification blockers when they remain unresolved.
6. Review diffs for raw credential/error persistence, arbitrary URLs, raw HTML rendering, unsafe assets, cross-tenant lookup, stale digest handoff, unpinned catalog use, global Astryx reset, raw layout elements and hard-coded visual tokens in new UI code.

## Completion criteria

- Focused automated suites pass or any failing baseline is isolated with evidence.
- Native authoring operates with disabled providers and has contract/service/UI proof.
- Browser/production/provider/Windows claims are supported by actual evidence or marked unverified.
- Reconciliation record accurately distinguishes completed core work from external blockers.
- No feature flag is enabled and no retired system or parallel execution authority exists.

## UI/UX Contract

### Target User / JTBD
N/A for this backend/contract section; its outputs serve the authenticated design-authoring user described by Section 06.

### Surface Inventory
N/A; this section adds no browser route or screen.

### Component Map
N/A; no UI component is owned here. Contract/service ownership is specified above; UI is owned by Section 06.

### State Matrix
N/A for direct UI. Service outcomes (success, validation failure, unauthorized, stale version, cancellation, unavailable provider) must be machine-readable for Section 06.

### Responsive Matrix
N/A; no layout is changed by this section.

### Accessibility Acceptance
N/A for direct UI; this section must not remove accessibility metadata consumed by the UI.

### Copy Contract
N/A; user-visible Thai/English text belongs to Section 06 localization resources. Never expose raw provider or secret errors.

### Browser Evidence Required
N/A for direct UI; integration browser evidence is collected in Section 06 and final hardening.

## Follow-up hardening evidence — 2026-10-05

- Current candidate focused run passed 15 files / 110 tests. Coverage included Home render/i18n, tenant public-page API and client cache, auth return path, retired-route guard, sitemap, SEO prerender, design schema/flags/resolver/native service/handoff/provider adapter.
- Added provider regression coverage for missing catalog snapshot fail-fast and canonical `schemaVersion: 1` candidate output.
- Ten current verification passes are recorded in `orchestra/tasks/spec263-270-public-completion-20261005/test-design.md`.
- Full typecheck, product build, browser breakpoints/a11y, durable persistence, user-facing authoring UI, live authority/provider, production, and release/deploy proof were not run or inferred. Section remains partial.

### Follow-up tenant and native-service verification — 2026-10-05

- Spec 270 Section 02 service boundary now also verifies replay tenant/project scope and input bounds for fork/compare; fork idempotency is actor-scoped. Regression coverage includes a malicious cross-tenant repository replay.
- Fresh focused run after the follow-up: 8 files / 58 tests passed, including native artifact service, tenant-domain brand boundary, Navbar, Footer, tenant direct-route boundary, tenant sitemap/robots/LLM output, tenant homepage reduced-motion behavior, and nav translation contract. App and changed TSX/server syntax parse, `git diff --check`, and locale JSON parsing passed.
- This proves the injected service boundary and selected public component paths only. It does not close durable storage, full type safety, browser/UAT, live authority, provider certification, or production/deployment evidence.
