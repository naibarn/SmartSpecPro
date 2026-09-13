# Section 10 — Integration, verification, and rollout

## Goal

Close the feature with cross-section proof and a reversible rollout.

## Verification gates

Run focused contracts/registry/schema/service/router/component tests, app typecheck/build, migration/static checks, and the relevant Playwright/browser/a11y flows where the local runtime permits. Distinguish test, build, browser, migration, provider, billing, deployment, and production evidence. Do not use real provider credits.

Run a 20-round implementation/spec audit after all fixes. Each round checks one complete requirement slice: limits, schema, canonical prompt, references, model quality, lifecycle, idempotency, billing, recovery, projection, route compatibility, library, revisions, Drama parity, interop, UI states, accessibility, i18n, tests, and rollout. Any MUST_FIX gap is patched before the next round.

## Rollout

Ship additive persistence and read-only registry first; enable estimate-only, internal runs, Characters, interop, and tenant rollout behind the feature flags in the main spec. A kill switch disables only the new action; New Blank and Drama remain available. Record external gates such as credentials, worker, migration application, and browser auth explicitly.

## UI/UX Contract

### Target User / JTBD
Release owners verify the creator flow and disable only the new feature if a gate fails.

### Surface Inventory
Feature flag, route/menu visibility, migration status, evidence, and rollback indicator.

### Component Map
Verification consumes prior contracts; rollout gates control entry visibility and authorization.

### State Matrix
Show disabled, estimate-only, internal, tenant-enabled, degraded, and rolled-back states.

### Responsive Matrix
Operational status and recovery actions remain readable on all supported widths.

### Accessibility Acceptance
Disabled/failure messages are announced and actionable without color.

### Copy Contract
Localize disabled, provider-gated, migration-pending, and retry guidance.

### Browser Evidence Required
Verify kill switch, enabled wizard, and unchanged New Blank/Drama entry points.
