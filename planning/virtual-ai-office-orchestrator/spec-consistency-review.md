# Spec Consistency Review

## Scope

Review date: 2026-03-18

Reviewed artifact:

- `planning/virtual-ai-office-orchestrator/spec.md`

Review goal:

- verify that the spec consistently covers persona, team creation, per-member identity, per-member memory, shared memory, chat UI migration, external intake, and human-in-the-loop behavior before deep planning

## Overall Assessment

Status: mostly consistent and ready for deep-plan handoff

The spec now reads as a coherent product-plus-technical design for:

- user as orchestrator
- assistant teams as durable collaborators
- persona reuse from the current system
- per-member private memory plus shared memory scopes
- room/run/event architecture
- external task intake and approval policies

## What Is Explicitly Covered

### Persona Foundation

Covered:

- user personas
- assistant personas
- team persona overlay
- profession-oriented templates
- mixed-template personas for multi-role users
- nickname, gender style, and template provenance

Result:

- the new system extends the existing persona layer instead of replacing it

### Team Member Identity

Covered:

- each team member is represented as an `assistant profile`
- each assistant profile binds to a persona
- team builder supports existing persona, inline new persona, or cloned persona

Result:

- team identity is defined member-by-member, not only at team level

### Team Member Memory

Covered:

- private `agent memory`
- shared `team memory`
- shared `room memory`
- `project memory`
- `run/task memory`

Result:

- each assistant can maintain its own memory without polluting other members

### Team Creation UI

Covered:

- quick team flow
- guided builder flow
- advanced builder flow
- inline persona creation
- persona reuse from current settings/admin models
- validation that each member has persona plus private memory scope

Result:

- deep plan should not need to invent the team-creation flow from scratch

### Existing Chat UI Integration

Covered:

- migration from single conversation state to unified thread references
- sidebar redesign
- composer redesign
- right panel redesign
- brainstorm migration
- coexistence strategy with `AgencyChat`

Result:

- `/chat` migration path is explicitly described

### External Intake

Covered:

- external task sources
- external inbox
- intake materialization pipeline
- MCP/API/webhook entry points
- trust tiers
- human review modes

Result:

- the system no longer assumes every task begins with a user typing in chat

## Important Consistency Checks

### Check 1: Does every team member have a persona?

Yes.

The spec now requires:

- every assistant member resolves to exactly one assistant profile
- every assistant profile resolves to exactly one persona binding at runtime

### Check 2: Does every team member have its own memory?

Yes.

The spec now explicitly requires:

- every assistant profile has its own private agent-memory scope
- one assistant cannot read another assistant’s private memory by default

### Check 3: Is shared team chat memory separate from per-member memory?

Yes.

The spec separates:

- `agent memory`
- `team memory`
- `room memory`
- `project memory`
- `run/task memory`

### Check 4: Is persona work already done in the product reflected here?

Yes.

The spec now explicitly preserves:

- multi-profession templates
- mixed-template personas
- template provenance
- nickname and gender style
- shared personas from admin scope

### Check 5: Is the old brainstorm concept still conflicting with the new model?

No major conflict remains.

Brainstorm is consistently treated as:

- a transitional UI affordance
- a discussion preset within the team model

## Remaining Gaps That Are Acceptable For Deep Plan

These are still open, but they should be handled in deep plan rather than block the spec:

- exact wireframes for team builder and `/chat`
- exact DB column names and foreign-key strategy for all new tables
- exact event payload schemas per event type
- exact migration sequencing between `agency` runtime tables and new product-facing tables
- exact approval inbox UX details

## Recommendation

This spec is ready to hand off to deep plan.

Reason:

- the major product model is coherent
- the current persona work is represented faithfully
- team member persona and team member memory are now explicit requirements
- the remaining unknowns are implementation-detail questions, not product-definition gaps
