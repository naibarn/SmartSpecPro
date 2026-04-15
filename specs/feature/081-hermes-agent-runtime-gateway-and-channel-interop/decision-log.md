# Decision Log

## Planning depth

Decision: `standard`

Reason:

- the request is larger than a one-file note because it changes runtime taxonomy, worker control-plane scope, product positioning, and rollout policy
- the request is still narrow enough to stay below a full `deep-plan` promotion because it does not redesign the entire worker fabric or desktop-host model

## Key product decisions

1. The planning package should be a new feature folder:
   - `081-hermes-agent-runtime-gateway-and-channel-interop`

2. Hermes should be modeled as a truthful external runtime family, not as `openclaw_gateway` and not as a desktop-host internal runtime.

3. The recommended runtime type is:
   - `hermes_agent_gateway`

4. Hermes integration must require a SmartSpecPro bridge adapter.
   - Upstream Hermes exposes an API server, MCP consumption, messaging gateways, and profiles.
   - Upstream Hermes does not natively expose the SmartSpecPro worker control-plane contract of register, claim, heartbeat, event, and artifact publication.

5. The first production posture should be:
   - `workerMode = "per_user"`
   - `runtimeMode = "external_managed"`
   - owner-bound binding only

6. Hermes should reuse the existing delegated worker HTTP and MCP access surfaces instead of creating a Hermes-only platform API.

7. Hermes should be eligible for bound-worker flows only when the bridge advertises explicit capability flags such as:
   - `supportsBoundConnector`
   - `supportsDelegatedHttp`
   - `supportsDelegatedMcp`
   - `supportsCallbacks`

8. Hermes messaging gateways should be modeled as external channel companions, not as SmartSpecPro-native channel infrastructure in the first wave.

9. Hermes should not be added to the Desktop Host runtime taxonomy from Feature 075.
   - Pi and Agency Swarm remain the internal managed desktop runtimes.

10. Hermes memories, skills, SOUL files, and channel sessions remain upstream-owned by default.
    - this feature should not silently promote them into SmartSpecPro server-canonical package or trust models

11. A dedicated feature flag should gate the runtime:
    - `hermesAgentRuntime`

12. Channel-handoff behavior should have a narrower readiness gate than base runtime registration.

## Risks that could force later promotion

- if implementation later requires a fully general "agent endpoint runtime" framework beyond Hermes, the work may need promotion into a larger cross-runtime feature
- if SmartSpecPro later wants to ingest Hermes memories or skills as trusted org artifacts, that would become a larger package-trust and migration feature
- if ACP/editor-mode integration becomes a core coding-surface requirement, that should be handled in a separate follow-on feature instead of expanding this package

## Self-review stabilization log

### Round 1

Finding:

- the initial outline blurred Hermes runtime identity with Desktop Host runtime identity

Fix:

- added an explicit decision that Hermes is external-only and cannot replace Pi or Agency Swarm

### Round 2

Finding:

- the initial scope did not justify how Hermes would satisfy the existing worker control-plane contract

Fix:

- added the required Hermes bridge adapter decision and made it central to the spec and sections

### Round 3

Finding:

- the first draft underplayed owner-bound bound-worker semantics from Feature 072

Fix:

- added explicit personal-worker defaults and bound-worker capability flags

### Round 4

Finding:

- the first draft mentioned channels but did not constrain them enough

Fix:

- added explicit channel-companion posture, narrower rollout gate, and no native SmartSpecPro channel claim in v1

### Round 5

Finding:

- the first draft did not explain why Hermes matters relative to OpenClaw users

Fix:

- added the OpenClaw migration lane and user-onboarding rationale

### Round 6

Finding:

- no further meaningful completeness or contradiction issues found

Fix:

- none

### Round 7

Finding:

- no further meaningful completeness or contradiction issues found

Fix:

- none
