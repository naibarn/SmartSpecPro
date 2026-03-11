# Section 06 Review

## Scope reviewed

- `apps/web/server/services/agencyPreviewLifecycleService.ts`
- `apps/web/server/services/agencyPreviewLifecycleService.test.ts`
- `apps/web/server/routers/agency.ts`
- `apps/web/server/routers/__tests__/agency.test.ts`

## Findings

- No blocking correctness or security findings in the Section 06 slice.

## Checks performed

- Verified stale previews transition to `expired_preview` before preview read/commit continues.
- Verified commit rollout flags can disable deck commits while preview fetch remains available.
- Verified structured-result parse and commit lifecycle hooks emit the expected telemetry calls.
- Verified template seeding is feature-gated separately from preview and commit rollout.

## Residual risk

- Retention cleanup is opportunistic rather than scheduler-driven, so idle stale previews are only expired when touched.
- Telemetry is structured-log based in this phase; it does not yet guarantee durable aggregation into counters or dashboards.
