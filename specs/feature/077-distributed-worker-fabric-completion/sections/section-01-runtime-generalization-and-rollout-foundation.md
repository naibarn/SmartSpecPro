# Section 01: Runtime Generalization and Rollout Foundation

## Goal

Generalize the existing worker control plane so it can support the full declared runtime taxonomy without breaking the current OpenClaw production path.

## Why this section exists

The current shared worker services already store four runtime types, but core behavior is still largely hardcoded around OpenClaw. The revised worker fabric cannot be completed until runtime-generalized control-plane behavior exists.

## Scope

1. Replace single-runtime assumptions in worker registry, scheduler, auth, and policy services with runtime-handler or runtime-profile resolution.
2. Introduce runtime-family rollout flags instead of using only `openClawExternalRuntime`.
3. Preserve OpenClaw as the first production runtime and keep its current API contracts stable.
4. Add runtime-family schema-version and compatibility-matrix handling beyond the single global protocol version.
5. Keep unsupported runtimes fail-closed until their handlers and policies are ready.
6. Lock the persistence/backfill strategy for compatibility and approval metadata using the existing worker tables and profile JSON surfaces before any runtime-family rollout expands.

## Cross-section role

- This is the foundation section for the rest of the feature.
- It exports the runtime-handler, rollout-flag, and compatibility-envelope expectations that Sections 02-05 depend on.
- It must land before any non-OpenClaw runtime is treated as executable.

## Suggested files

- `apps/web/shared/workerRuntime.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/*.sql`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/services/workerPolicyService.ts`
- `apps/web/server/services/workerFleetService.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`

## Design rules

- Do not regress current OpenClaw worker registration or dispatch flows.
- Do not pretend that every declared runtime type is automatically executable.
- Prefer runtime-specific capability maps and policy builders over repeated string matching across the codebase.
- Keep runtime-family flags and compatibility checks explicit.
- Treat `WORKER_RUNTIME_PROTOCOL_VERSION` as the transport envelope only; runtime-family metadata and profile versions need their own compatibility checks.
- Compatibility state should be inspectable by operators and testable in code, not inferred from free-form JSON.
- Default to the existing `workers`, `worker_jobs`, `runtime_profiles`, and `worker_policies` schema surfaces first; any new migration must justify why existing structured columns and JSON/profile fields are insufficient.
- Backfill/seed steps for existing OpenClaw workers must be idempotent, rollback-safe, and compatible with feature-flag rollback.

## Testing first

- worker registry tests proving handler-based runtime validation
- scheduler tests proving OpenClaw routing remains unchanged
- auth tests proving runtime-family flags fail closed correctly
- policy snapshot tests proving runtime-specific gateway/profile payloads
- compatibility-matrix tests proving transport compatibility and runtime-profile compatibility are evaluated separately
- backfill/seed tests proving legacy OpenClaw workers normalize into the new runtime-handler path without requiring re-registration
