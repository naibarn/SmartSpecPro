# Spec: Destination and Project Resolution

## Goal

Teach the system to decide where generated outputs belong without requiring the user to pick the internal workspace first.

## In scope

- Destination classifier for outputs:
  - presentation workspace
  - media/video workspace
  - chat artifact
  - agency-owned output
- Project/container creation or reuse rules
- Ownership and grouping semantics for recurring outputs
- User-visible landing/read model so generated outputs appear in the right workspace at the right time
- Rules for whether outputs are materialized directly into destination workspaces or referenced through the Automation Program first

## Existing anchors

- Presentation routes in `apps/web/client/src/App.tsx`
- Media Studio route and media generation flows
- Chat memory and artifact systems
- `projectId` patterns already present in chat/memory/orchestrator interfaces

## Dependencies

- Requires `01-chat-intent-router`
- Should align tightly with `02-agency-handoff-contract`

## Provides to later splits

- Target workspace and storage decision
- Rules for recurring output placement
- Project identity for alerts and run summaries
- Landing semantics for expectations like “open Presentation in the morning and see today’s two new decks”

## Required output from deep plan

- A destination decision model with user-overridable defaults
- Rules for project creation, project reuse, naming, and ownership
- Read-side requirements for listing, grouping, filtering, and surfacing outputs in downstream product pages
- A clear answer to whether a shared `automation project` concept is needed or whether existing destination projects are sufficient

## Decision inputs

Deep plan should define the explicit inputs used to choose a destination, including at minimum:

- asset type and output modality
- user intent and requested end state
- recurrence vs one-shot execution
- collaboration and editability expectations
- publish target or delivery target
- existing project affinity or historical destination context
- whether output should remain agency-owned or be materialized into a user-facing workspace immediately

## Key decisions to make in deep plan

- Whether a new shared “automation project” entity is needed
- How presentation/video outputs map into existing libraries
- How users review or override the chosen destination
- Whether materialization is synchronous with run completion or async via downstream publish/commit steps
