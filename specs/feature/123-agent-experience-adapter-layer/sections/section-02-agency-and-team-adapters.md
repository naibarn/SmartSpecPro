# Section 02: Agency And Team Adapters

## Objective

Implement pure adapters that map existing Agency and Team/Orchestrator stream events into `SmartSpecAgentEvent[]` plus dropped-event diagnostics.

## Dependencies

- section-01-shared-contracts-and-flags

## Scope

- Add `agencyStreamToAgentEvents`.
- Add `runStreamToAgentEvents`.
- Preserve source event identity, timestamps, tenant/run/team/conversation identity, actor identity, visibility, and order where available.
- Return `AgentExperienceParseResult`.
- Keep adapters pure and dependency-light.

## Files To Add

- `packages/agent-experience/src/adapters/index.ts`
- `packages/agent-experience/src/adapters/agencyStream.ts`
- `packages/agent-experience/src/adapters/runStream.ts`
- `packages/agent-experience/src/__tests__/agencyStream.test.ts`
- `packages/agent-experience/src/__tests__/runStream.test.ts`

## Files To Inspect

- `apps/web/client/src/hooks/useAgencyStream.ts`
- `apps/web/shared/agencyStreamEvents.ts`
- `apps/web/client/src/hooks/useRunStream.ts`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`

Only modify these files if type extraction is impossible without a small export. Do not change live rendering in this section.

## Agency Mapping

Map:

- `meta` / `run_started` to `session.started`
- `text_delta` / `token` to `message.delta`
- assistant completion to `message.done`
- `tool_start` to `tool.start`
- `tool_progress` to `tool.progress`
- `tool_end` / `tool_result` to `tool.done` or `tool.error`
- `approval_required` to `approval.request`
- `preview_ready` to `artifact.created`
- `run_complete` / `run_finished` to `workflow.step` plus `cost.finalized` when source usage exists
- `guardrail_trigger` to `debug.trace` or `error`

## Team Mapping

Map `RunStreamEvent`-like input while preserving:

- `eventId`
- `tenantId`
- `teamId`
- `roomId`
- `runId`
- `actorType`
- `actorId`
- `visibility`
- `ts`

Known workflow/stage events should map to `workflow.step`. Unknown or private events should be dropped or debug-only according to visibility and redaction policy.

## UI/UX Contract

### Target User / JTBD

- Implementers need canonical stream adapters that let future UI render Agency and Team activity consistently without exposing source-specific vocabulary.

### Surface Inventory

- No visible UI is introduced in this section.
- Future consumers are Agency preview, Team preview, and shared Agent Experience renderer.

### Component Map

- No React components are added here.
- Adapter outputs must match renderer intent and event contracts from Section 01.

### State Matrix

- connected source stream;
- partial event batches;
- unknown source event;
- malformed source event;
- missing artifact/approval identity;
- redacted source metadata;
- adapter disabled by flags.

### Responsive Matrix

- Not applicable to adapter-only code.
- Future renderer must not infer layout from source-specific event shape.

### Accessibility Acceptance

- Adapter diagnostics must include enough reason metadata for accessible error and empty states downstream.
- Do not encode meaning only through icon/color-oriented event kinds.

### Copy Contract

- Diagnostics and fixture labels use `Agent Experience`, `Agency`, and `Team`.
- Do not introduce user-facing `Persona` names.

### Browser Evidence Required

- Not required for adapter-only code.
- Browser evidence starts when a renderer consumes these adapters.

## Tests First

- Test Agency happy path event sequence.
- Test Agency legacy token/tool event mapping.
- Test Agency approval request mapping.
- Test Agency malformed event dropped without throw.
- Test Team identity preservation.
- Test Team private/internal visibility is not emitted to normal renderer output.
- Test unknown Team event produces dropped diagnostics or safe debug event.
- Test adapter order is stable for arrays of source events.

## Acceptance Criteria

- Agency and Team adapters pass focused unit tests.
- Dropped-event diagnostics include reason and source identity where available.
- No live UI files change unless justified in implementation notes.
- No backend mutations or service calls are introduced.
