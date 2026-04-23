# Implementation Plan: Team Orchestration Audit Trail And Auto Completion

## 1. Goal

Build a Team experience that presents work as an auditable workflow ledger rather than a chat transcript.

The plan must support:

- a visible objective and plan before execution
- explicit ownership for execution and review
- explicit review feedback and rework loops
- evidence-based completion
- `auto_team` execution that keeps advancing until the run genuinely reaches a terminal state
- a post-hoc audit trail that explains how the result was produced

## 2. Architecture summary

The implementation should align three layers:

1. Data layer: structured events for objective, plan, step, attempt, review, and terminal outcome
2. Runtime layer: the run engine emits those events as the workflow advances
3. Presentation layer: the Team page renders the ledger as the primary view and keeps chat secondary

Within that architecture, every model-driven attempt should have two representations:

- a human-readable summary for fast scanning in the Team room
- a durable audit payload for drill-down, including actor, provider/model, prompt/context refs, tool-call refs, raw output refs, and produced artifacts

The important design decision is that the audit trail is not a UI-only artifact. It must be derived from durable state so that the same information can be shown after refresh, after polling, and after a later review.

### 2.1 Primary file targets

The implementation should concentrate on these areas first:

- `apps/web/client/src/pages/Teams.tsx` for the dashboard layout and panel composition
- `apps/web/client/src/components/orchestrator/*` for reusable ledger panels, step cards, and timeline views
- `apps/web/server/services/runEngine.ts` for runtime progression, review loops, and terminal-state handling
- `apps/web/server/services/workItemService.ts` for step lifecycle, revision preservation, and event emission
- `apps/web/server/services/monitoringService.ts` for runtime state, plan snapshots, and timeline-friendly read models
- `apps/web/server/routers/teamRoom.ts` for the Team-facing room/run queries
- `apps/web/server/services/*` read-model helpers if the dashboard needs a dedicated aggregation layer

## 3. Current-state assessment

The repository already has most of the execution machinery:

- `runEngine.ts` already creates plan artifacts with owners, reviewers, verification methods, retry rules, and evidence requirements
- `workItemService.ts` already models revision/version-safe work items and emits work-item events
- `monitoringService.ts` already derives runtime phase, review state, and plan snapshots
- `Teams.tsx` already knows how to load rooms, runs, and active-run state

The missing part is a canonical workflow representation on the Team surface. Right now the page can show snippets of execution, but it does not make the plan/review/rework history obvious enough to audit.

## 4. Backend changes

### 4.1 Introduce a canonical ledger shape

Define the workflow in terms of these conceptual entities:

- objective
- plan
- step
- step attempt
- review
- audit event

The implementation should reuse existing persistence where possible, but the plan should treat these as first-class concepts. If a model already exists under a different name, the code should map to it rather than duplicating a second incompatible model.

The implementation should prefer read-model composition over schema churn unless the current schema cannot represent the required history.

The ledger model should also include an issue-resolution thread between review findings and subsequent attempts so the UI can answer not just "what failed" but also "how was it fixed".

The default retained attempt payload should include:

- actor identity and role
- provider/model
- prompt template/version ref
- redacted rendered-prompt ref
- context-pack refs or stable item hashes
- tool-call refs
- raw output ref
- artifact refs
- token/cost summary

### 4.2 Expand event emission

The run engine and work-item service should emit ledger events at each meaningful transition:

- objective created
- plan created
- step assigned
- step started
- output created
- review started
- review completed
- rework requested
- rework started
- step passed
- step failed
- run paused
- run resumed
- run completed
- run stopped

The key rule is that a textual turn alone is not enough. Each event should carry a durable reference to the step, attempt, or artifact it describes.

The implementation should also ensure that every automation-originated room message is typed and linked back to the ledger event that caused it.

### 4.3 Preserve rejected attempts

When review fails, the next attempt must not overwrite the prior attempt. The plan should keep both versions visible so the user can inspect:

