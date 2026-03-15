# Spec: Chat Intent Router

## Goal

Make Chat capable of routing a user request into the correct execution mode without requiring the user to know internal product boundaries.

## Why this split exists

The current Chat surface already supports multiple capabilities, but the routing behavior is distributed and partial. This split creates a formal intent-routing layer so downstream execution paths are explicit and testable.

## In scope

- Define a canonical multi-axis execution-intent model for Chat
- Classify prompts into an intent envelope instead of a single enum
- The envelope should separate at least:
  - `work_kind` (chat answer, skill task, media generation, presentation generation, browser task, automation task)
  - `orchestration_mode` (single-turn, Browser Session, agency orchestration)
  - `execution_surface` (chat, browser, agency, downstream workspace)
  - `destination_hint` (presentation, media, chat artifact, automation-owned output)
  - `recurrence_intent` (one-shot, scheduled, recurring)
  - `approval_posture` (direct-run, draft-review, confirm-first, human-gated)
  - `resolution_status` (`resolved`, `needs_clarification`, `awaiting_confirmation`, `manual_override`, `rejected`)
- Attach routing reasons, confidence, and missing-information notes
- Expose routing metadata to UI and downstream execution services

## Out of scope

- Final agency-flow composition details
- Final schedule execution semantics
- UI copy beyond the routing explanation contract

## Existing anchors

- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/server/services/taskPlannerMiddleware.ts`
- `apps/web/server/services/agencyEscalation.ts`
- current Browser Session suggestion and launch detection

## Dependencies

- None; this is the first architectural seam

## Provides to later splits

- Canonical intent envelope
- Routing explanation metadata
- Trigger conditions for agency escalation
- Destination hints for project resolution
- Initial approval posture recommendation

## Required output from deep plan

- A typed schema that can be shared across Node, UI, and Python boundaries where necessary
- Resolution rules for conflicting signals, such as `browser + recurring + media` in the same prompt
- A strategy for underspecified prompts, including when to ask clarifying questions instead of guessing
- Compatibility rules with current Chat skills, Browser Session suggestions, and planner-driven escalation
- Explicit semantics for how `resolution_status` changes over time and which downstream splits are allowed to change it

## Key decisions to make in deep plan

- Where the routing model lives: shared schema vs Node-only service
- Which routes are deterministic heuristics vs planner/model-mediated
- When to require confirmation for escalation
- How multi-axis routing is serialized so later splits do not collapse it back into a single mode
