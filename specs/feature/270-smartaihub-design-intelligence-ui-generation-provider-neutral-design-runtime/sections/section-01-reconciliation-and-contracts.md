# Section 01 — Reconciliation and Canonical Contracts

## Goal

Create the G0 reconciliation record and the smallest provider-neutral contract boundary for Spec 270. This is a core-only section: it establishes evidence and default-off policy without contacting a provider, reading credentials, adding a public route, or changing persistence schema.

## Dependencies

- Depends on: none.
- Blocks: every later Spec 270 section.
- Authoritative references: `spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, Spec 224, Spec 256, Spec 261, Spec 269, and the source inventory performed during implementation.

## Required discovery before edits

1. Locate the nearest shared Zod contract convention under `apps/web/shared/`, tenant feature flag registration/defaults in `apps/web/shared/featureFlags.ts`, worker job/outbox registration, and the existing Spec 224 and 256 public extension seams.
2. Confirm the installed Astryx package versions and application style imports. Do not change global CSS in this section.
3. Inspect `apps/web/drizzle/schema.ts` and migration history to document that `worker_artifacts` is job-owned; do not infer it is a durable design artifact store.
4. Check `specs/feature/` for local number collision. Record that it is only local evidence and that a canonical registry is absent from this repository.

## Tests first

Add focused Vitest tests beside the new shared contract/reconciliation module using the nearest existing `apps/web/shared/__tests__` convention.

1. A valid native request parses only with tenant/project scope, supported schema version, safe prompt envelope and a declared artifact intent.
2. Invalid schema version, absent tenant scope, oversize input, raw credential-shaped field, executable/untrusted HTML payload, unsafe URL, and missing provenance are rejected.
3. Canonical digest input is stable when object field order changes, and a new artifact version cannot mutate the previous version payload.
4. The reconciliation record validator rejects a record that marks core ready while schema ownership, recovery closure, or authorities are unresolved.
5. Feature flag tests prove `smartAiHubDesignNativeAuthoring`, `smartAiHubDesignProviderAdapter`, and `smartAiHubDesignStitch` (or final names discovered in the shared registry) are registered and default to `false`; provider flags require the native parent flag.
6. Static policy test asserts the new modules do not import retired Agency, `work/request`, `workpacks`, `/workflows`, OpenSandbox, Docker dispatch, or `sandbox_jobs` surfaces.

Run only the focused Vitest command established by the closest tests. Do not run `npm run typecheck`.

## Implementation

1. Add a checked-in `DesignIntegrationReconciliationRecord` in the narrowest durable documentation/configuration location established by discovery. It must include date/revision, source paths, local registry result, global-registry status, schema/owner conclusion, recovery/reference closure, Spec 224 and 256 extension points, worker/outbox authority, audit/approval authority, Astryx version/catalog status, secret-binding result, provider certification status, feature flag defaults, and open blockers.
2. Add a provider-neutral shared design contract module. Use Zod schemas and exported inferred types, following local style. Its model includes: request/brief/context, prompt envelope, artifact identity/version/digest, provenance, variant, decision/lineage, component intent/resolution, semantic diff, visual evidence, ownership/tenant/project scope, rights metadata, locale/device/theme/system snapshot, and schema version.
3. Keep canonical contracts independent from any Stitch SDK shape and independent from runtime execution code. Inputs label imported content as untrusted and persist no raw secret, authorization header, arbitrary HTML, executable payload, or arbitrary storage URL.
4. Add narrowly named feature flags to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS` only after checking naming collisions. All are false by default. Expose a pure helper that denies provider activity unless core/native, provider-adapter, and provider-specific gates are all true.
5. Add comments/doc links in the record explaining that no DDL, production enablement, credential onboarding, or provider call is allowed while G0 remains unresolved.

## Completion criteria

- G0 record names every authority and every unresolved item with a source path.
- Contracts are versioned, deterministic, tenant scoped, provider neutral, and validation-first.
- All new flags are registered default false and provider work is impossible through the helper by default.
- No migration, route, provider client, job executor, or retired-system reference is added.
- Focused tests pass and their command/output is captured in the implementation record.

## Explicit blockers to carry forward

- A canonical organization-wide spec registry cannot be closed locally.
- `worker_artifacts` is not accepted as independent durable design storage until ownership, cleanup, recovery, and reference closure are proven.
- Live Stitch capability, terms, retention, quotas, credential binding, and egress behavior remain uncertified.

## Implementation record

- Added `apps/web/shared/designIntelligence.ts` with strict Zod request, prompt, context, brief, project/tenant-scoped artifact-version with rights/lineage/system snapshot/action binding, variant, decision, component-intent/resolution, semantic-diff, visual-evidence and fail-closed G0 contracts plus deterministic digest serialization input.
- Added seven `smartAiHubDesign*` / Stitch tenant feature gates, all default false, and a parent-gate helper that requires the resolver and visual-evidence gates for providers in the TypeScript registry and checked-in JavaScript mirror.
- Added the G0 findings and blockers to `implementation/G0-reconciliation-record.md`. No schema migration, route, provider client, credentials, worker job or production activation was added.
- Tests: `cd apps/web && npm test -- --run shared/designIntelligence.test.ts shared/__tests__/featureFlags.designIntelligence.test.ts` — 2 files, 22 tests passed. `git diff --check` passed.
- Limitation: contract coverage is the initial safe boundary, not the complete R1.4 lifecycle. Storage owner, registry and provider certification remain open gates for later sections.

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