- the rejected result
- the reviewer feedback
- the revised result
- the next review outcome

The implementation should carry stable review-finding identifiers so later attempts can mark each finding as resolved, unresolved, waived, or superseded.

### 4.4 Make terminal reasons explicit

If a run stops before completion, the terminal state must always explain why. The plan should standardize stop reasons so the UI can display:

- blocked
- awaiting approval
- awaiting human choice
- budget or duration stop
- repeated-turn stop
- completion reached
- policy failure
- stalled repeated attempt
- stalled no gate progress

### 4.5 Keep `auto_team` running until terminal evidence exists

`auto_team` should not terminate simply because the page is noisy or because a short turn threshold was reached. The execution loop should continue while:

- the run is active
- the current step is not terminal
- policy allows continuation
- the evidence gate for completion has not been satisfied yet

It should stop only when:

- the required evidence for the objective class exists and passes review, or
- a policy-based stop reason is recorded

If the stop reason is policy-driven, the UI must state that clearly so the user can distinguish "work finished" from "work was interrupted".

This requires an explicit completion policy matrix per objective class, with clear gates for:

- minimum required evidence
- review pass threshold
- accepted exception criteria
- hard-fail criteria
- loop-limit and escalation behavior

The default policy decisions should be:

- 3 direct revisions per step before automatic re-plan
- 2 re-plan cycles per run before escalation or terminal failure
- 2 materially identical consecutive attempts triggers `stalled_repeated_attempt`
- 5 actionable attempts without completion-gate progress triggers `stalled_no_gate_progress`
- external waiting and polling states do not consume revision budget

## 5. UI redesign

### 5.1 Reframe the Team page

The Team page should be treated as an orchestration dashboard with these default panels:

- objective summary
- plan and ownership
- current execution state
- review and feedback
- audit timeline
- supporting artifacts
- optional conversation feed

The conversation feed should remain available, but it should no longer be the visual center of gravity for auto-led work.

### 5.2 Make the plan the first visible artifact

Before execution starts, the page should show:

- the task objective
- the proposed plan steps
- who owns each step
- who reviews each step
- the expected evidence for each step
- whether the task is manual or auto-led

### 5.3 Show each step as a compact work card

Every step card should communicate:

- step name and description
- owner
- reviewer
- current status
- current attempt count
- latest output
- latest review verdict
- rework count
- any blocker or waiting reason

### 5.4 Show review as a separate surface

Reviewer feedback should not be buried in message bubbles. The review panel should show:

- reviewer identity
- review time
- verdict
- comment
- requested fix
- whether the step looped back to execution
- whether the revised result passed

### 5.5 Show an audit timeline

The audit timeline should be the reconstruction tool for the user. It must list the sequence of workflow events in order and allow drill-down into the evidence behind each event.

The timeline should make it obvious when:

- the plan was created
- execution started
- review failed
- work looped back
- the revised attempt passed
- the run ended for any reason

## 6. Manual vs auto behavior

### 6.1 Shared ledger model

Manual and auto Team rooms should use the same underlying ledger structure. That keeps the audit story consistent.

The view model may differ, but the source-of-truth data should not.

### 6.2 Manual mode

Manual mode should still show the same plan/review/rework trail, but the human can intervene more directly:

- edit or approve the plan
- review outputs manually
- pause the run
- add commentary without changing the canonical event model

### 6.3 Auto mode

Auto mode should default to:

- immediate start after room creation
- hidden manual start control
- continuous execution until completion evidence exists
- visible review gates and revision loops

The conversation panel should be collapsed by default for auto rooms and open by default for manual rooms.

### 6.4 Reviewer assignment defaults

The runtime should treat reviewer assignment as policy, not a best-effort suggestion:

- self-check only for non-user-visible bookkeeping and synchronization steps
- reviewer required for any plan, draft, artifact, recommendation, or side-effect-producing step
- final deliverable review should be distinct from the producing actor whenever possible
- high-risk, critical-risk, or publishing steps require human approval after review

