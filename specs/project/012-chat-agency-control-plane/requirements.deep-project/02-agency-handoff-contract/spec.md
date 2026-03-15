# Spec: Agency Handoff Contract

## Goal

Define the formal contract for turning a Chat task into an `Automation Program`, handing that program into Agency Swarm, and returning run state and artifacts back into Chat.

## In scope

- Root `Automation Program` entity and lifecycle
- Handoff request payload from Chat
- Source conversation linkage
- Agency run artifact model in Chat
- Resume and return navigation
- Failure and cancellation states
- Execution posture contract:
  - `direct-run`
  - `draft-review`
  - `confirm-first`
  - `human-gated`
- State transitions between Chat, Agency run, schedule binding, and materialized outputs

## Out of scope

- Final destination-selection heuristics
- Final recurring-schedule engine behavior

## Existing anchors

- `apps/web/client/src/pages/AgencyChat.tsx`
- `apps/web/server/services/agencyBridge.ts`
- `apps/web/server/services/agencyEscalation.ts`
- Browser Session return artifact patterns in Chat

## Dependencies

- Requires `01-chat-intent-router`

## Provides to later splits

- Stable root object for all downstream surfaces
- Stable cross-surface run identity
- Chat-visible agency run state
- API and artifact contract for downstream UX
- Shared execution posture semantics for both `04-agency-flow-composer` and `06-chat-control-plane-ux`

## Required output from deep plan

- Canonical fields for `Automation Program` identity, origin, current state, execution posture, schedule pointer, destination pointer, and output summary
- Canonical provenance fields for tenant, actor, auth context, permission snapshot, and re-authorization requirements
- Rules for when a prompt creates:
  - a one-shot agency run
  - an automation-program draft
  - a reusable agency definition
- Return-artifact rules so Chat can show a single stable record even when multiple agency runs occur over time
- Cancellation, pause, resume, and supersede semantics
- An explicit persistence decision:
  - whether `Automation Program` is a new persisted entity
  - or a composition facade over existing agency/schedule/project records
  - including owner table or aggregate boundary, ID semantics, and migration impact

## Key decisions to make in deep plan

- Whether handoff creates an agency immediately or targets an existing template/agency
- Whether the first Chat integration is direct agency run launch or draft-review-first
- How much of agency progress should stream into Chat
- Whether `Automation Program` is a new persisted entity or a composition over existing agency/schedule/project records

## Persistence requirement

Deep plan must not leave `Automation Program` as a conceptual wrapper only. It must make an explicit persistence decision and document:

- where canonical identity lives
- what record owns lifecycle state
- which downstream systems reference that identity
- how divergent state is prevented between Chat, Agency, schedule bindings, and materialized outputs
- how tenant/user ownership and permission provenance are preserved across run, rerun, resume, and recurring execution
