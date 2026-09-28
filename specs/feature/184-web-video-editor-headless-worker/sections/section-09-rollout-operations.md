# Section 09 — Rollout, telemetry, retention, and rollback

## Scope and dependencies

Operate the complete flow from Sections 01–08 behind reversible cohorts. Reuse existing feature flag services and document environment gates before changing defaults.

## Tests first

- Test `video_editor_mode` precedence (emergency > user > tenant > global), cache invalidation and cohort routing using existing feature flag test patterns.
- Test canary stop thresholds/owner, metric privacy/cardinality, retention cleanup, active-job delete guards, tombstones and rollback drill.
- Test `/render-jobs` alias telemetry and retirement conditions.

## Implementation

Use `apps/web/server/services/featureFlags.ts`, `routers/tenantFeatureFlags.ts`, and `client/src/hooks/useTenantFeatureFlag.ts` for `legacy_worker`, `web_beta`, and `web_default`; any new store requires an ADR/migration owner. Add telemetry for parity denominator, save/import/proxy/render failures, duplicate credits/publications, queue wait/execution, alias hits, cross-tenant denial and support errors with owner thresholds. Add auditable config keys `sourceRetention`, `artifactRetention`, `diagnosticRetention`, `replayWindow`, and `orphanUploadTtl`, cleanup/tombstone jobs, and runbooks under `docs/operations/feature-184/`. Keep Worker UI for one stable release/30 days; retire alias and legacy entry only after gates and rollback drill.

## Acceptance and evidence

Record feature-flag, telemetry, retention and rollback test output and deployment-specific skipped gates. This section closes AC-12, AC-15, AC-17, AC-18 and operational requirements in §16.

## Safety and rollback

Emergency rollback disables new submissions/cohorts, preserves valid leased jobs, and keeps snapshots/assets/jobs. Never drop schema or delete outputs as rollback.

## Implementation status

Implemented mode-precedence and retention-config validators with focused tests, plus operational runbooks in `docs/operations/feature-184/rollout-rollback.md` and `docs/operations/feature-184/retention-replay.md`. Existing tenant flag persistence, canary dashboards, cleanup jobs, and live rollback drill remain environment-dependent follow-up work.

## UI/UX Contract
### Target User / JTBD
Operator needs safe cohort control and visible rollout health.
### Surface Inventory
Feature flag panel, Worker Jobs telemetry, alert thresholds, retention/rollback runbook.
### Component Map
Server evaluates flags; admin UI edits authorized settings; dashboards consume redacted metrics.
### State Matrix
Legacy, beta, default, emergency rollback, cache-stale, canary-stop, retention-blocked.
### Responsive Matrix
Admin controls on desktop/tablet; mobile supports read-only health/rollback status.
### Accessibility Acceptance
Flag state, owner, threshold and rollback actions are labelled and announced.
### Copy Contract
Thai operational copy states cohort, expiry, owner, and rollback effect.
### Browser Evidence Required
Admin route tests and authenticated screenshots for flag/rollback states.
