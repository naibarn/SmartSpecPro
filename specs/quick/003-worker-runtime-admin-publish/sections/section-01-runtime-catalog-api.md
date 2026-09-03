# Section 01 — Runtime catalog and API

## Ownership

Own shared runtime release contracts, dedicated persistence/service, ZIP validation, durable storage upload finalization, admin authorization, and worker runtime manifest/download integration.

## Targets

`apps/web/shared/workerRuntimeRelease.ts`, `apps/web/drizzle/schema.ts` or existing migration/bootstrap convention, `apps/web/server/services/workerRuntimeReleaseService.ts`, `apps/web/server/routes/workerRuntime.ts`, focused tests.

## TDD

Start with pure archive/manifest validation tests and route authorization tests. Then implement storage finalize and publish transitions. Cover partial release resolution and legacy fallback.

## Acceptance

Only valid signed complete artifacts can become published. Admin-only mutations, durable storage, cleanup, explicit unavailable response, and audit fields are proven.

## Risks

Large ZIPs require streaming/presigned storage and bounded temporary files. Do not let client-provided manifest or hash decide publication without server inspection.
