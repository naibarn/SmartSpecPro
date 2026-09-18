# Section 10 — Tests, flags, metrics, and rollout

Add `contentProtectionEnabled` and image-provider feature flags using existing
tenant flag conventions in the shared feature-flag type/service. Add structured
protection lifecycle events and safe
metrics for status, modality, provider availability, self-verification, stale
rejection, and publish gate outcomes. Add focused unit/router/UI/browser tests,
Rust tests for changed Worker code, and migration/spec validation commands.

Perform a cross-section check that every route, API procedure, table, job type,
and UI link is registered and tenant-scoped. Run a 15-round requirement-to-code
audit; any MUST_FIX or blocking gap must be fixed before declaring completion.
Record external-provider, real-worker, and production/legal-proof boundaries as
acceptance gates rather than falsely marking them complete from local tests.

## UI/UX Contract

### Target User / JTBD

N/A for primary implementation; this section verifies the user-visible
protection workflow delivered by sections 07–09.

### Surface Inventory

All Feature-201 routes, Dashboard links, Settings deep link, and embedded
watermark-choice controls are verification targets.

### Component Map

The verification matrix covers the components owned by sections 07–09; no new
component is introduced here.

### State Matrix

Verify loading, empty, error, disabled, ON, OFF, processing, protected,
unprotected, stale, and inconclusive states.

### Responsive Matrix

Verify 390x844 mobile, 768x1024 tablet, and 1440x900 desktop where browser
tooling is available.

### Accessibility Acceptance

Verify keyboard path, focus, labels, semantics, contrast, announcements, and
reduced motion for the covered routes.

### Copy Contract

Verify Thai/English fallback and the technical-evidence/legal-ownership
disclaimer across status, error, and certificate copy.

### Browser Evidence Required

Record focused Playwright/browser route evidence or explicitly record the
missing authenticated browser environment as a residual acceptance gate.

## Implementation record

- Added `contentProtectionEnabled` and
  `contentProtectionImageProviderEnabled` with fail-closed defaults.
- Registered the worker, tRPC, REST, App, menu, Dashboard, Settings, rights,
  verification, and reviewer surfaces and checked cross-section tenant scope.
- Completed the recorded 15-round audit in
  `implementation/audits/15-round-audit.md`.
- Re-ran a 20-round requirement-to-code audit plus two convergence passes in
  `implementation/audits/20-round-audit-2026-09-18.md`. The audit moved Verify
  onto `content_protection.verify` in the canonical control plane, restored
  owner-scoped candidate filtering, and repaired signed-certificate evidence
  projection before recording convergence.
- Focused TypeScript and Rust verification passed; the repository-wide
  typecheck was intentionally not run under the root RAM constraint. The
  existing Drizzle snapshot collision and external provider/browser/production
  gates remain explicitly documented.
