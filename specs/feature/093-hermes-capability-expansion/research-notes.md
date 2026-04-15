# Research Notes

Checked: 2026-04-14

## Existing Hermes foundation

Feature 081 already establishes the main Hermes integration lane:

- truthful runtime identity through `hermes_agent_gateway`
- feature-gated rollout with `hermesAgentRuntime`
- delegated HTTP and MCP access through the worker fabric
- owner-bound team binding through `external_connector`
- channel-companion posture with callbacks and handoff links

Implication:

- the next feature should expand usability and specialization on top of that lane, not replace it

## Current product and codebase fit

### Runtime and registration

Relevant files:

- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerRegistryService.ts`

Findings:

- Hermes already has a dedicated runtime identity and runtime metadata schema
- worker registration, heartbeat, claim, delegated session, and callback routes already exist
- runtime metadata is the right place to carry Hermes-specific persona, channel, and progress state

Implication:

- profile, mode, and visibility improvements can be layered onto existing runtime metadata and worker routes

### Team binding and external connectors

Relevant files:

- `apps/web/server/services/teamService.ts`
- `apps/web/client/src/pages/Teams.tsx`

Findings:

- `external_connector` is already the existing team surface for external workers
- Hermes already appears in Teams UI with policy hints and channel companion metadata

Implication:

- the new feature can improve how users choose and understand Hermes without introducing a new member type

### Delegation and task routing

Relevant files:

- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/workerSchedulerService.ts`

Findings:

- delegated sessions already have scope profiles and route families
- Hermes dispatch is already capability-gated rather than name-gated
- this is a good fit for task specialization while preserving fallback flexibility

Implication:

- specialization should be expressed as selectable modes and capabilities, not as a hard lock to one task class

### Monitoring and UX

Relevant files:

- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/web/client/src/pages/Teams.tsx`

Findings:

- the current UI exposes Hermes policy and runtime state, but the experience is still ops-oriented
- non-technical users need clearer language for "what Hermes is doing" and "how far along it is"

Implication:

- the next feature should add user-friendly progress, persona, and channel summaries

### Memory and context surfaces

Relevant files:

- `apps/web/server/services/memoryService.ts`
- `apps/web/server/services/scopedMemoryService.ts`
- `apps/web/server/services/memoryArchiveService.ts`

Findings:

- SmartSpecPro already has memory-related services and scope-aware data handling
- Feature 081 intentionally left Hermes memory and profiles upstream-owned by default

Implication:

- opt-in memory/context sync is possible, but it must be explicitly scoped and consented

## Product research conclusions

1. Hermes profiles are a real upstream concept and can be surfaced as user-friendly personas.
2. Hermes channel presence is valuable, but SmartSpecPro should keep ownership of audit and policy rather than channel tokens.
3. Memory sync should be optional and selective, not automatic.
4. Task specialization should expand usefulness without collapsing Hermes into one rigid role.
5. Better progress visibility is the most immediately valuable change for everyday users.

## Scope guardrails for the next feature

- keep Hermes external and user-owned
- keep task modes additive, not exclusive
- keep memory sync opt-in and scoped
- keep channel workflows backed by existing callback and delegation surfaces
- keep the UX understandable for non-technical users

