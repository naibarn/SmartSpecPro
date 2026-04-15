# Section 01: Runtime Identity, Bridge, and Schema Foundation

## Ownership

This section owns the truthful Hermes runtime identity and the bridge contract that lets Hermes participate in SmartSpecPro's worker fabric without pretending upstream Hermes already speaks the worker protocol natively.

## Target files and modules

- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerFleetService.ts`
- `python-backend/hermes_bridge/*`

## Scope

- add `hermes_agent_gateway` as a first-class worker runtime family
- define a Hermes-specific feature flag and dispatch posture
- add runtime metadata and compatibility contracts for Hermes bridge registrations
- establish the bridge as the only supported v1 way to connect Hermes to SmartSpecPro worker APIs

## Implementation notes

- do not alias Hermes to `openclaw_gateway`
- prefer a Python bridge because Hermes upstream is Python-first and already exposes a Python-native install/runtime environment
- required Hermes metadata should include:
  - version
  - profile
  - host platform
  - terminal backend
  - API server posture
  - delegated HTTP/MCP capability flags
  - callback capability flags
- runtime definitions should make Hermes stable for registration before it becomes fully stable for dispatch

## TDD expectations

- add shared runtime enum and definition tests before schema changes
- add registration validation tests before bridge happy paths
- add compatibility-evaluation tests before runtime is shown as healthy or dispatchable

## Acceptance checks

- shared worker runtime vocabulary includes `hermes_agent_gateway`
- Hermes has its own runtime definition, display name, and feature flag
- Hermes registration fails closed when bridge metadata is incomplete or incompatible
- admin runtime surfaces do not label Hermes as OpenClaw or Desktop Host

## Risks and coordination notes

- the biggest risk in this section is semantic drift: if Hermes is mislabeled now, every later UI and policy surface will inherit the confusion
