# Section 02 - Backend Foundation

## Objective

Wire a disabled-by-default marketplace capture backend shell without changing existing marketplace, auth, or LLM behavior.

## Scope

- Create REST route shell in `apps/web/server/routes/marketplaceCapture.ts`.
- Create tRPC router shell in `apps/web/server/routers/marketplaceCapture.ts`.
- Register tRPC router in `apps/web/server/routers.ts` as `marketplaceCapture`.
- Register REST routes in `apps/web/server/_core/index.ts` under `/api/marketplace-capture`.
- Add feature config and normalized errors.

## Implementation Notes

- Use `MARKETPLACE_CAPTURE_ENABLED=false` as production-safe default.
- Avoid `/marketplace` and `marketplace` naming to prevent collision with skill marketplace.
- Do not refactor global auth/CSRF middleware in this section.
- Normalize errors as `{ error: { code, message, retryable, requestId } }`.
- Add request id to responses if the existing middleware does not already expose one.
- Design analyze, remote image mirroring, and cleanup through an async job-compatible service boundary. MVP may run inline, but route responses and status contracts should not assume synchronous completion forever.
- Add fail-closed configuration validation for production env vars: feature flag, extension origins, storage limits, retention windows, model policy, and remote image allowlists.

## Tests First

- Feature-disabled REST endpoints return a stable disabled error.
- Feature-disabled tRPC procedures return a stable disabled error.
- `appRouter` exposes both existing `marketplace` and new `marketplaceCapture`.
- No route collision with `/marketplace`.
- Production config validation fails when required marketplace capture env values are missing.
- Analyze/status route shape remains compatible with later queue-backed execution.

## Acceptance Criteria

- Web typecheck passes.
- Empty route shells are protected by the feature flag.
- Existing marketplace router behavior remains unchanged.
