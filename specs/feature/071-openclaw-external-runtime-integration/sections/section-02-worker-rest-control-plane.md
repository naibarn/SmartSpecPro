# Section 02: Worker REST Control Plane

## Ownership

This section owns the external worker HTTP loop and the services that let OpenClaw register, fetch policy, claim jobs, report progress, and publish artifacts.

## Target files and modules

- `apps/web/server/_core/index.ts`
- `apps/web/server/_core/tokens.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerPolicyService.ts`
- `apps/web/server/services/workerAuthService.ts`
- route/service tests

## Scope

- `POST /api/workers/register`
- `POST /api/workers/:workerId/heartbeat`
- `POST /api/workers/:workerId/jobs/claim`
- `POST /api/worker-jobs/:jobId/events`
- `POST /api/worker-jobs/:jobId/artifacts/init-upload`
- `POST /api/worker-jobs/:jobId/artifacts/complete`
- `GET /api/workers/:workerId/policy`
- `POST /api/workers/:workerId/diagnostics`
- bearer-scope enforcement plus explicit `openClawExternalRuntime` gating for worker callers
- worker token issuance/verification conventions using the existing bearer-token stack, but with worker-bound claims and audience
- bootstrap/enrollment credential flow for initial registration
- protocol/version compatibility checks during registration and heartbeat
- idempotent registration and artifact completion semantics
- replay protection and optimistic state-transition validation for claim, event, upload, and completion mutations
- route-specific rate limits and payload caps for registration, heartbeat, claim, event, and diagnostics traffic

## TDD expectations

- test auth failures before implementing success paths
- test generic bearer/session tokens are rejected on worker routes unless a route is explicitly admin-facing
- test bootstrap credential exchange and worker-bound token claims
- test incompatible worker protocol versions fail with explicit compatibility errors
- test lease exclusivity for job claim
- test stale lease updates and illegal job-state transitions are rejected
- test duplicate or replayed event/artifact mutations are ignored or rejected deterministically
- test tenant/worker scoping on policy lookup and artifact completion
- test that bearer auth does not accidentally bypass the worker feature gate
- test token expiry/revocation and route behavior for disabled or drained workers

## Acceptance checks

- a valid OpenClaw worker can complete the outbound polling loop
- invalid or expired tokens are rejected
- worker routes accept only worker-bound identities for worker actions
- incompatible worker protocol versions are rejected before state mutation
- job-event and artifact APIs update canonical SmartSpecPro records
- disabled-tenant workers cannot register or claim even with valid bearer tokens
- worker routes stay isolated from `/v1` public-API middleware assumptions

## Risks and coordination notes

- keep the API REST-friendly and external-runtime compatible
- avoid leaking admin-only metadata such as dashboard URLs or diagnostics beyond authorized scopes
- do not mix the worker control-plane rollout gate with unrelated public API flags
- do not let generic bearer-bypass semantics in `requireScopes()` become the effective auth model for worker mutations

## Implementation notes

- Implemented dedicated worker auth in `apps/web/server/services/workerAuthService.ts` on top of the existing JWT stack:
  - bootstrap registration token audience: `smartspec-worker-registration`
  - worker execution/upload token audience: `smartspec-worker-control-plane`
  - tenant-bound, worker-bound, runtime-bound claims
  - explicit `tokenUse` separation for `worker_registration`, `worker_execution`, and `worker_upload`
  - explicit `openClawExternalRuntime` tenant-flag enforcement during token verification
- Implemented registry/control-plane behavior in `apps/web/server/services/workerRegistryService.ts`:
  - protocol compatibility guard using `WORKER_RUNTIME_PROTOCOL_VERSION`
  - idempotent registration on `(tenantId, externalReference)`
  - heartbeat persistence + `lastSeenAt` update
  - lease-based claim with stale-lease recovery path
  - replay-aware job-event handling via monotonic `sequenceNumber`
  - illegal job-state transition rejection
  - deterministic artifact upload keys + idempotent artifact completion
  - diagnostics persistence into worker health summary state
- Implemented worker policy snapshot service in `apps/web/server/services/workerPolicyService.ts`
- Implemented REST route hosting in `apps/web/server/routes/workerRuntime.ts` and mounted it from `apps/web/server/_core/index.ts`
- Extended shared worker contracts in `apps/web/shared/workerRuntime.ts` so event/artifact payloads now carry `leaseOwnerToken`, and diagnostics have a shared payload schema
- Extended token claim typing in `apps/web/server/_core/tokens.ts` for worker-bound claims without changing legacy bearer verification behavior
- Added worker-specific error-code mapping in `apps/web/server/middleware/publicApiHeaders.ts`
- Updated existing auth/header tests (`requireScopes`, `publicApiHeaders`) so fixtures match the production middleware shape that already sets response headers

## Tests

New targeted tests:

- `apps/web/server/services/__tests__/workerAuthService.test.ts`
- `apps/web/server/services/__tests__/workerRegistryService.test.ts`
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`

Targeted passes:

- `npm --prefix apps/web test -- server/services/__tests__/workerAuthService.test.ts server/services/__tests__/workerRegistryService.test.ts server/routes/__tests__/workerRuntime.test.ts`
- `npm --prefix apps/web test -- shared/__tests__/workerRuntime.test.ts server/services/__tests__/workerRuntimeSchema.test.ts server/services/__tests__/tenantFeatureFlagsOpenClawSync.test.ts server/middleware/__tests__/publicApiHeaders.test.ts`
- `npm --prefix apps/web test -- server/__tests__/authExtension.test.ts server/__tests__/requireScopes.test.ts`

Section-specific pass summary:

- 51/51 targeted and regression tests passed across the worker control-plane, shared contract, and auth/header touchpoints

## Code review changes

- Tightened artifact/event payload contracts by requiring `leaseOwnerToken`, because stale-lease protection would otherwise be impossible to enforce concretely
- Kept worker routes mounted under `/api` and isolated from `/v1` middleware assumptions
- Deferred commit creation again because `apps/web/server/_core/index.ts` already contains unrelated branch-local changes outside section 02; review focused only on the worker-route import/mount hunks
