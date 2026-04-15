# Implementation Plan

## Objective

Add a research-backed, implementation-ready Hermes integration lane that places Hermes Agent in SmartSpecPro as a truthful bring-your-own external runtime and channel companion, without weakening the Desktop Host model from Feature 075 or the worker trust model from Features 071-077.

## Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/shared/workerRuntime.ts` | Runtime vocabulary currently stops at OpenClaw/DesktopZeroClaw/NemoClaw/HiClaw | Add a truthful Hermes runtime family, feature flag, metadata, and compatibility profile |
| `apps/web/server/routes/workerRuntime.ts` and `workerRegistryService.ts` | Worker control plane already supports register/heartbeat/claim/event/artifact flows | Define how a Hermes bridge participates in that control plane |
| `apps/web/shared/workerDelegation.ts` and `workerDelegationService.ts` | Delegated HTTP/MCP access already exists for workers | Reuse this as Hermes's platform access model |
| `apps/web/server/services/teamService.ts` and Teams UI | `external_connector` and owner-bound `externalWorkerId` already exist | Let Hermes become a first-class bound-worker option |
| `apps/web/server/_core/mcpPublicServer.ts` | MCP is already runtime-aware and audited | Expose a smaller delegated MCP surface for Hermes bridge sessions |
| Feature 075 Desktop Host package | Desktop runtime labels are already locked to Pi and Agency Swarm | Keep Hermes outside the managed desktop-host core and define its boundary clearly |

## Recommended affected files and modules

- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/delegatedWorkerPlatformService.ts`
- `apps/web/server/services/workerFleetService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerCallbackService.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/docs/help/en/hermes-workers.md`
- `apps/web/docs/help/th/hermes-workers.md`
- `python-backend/hermes_bridge/*`
- `python-backend/tests/hermes_bridge/*`

## Implementation approach

### 1. Add Hermes runtime identity and metadata

- extend worker runtime enums, schema, runtime definitions, and help text with `hermes_agent_gateway`
- add a Hermes-specific feature flag and dispatch posture
- define runtime metadata for Hermes bridge registrations, including:
  - `hermesVersion`
  - `profileName`
  - `apiServerEnabled`
  - `apiServerBaseUrl`
  - `terminalBackend`
  - `gatewayPlatforms`
  - `supportsDelegatedHttp`
  - `supportsDelegatedMcp`
  - `supportsBoundConnector`
  - `supportsCallbacks`
  - `hostPlatform`
  - `hostExecutionMode`

### 2. Introduce a Hermes bridge adapter

- create a bridge process that speaks SmartSpecPro's worker registration, heartbeat, claim, event, artifact, delegated-session, and callback flows
- prefer Hermes API-server transport for actual agent execution
- keep CLI transport optional and explicitly secondary if later needed
- preserve owner-bound runtime identity and avoid shared cross-user worker reuse in v1

### 3. Reuse delegated HTTP and MCP access

- let Hermes bridge request delegated worker sessions using the current scope profile system
- keep HTTP-first platform access as the default
- treat MCP as opt-in and capability-filtered
- publish delegated capability manifests that truthfully describe what the Hermes worker can currently use
- require Hermes-driven delegated HTTP and MCP calls to reuse delegated-worker origin metadata, trace correlation, and spend guardrails so billing attribution stays inside the existing SmartSpecPro accounting path
- make the bridge responsible for propagating trace context and worker identity rather than creating a parallel Hermes-only usage log

### 4. Preserve billing, trace, and audit attribution

- keep SmartSpecPro as the source of truth for worker cost attribution, usage traces, and audit events
- reuse existing delegated-worker billing metadata helpers and worker-scheduler billing metadata instead of introducing Hermes-specific accounting objects
- ensure Hermes bridge execution can be correlated from:
  - worker registration
  - delegated session
  - downstream HTTP or MCP invocation
  - callback publication
  - artifact publication
- require implementation to fail closed if Hermes execution cannot be tied back to tenant, owner, worker, job, and trace context

### 5. Extend bound-worker and channel-companion flows

- make Hermes workers bindable through the existing `external_connector` model when capability flags allow it
- support worker callbacks and room/workflow updates for Hermes-driven tasks
- keep Hermes-owned messaging tokens and platform sessions upstream-owned
- let SmartSpecPro reference Hermes channel capabilities as metadata, not as native platform channel ownership
- reuse the current worker callback ingress routes, worker token scopes, idempotency handling, payload limits, and callback-link allowlists rather than adding a Hermes-specific public webhook ingress
- require the Hermes bridge to publish through worker runtime endpoints protected by `worker_execution` tokens and `workers:report` scope so callback trust stays aligned with existing worker families

### 6. Add governance, rollout, and onboarding

- gate Hermes registration and dispatch behind `hermesAgentRuntime`
- add explicit staged readiness gates under that parent flag for:
  - registration and fleet visibility
  - owner-bound dispatch and delegated HTTP access
  - delegated MCP access
  - channel-companion callbacks and metadata
- document the admin exception path for non-loopback Hermes API endpoints, including approval, audit, and rollback expectations
- add docs for:
  - when to choose Hermes vs OpenClaw vs Desktop Host
  - OpenClaw-to-Hermes onboarding guidance
  - supported deployment postures such as Linux, macOS, and WSL2

## Risks and mitigations

### Risk: Hermes is mistaken for a desktop-host replacement

Mitigation:

- keep Hermes runtime type external-only
- add explicit docs and runtime labels that distinguish it from Pi, Agency Swarm, and Desktop Host

### Risk: SmartSpecPro promises Hermes capabilities that upstream does not expose natively

Mitigation:

- require the bridge adapter
- keep capability flags explicit and discovery-based
- fail closed when API-server transport or callback support is unavailable

### Risk: channel integrations create hidden exfiltration or shadow-IT behavior

Mitigation:

- keep messaging credentials upstream-owned
- expose only admin-visible metadata and callback links in SmartSpecPro
- reuse delegated scopes, callback auditing, and library publication policies

### Risk: users confuse OpenClaw and Hermes as the same runtime

Mitigation:

- create a separate runtime family and separate help docs
- explain the overlap and migration path without collapsing identity

## Security and boundary concerns

- no raw tenant API keys or provider keys should be copied into Hermes bridge runtime sessions
- delegated SmartSpecPro access must stay lease-bound, owner-bound, and tenant-bound
- public internet Hermes API endpoints should be denied by default; bridge connections should prefer loopback or explicitly approved private-network targets
- if a later admin policy allows a non-loopback Hermes endpoint, the bridge must normalize and validate the URL, reject protocol downgrades, deny unsafe redirects, re-check resolved address posture at connect time, and audit the policy exception used
- Hermes capabilities must be represented as metadata and policy, not trusted implicitly because upstream claims support
- Hermes callbacks must arrive only through the existing worker-runtime callback routes guarded by worker tokens, scope checks, rate limits, idempotency, and callback-link allowlists
- Hermes execution must preserve trace IDs and delegated billing metadata across HTTP, MCP, callback, and artifact flows so audit and credit attribution remain reconcilable
- artifacts produced by Hermes should publish through the same library and audit pipelines already used by worker runtimes

## Acceptance criteria

- SmartSpecPro has a truthful Hermes runtime family and feature flag
- Hermes can join worker-fabric flows only through a declared bridge contract
- a personal Hermes worker can be bound to `external_connector` team members when policy allows it
- Hermes bridge sessions can consume delegated HTTP and filtered MCP platform access without requiring a Hermes-only platform API
- Hermes-driven delegated calls, artifacts, and callbacks remain attributable to tenant, owner, worker, job, and trace context inside the existing billing and audit paths
- Hermes callback publishing reuses the current worker callback ingress rather than introducing a weaker side-channel webhook path
- admin and user help surfaces explain where Hermes fits relative to OpenClaw and Desktop Host
- the spec preserves Feature 075 semantics instead of weakening them

## Rollout and testing notes

- ship runtime identity, bridge contract, and parent feature flag first
- enable registration and fleet visibility before owner-bound dispatch
- enable owner-bound dispatch and delegated HTTP before delegated MCP
- enable channel-companion behavior only after callback, artifact, billing, and audit correlation behavior are stable
- keep any non-loopback Hermes endpoint support behind a separate admin-reviewed policy path with explicit observability
- test both "feature disabled" and "feature enabled but no bridge capabilities" fail-closed paths
