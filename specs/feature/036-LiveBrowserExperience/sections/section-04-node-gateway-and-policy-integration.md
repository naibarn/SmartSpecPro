# Section 04: Node Gateway And Policy Integration

## Goal

Extend the web gateway so live-browser requests are authenticated, tenant-scoped, rate-limited, policy-aware, and correctly proxied to Python while keeping Node out of runtime-state ownership.

## Scope

- Add the live-browser router surface in the web application.
- Enforce tenant auth, feature flags, live release gates, rate limits, and policy resolution.
- Issue short-lived observer and controller stream tokens.
- Proxy live commands to Python with intact versioning and idempotency metadata.
- Reuse browser-policy and user-setting infrastructure instead of copying it.
- Own create-session budget reservation and session-start quota checks through the existing credit and concurrency services.

## Implementation Work

1. Add Node routes or tRPC procedures for every live-browser API needed in Phase 1.
2. Wire feature flags and introduce a separate live-browser release gate.
3. Reuse browser-policy runtime resolution for live sessions.
4. Add per-endpoint rate limiting and queue-depth error responses.
5. Issue session-bound viewer/controller tokens and keep token logic server-side.
6. Preserve Node’s role as gateway only; do not add direct runtime mutation logic.
7. Reserve the initial live-session budget before provisioning starts, and fail closed if reservation or quota checks do not pass.

## Tests To Write First

- Test: unauthorized or cross-tenant live-browser requests are rejected.
- Test: feature-flag and release-gate failures block live-mode entry.
- Test: rate limits apply to create, command, takeover, return-control, assist, approval, and cancel operations.
- Test: browser-policy context is resolved and forwarded correctly for live sessions.
- Test: issued tokens are scoped by session and requested control mode.
- Test: Node returns provider/readiness failures as explicit live-mode blocked states rather than falling back.
- Test: create-session budget reservation and quota checks run before provisioning and reject insufficient-budget launches cleanly.

## Files And Areas Likely Touched

- `apps/web/server/routers/*`
- `apps/web/server/services/browserPolicy*`
- token issuance or internal route modules
- automation entry routes that launch live mode

## Risks And Guardrails

- Do not bypass the existing browser-policy surface checks.
- Do not route live commands into the raw `browserTool` batch path.
- Keep token issuance and provider wiring short-lived and auditable.
- Keep budget reservation at the gateway boundary for session creation so provisioning cannot start without an approved credit path.

## Done Criteria

- Live-browser APIs exist at the gateway layer.
- Policy and release gates are enforced.
- Stream token issuance works.
- Node remains a gateway, not the state machine owner.

## As-Built

- Actual files changed:
  - `apps/web/server/routers/liveBrowser.ts`
  - `apps/web/server/services/liveBrowserGateway.ts`
  - `apps/web/server/routers.ts`
  - `apps/web/shared/featureFlags.ts`
  - `apps/web/server/services/tenantFeatureFlagService.ts`
  - `apps/web/server/services/browserPolicyReleaseControl.ts`
  - `apps/web/server/services/browserPolicySettingsBridge.ts`
  - `apps/web/server/routers/__tests__/liveBrowser.test.ts`
  - `apps/web/server/services/__tests__/liveBrowserGateway.featureFlags.test.ts`
  - `apps/web/server/services/__tests__/browserPolicyReleaseControl.test.ts`
  - `apps/web/server/routers/__tests__/tenantFeatureFlags.test.ts`
  - `apps/web/server/services/__tests__/tenantFeatureFlagsUpdate.test.ts`
- Deviations from plan:
  - The live gateway rate limiting is implemented with the same in-memory bucket pattern already used elsewhere in the web tier, not Redis-backed distributed rate limiting yet.
  - Create-session preflight enforces budget reservation and gateway rate limits before provisioning; durable concurrent live-session semaphore enforcement is still deferred until later runtime/provider integration.
  - Observer/controller stream tokens are short-lived JWTs issued by Node and scoped to `sessionId`, while real provider credential exchange remains deferred behind the section-03 adapter boundary.
- Tests added/updated:
  - `apps/web/server/routers/__tests__/liveBrowser.test.ts`
  - `apps/web/server/services/__tests__/liveBrowserGateway.featureFlags.test.ts`
  - `apps/web/server/services/__tests__/browserPolicyReleaseControl.test.ts`
  - `apps/web/server/routers/__tests__/tenantFeatureFlags.test.ts`
  - `apps/web/server/services/__tests__/tenantFeatureFlagsUpdate.test.ts`
- Known follow-ups:
  - Wire the Python live-browser API surface to the new gateway envelope and validate the session-bound stream-token claims server-side.
  - Replace the gateway-only signed tokens with real provider-issued viewer/controller credentials once the managed provider integration is connected.
  - Promote the live-browser rate limiter from process-local memory to Redis-backed shared limits before multi-instance rollout.
