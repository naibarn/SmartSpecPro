# Implementation Plan TDD

## Test strategy

Implement the feature in four sections and keep tests ahead of behavior changes.

## Section 01: Runtime identity, schema, and bridge contract

Add or update tests first:

- `apps/web/shared/__tests__/workerRuntime.test.ts`
- `apps/web/server/services/__tests__/workerRuntimeSchema.test.ts`
- `apps/web/server/services/__tests__/workerFleetService.test.ts`

Expected failing conditions:

- `workerRuntimeTypeValues` does not include `hermes_agent_gateway`
- runtime definitions do not expose a Hermes display name, feature flag, or compatibility posture
- Hermes registration payloads reject or ignore required runtime metadata fields

Regression checks:

- existing OpenClaw, DesktopZeroClaw, NemoClaw, and HiClaw runtime behavior remains unchanged

## Section 02: Delegated access and Hermes bridge execution

Add or update tests first:

- `apps/web/server/routes/__tests__/workerRuntime.test.ts`
- `apps/web/server/services/__tests__/workerDelegationService.test.ts`
- `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`
- `apps/web/server/__tests__/responsesRoutes.test.ts`
- `python-backend/tests/hermes_bridge/test_registration.py`
- `python-backend/tests/hermes_bridge/test_transport.py`

Expected failing conditions:

- Hermes bridge cannot register and heartbeat under the new runtime type
- Hermes delegated sessions fail to expose correct scope profiles or route families
- delegated MCP manifests do not reflect Hermes capability flags truthfully
- bridge transport to Hermes API server does not fail closed when config is missing or unsafe
- Hermes-driven delegated HTTP or MCP calls do not carry delegated-worker origin metadata and trace correlation needed for billing attribution

Regression checks:

- OpenClaw delegated session creation and existing MCP audit behavior still pass unchanged
- existing delegated-worker billing and spend-guardrail behavior still applies unchanged

## Section 03: Bound worker, callbacks, and channel companion behavior

Add or update tests first:

- `apps/web/server/services/__tests__/teamService.test.ts`
- `apps/web/server/services/__tests__/runEngine.test.ts`
- `apps/web/server/services/__tests__/workerCallbackService.test.ts`
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`
- `python-backend/tests/hermes_bridge/test_callbacks.py`

Expected failing conditions:

- Hermes workers are not eligible for binding when capability flags say they should be
- Hermes workers bind even when owner or tenant rules do not match
- callbacks do not publish the correct room/workflow/user notification metadata
- channel metadata is accepted without the required runtime capability posture
- Hermes bridge attempts to use a non-standard callback ingress instead of the existing worker callback routes and scopes
- callback links or payloads bypass existing HTTPS, allowlist, rate-limit, or idempotency protections

Regression checks:

- OpenClaw binding behavior remains valid
- non-capable runtimes still fail with "not eligible for bound-connector flows"
- existing worker callback route protections remain unchanged for non-Hermes runtimes

## Section 04: Rollout, docs, and governance

Add or update tests first:

- `apps/web/shared/__tests__/agencyHybridFeatureFlag.test.ts`
- `apps/web/server/services/__tests__/workerSchedulerService.test.ts`
- doc link or smoke tests if present for worker help pages

Expected failing conditions:

- Hermes runtime paths still activate when `hermesAgentRuntime` is disabled
- scheduler or fleet views surface Hermes as generally dispatchable before rollout allows it
- docs/help routes do not distinguish Hermes from OpenClaw and Desktop Host
- non-loopback Hermes API server endpoints are accepted without the required admin policy posture
- rollout gating does not keep registration, dispatch, delegated MCP, and channel companion behavior separated by stage

Regression checks:

- all existing worker-family help surfaces continue to resolve correctly
- existing scheduler policy and worker visibility rules remain stable for current runtime families

## Fixtures and test utilities

- add Hermes bridge registration fixtures with safe loopback API-server URLs
- add capability-matrix fixtures for:
  - runtime only
  - runtime + delegated HTTP
  - runtime + delegated MCP
  - runtime + channel companion callbacks
- add failure fixtures for:
  - public remote API endpoint
  - remote endpoint with redirect or unsafe resolved address posture
  - missing API server key
  - missing callback capability
  - missing delegated billing metadata or trace context

## Exit criteria

- every new Hermes path has both happy-path and fail-closed coverage
- existing OpenClaw and DesktopZeroClaw tests still pass
- bridge tests verify transport, callback, and capability-declaration truthfulness before rollout expands