## 7. Data access and API shape

The implementation should expose a stable Team-oriented data view that the UI can poll or subscribe to.

The dashboard needs a response shape that can provide:

- objective data
- plan steps
- current active step
- step attempts
- review records
- terminal run reason
- artifacts and evidence refs
- timeline events
- attempt-level audit payload refs
- per-review finding resolution status
- completion gate status
- remaining blockers

If an endpoint already exists for room/run state, extend it rather than inventing multiple overlapping views.

The read model should be optimized for long-lived rooms with many attempts, which means the API should support drill-down or pagination without losing completeness.

The API should expose two layers of detail:

- default room-view detail for normal members
- elevated audit detail for authorized admins or auditors

Historical rooms should use background backfill for recent active history and lazy derivation for older rooms on first open.

## 8. Implementation order

### Phase 1: Normalize workflow data

First, make sure the backend can answer the workflow questions in structured form. This means aligning the plan artifact, work-item history, and review records around the same identifiers and statuses.

This phase should also confirm the tenant/room/run access checks for all new read paths so the dashboard only shows data the current user is allowed to inspect.

This phase should explicitly define the minimum retained payload for each attempt so the implementation does not later fall back to storing only display summaries.

### Phase 2: Emit explicit audit events

Add durable events for the step lifecycle and review lifecycle so that the history can be reconstructed after the fact.

This phase should also enforce a rule that automation messages shown in the room are projections of ledger events rather than independent free-floating text.

This phase should assign stable identifiers to review findings so later attempts can resolve them explicitly.

### Phase 3: Build the ledger UI

Rework the Team page into dashboard panels and wire those panels to the structured workflow data.

This phase should preserve a secondary conversation panel, but it should be collapsed or de-emphasized by default for auto-led rooms.

### Phase 4: Tighten auto completion

Make sure `auto_team` continues through rework and only ends when the completion gate or a policy stop condition is reached.

This phase should include explicit reload/resume behavior so a long-running room still reconstructs the exact completion state after refresh or polling gaps.

### Phase 5: Regression hardening

Add tests for the planning, review, rework, and terminal-state paths before polishing the UI.

If the current schema does not yet expose a convenient read model for step attempts and review history, add the smallest possible aggregation helper instead of introducing duplicate tables.

## 9. Risks and constraints

### Risk: duplicating state in multiple places

There is already a plan artifact, work-item state, room state, and monitoring state. The implementation must avoid creating a second competing source of truth.

### Risk: auto loops can appear endless

The new behavior should keep looping until completion, but it must still respect explicit policy stops. The plan should make the stop reason visible so users do not think the system silently failed.

### Risk: old runs may not have complete history

Historical runs may only have partial data. The UI must degrade gracefully and label missing information instead of pretending it exists.

### Risk: audit payload may leak sensitive context

If the implementation stores prompt/context and raw model payloads for every attempt, it must separate:

- what is retained durably
- what is shown by default
- what requires elevated authorization

### Risk: historical derivation may look more certain than it is

Derived ledgers for older rooms must be labeled as partial or reconstructed when source detail is missing, so users do not confuse inferred structure with fully captured workflow data.

### Risk: the page becomes too dense

The dashboard must prioritize legibility. The audit trail needs detail, but the default view should stay readable by folding advanced evidence into drill-down panels.

## 10. Definition of done

This feature is done when:

- the Team page clearly shows plan, ownership, review, rework, and completion state
- a reviewer’s feedback and the resulting revision are visible as separate events
- each model-driven attempt can be traced to actor, provider/model, prompt/context refs, and raw output refs
- `auto_team` can keep working through multiple revision loops until the task finishes or a terminal policy stop occurs
- a human can reconstruct what happened after the fact without reading the whole chat transcript
- a human can identify not only that a review failed, but exactly which finding was fixed by which later attempt
- long-running or older rooms preserve workflow completeness through reload, pagination, and derived-history labeling
- tests prove the auto-start, review loop, and terminal-state behavior
