# Section 03: Ledger Dashboard

## Purpose

Rework the Team page so the user sees a structured orchestration dashboard instead of a chat-first conversation feed.

## Scope

This section should concentrate on:

- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/components/orchestrator/*`
- any small dashboard-specific components needed for:
  - objective summary
  - plan cards
  - current step card
  - review card
  - audit timeline
  - secondary conversation area

## Responsibilities

- Present the objective and plan before execution
- Show a dedicated "Plan and responsibilities" section before execution events for auto rooms
- Show owner/reviewer status for each step
- Show each step's objective, owner, reviewer, evidence required, verification method, retry rule, current status, and latest result
- Show review feedback and revision loops
- Surface terminal stop reasons clearly
- Keep the conversation feed secondary for auto-led rooms
- Preserve manual controls for manual rooms without changing the ledger model
- Provide drill-down from summary cards into attempt-level audit detail
- Default the conversation drawer to collapsed for auto rooms and open for manual rooms
- Avoid wording that implies hidden default fallback behavior. If a human choice deadline expires, the dashboard must show that the run remains paused for an explicit decision.

## Data flow

1. The page loads room/run/read-model data from the Team APIs
2. The dashboard derives the visible plan, step, review, and audit state
3. The page renders the orchestration panels in a stable layout
4. The secondary conversation view links back to the same ledger context

## Key implementation notes

- The default layout should prioritize legibility over density
- Avoid making the user infer plan or review state from message bubbles
- Auto-led rooms should make the structured ledger the primary surface, with chat/messages used as supporting context rather than the source of truth
- The dashboard should support drill-down without making every detail visible by default
- Auto rooms should start immediately and show that they are still executing or waiting for evidence
- If strict planning or review fails, show the failed gate, reason, and no-fallback diagnostic instead of hiding it behind a generic stalled state
- If an audited plan snapshot is absent, label the plan as missing/blocked rather than reconstructing it visually as though it were authoritative
- Long histories should remain complete through pagination, collapse, or secondary detail panes rather than dropping prior attempts
- Historical rooms with partial derived ledgers should be labeled clearly instead of blending into fully structured runs

## Tests expected from this section

- auto-team room creation shows the running dashboard
- start controls are hidden or replaced for auto rooms
- plan-and-responsibilities section renders before execution events and includes owner/reviewer/evidence/verification/retry/latest-result fields
- review and rework states render distinctly
- timeline panels show the correct order of events
- no-fallback planning/review failures render clear diagnostic messages
- missing audited plan evidence renders as blocked/missing instead of an invented plan
- attempt detail panels expose provider/model/prompt-context metadata for authorized users
- auto rooms default to ledger-first with conversation collapsed
