# Feature 100: Team Orchestration Audit Trail And Auto Completion

Version: 1.0
Date: 2026-04-19
Status: Draft
Depends-on: 095-work-os-automation-fabric, 096-goal-driven-auto-team-automation, 098-auto-team-real-execution-and-media-completion, 099-context-engineering-ready-chat-and-team
Audience: Team UI, Run Engine, Review Pipeline, Work OS, Audit/Compliance, QA

---

## 1. Executive summary

The current Team surface behaves too much like a live chat room and not enough like a managed work ledger.

For manual work, people need to see:
- what the task is
- who owns each step
- who reviews each step
- what changed after review
- whether the work looped back for revision
- what result was produced after each revision
- why a step passed or failed
- why a run stopped if it did not finish

For `auto_team` work, the system must do more than "start a run". It must keep executing until the work reaches a terminal evidence state, or until a policy-based stop condition is reached with a clear reason. The UI must show this progression in a way that can be audited after the fact.

This feature redesigns the Team page around a structured work ledger and audit trail. Chat-style message streams may still exist as supporting evidence, but they are not the primary representation of work.

---

## 2. Problem statement

The current Team experience has three major gaps:

1. It does not clearly show the work plan before execution starts.
2. It does not reliably show who did what, who reviewed it, and what changed as a result.
3. It does not make auto execution legible enough for a human to verify progress, failure, or completion.

As a result:

- users cannot tell whether the team is actually working or just emitting text
- reviewers cannot easily inspect the sequence of actions and decisions
- a failed run is hard to diagnose because the missing step or failed review is not obvious
- revision loops are hidden inside chat history instead of being recorded as explicit workflow events
- `auto_team` can appear active while never reaching a final quality gate

The product needs a Team surface that acts like an operations dashboard with an audit trail, not a generic conversation transcript.

---

## 3. Product goals

The Team surface must:

- make the current objective and expected outcome obvious at all times
- expose a plan before work begins
- record execution ownership, reviewer ownership, and stage transitions
- record reviewer feedback and whether the feedback triggered rework
- make every loop between execution and review visible
- distinguish between "in progress", "blocked", "needs rework", "approved", and "done"
- show the terminal reason when work stops early
- support `auto_team` runs that continue until terminal completion evidence exists
- preserve enough history that a human can reconstruct how the output was produced

---

## 4. Non-goals

This feature does not aim to:

- remove chat entirely
- prevent humans from adding extra commentary
- replace the existing run engine from scratch
- make every task synchronous
- hide all implementation detail behind a single summary card
- bypass policy, budget, or safety controls

---

## 5. Design principles

### 5.1 Work is a ledger, not a stream

The UI must present work as a sequence of durable events and artifacts:

- objective created
- plan created
- assignee selected
- reviewer selected
- execution started
- evidence produced
- review passed or failed
- rework requested
- revised evidence produced
- final approval or terminal failure

Chat messages can support these events, but they are not the canonical truth.

### 5.2 Every result must be attributable

For each meaningful step, the system should be able to answer:

- who performed the step
- what they were responsible for
- what evidence they produced
- who reviewed it
- what the reviewer said
- whether the step was accepted
- whether the step was sent back for revision

### 5.3 Every LLM attempt must be inspectable

For each model-driven attempt, the system should be able to answer:

- which actor or persona initiated it
- which provider and model produced it
- which prompt or instruction bundle was used
- which context pack or evidence set was attached
- which tools or external calls were used
- what the raw model result was
- what summary was shown to the user
- which durable artifacts or side effects were produced

### 5.4 Auto must be explainable

An `auto_team` run is not allowed to look like a mysterious fire-and-forget process.

The UI must make visible:

- current stage
- next intended action
- current blocker
- review status
- rework count
- completion criteria
- terminal reason if the run stops
- remaining completion gates if the run has not finished

### 5.5 Rework loops are first-class

If review fails, the loop back to execution must be explicit. The ledger must preserve:

- the prior result
- reviewer feedback
- the requested fix
- the revised result
- the second review outcome

### 5.6 Review findings must map to fixes

If a reviewer reports an issue, the ledger must preserve:

- the issue id or stable review finding
- what step or artifact the issue refers to
- what change was requested
- which revision attempted to resolve it
- whether the issue was resolved, partially resolved, waived, or still open

### 5.7 Completion means evidence, not hope

A task is complete only when the required evidence for that task class exists and the final review passes or an explicit accepted exception is recorded.

---

## 6. Scope

### In scope

- redesign the Team page into a structured orchestration dashboard
- introduce a canonical work ledger view for objective, plan, owners, reviewers, and stage state
- show a timeline of execution, review, rework, and completion events
- show explicit pass/fail/blocked states per step
- show reasons for loops, retries, and terminal stops
- support `auto_team` runs that keep executing until the evidence-based completion gate is satisfied
- surface reviewer comments and change requests in a structured format
- expose a human-readable audit trail for postmortem and compliance review
- preserve a lightweight chat/event feed as supplemental evidence, not the primary UI
- ensure the UI can represent both manual and auto work without mixing their control patterns
- preserve full ledger detail even when the room message history becomes very long

### Out of scope

- reworking unrelated product surfaces
- changing the core language model providers
- replacing all historical data migrations in one release
- making every historical run retroactively structured if the data does not exist

---

## 7. Required user experience

### 7.1 Team top-level layout

The Team page must clearly separate these regions:

- objective and run summary
- canonical work plan
- execution stage view
- review and feedback view
- audit timeline
- supporting messages and artifacts

The layout must not force the user to infer the workflow from an undifferentiated chat feed.

### 7.2 Plan-first presentation

Before a run starts, the user must see:

- the objective
- the proposed plan
- the expected owner for each step
- the expected reviewer for each step
- the success criteria for each step
- whether the task is manual or auto-led

### 7.3 Step card requirements

Each step card must show:

- step title
- step description
- owner
- reviewer
- current status
- last result
- last review result
- rework count
- blocking reason if any
- links to artifacts or evidence

### 7.4 Review feedback requirements

Each review record must show:

- reviewer identity
- review timestamp
- verdict
- reviewer comments
- requested changes
- whether the work looped back
- whether the next version passed

### 7.5 Audit timeline requirements

The timeline must let the user reconstruct the sequence:

1. objective submitted
2. plan created
3. work assigned
4. result produced
5. review performed
6. feedback recorded
7. rework executed if needed
8. final result accepted or rejected

Every timeline item should be inspectable and should link to the underlying evidence where available.

---

## 8. Functional requirements

### 8.1 Planning

- The system must create a visible plan before work execution begins.
- The plan must contain one or more steps.
- Every step must have an intended owner and reviewer when the task type supports them.
- If a plan cannot be formed automatically, the system must clearly state why and whether human input is required.

### 8.2 Execution

- The system must track the active step and current stage.
- The system must persist the action that was taken, not just the message that described it.
- The system must link outputs to the current step and run.
- The system must show whether the output is provisional, reviewed, accepted, or rejected.

### 8.3 Review

- The system must capture review verdicts as structured data.
- The system must record what the reviewer asked to change.
- The system must show whether the reviewer approved immediately or requested revision.
- The system must support multiple review rounds per step.

### 8.4 Rework loop

- If review fails, the next execution turn must clearly be a rework turn.
- The UI must show the prior failure reason and the intended fix.
- The system must retain the prior rejected result and the new result side by side in the history.

### 8.5 Auto completion

- `auto_team` must keep advancing through plan steps until the run reaches a terminal state.
- The run must not stop simply because a chat-like turn limit was reached if completion evidence is still missing and policy allows continuation.
- If the run stops for a policy reason, the system must record a terminal stop reason that a human can inspect.

### 8.6 Traceability

- Each step event must record who or what actor produced it.
- Each result must record what changed from the prior version.
- Each review must record what evidence was inspected.
- Each final completion event must include the evidence used to conclude success.

### 8.7 Attempt-level audit payload

- Every step attempt must persist a durable audit payload, not just a rendered summary.
- The payload must capture actor identity, provider/model, prompt or instruction references, context/evidence references, tool-call references, and raw output references.
- The system may redact or separately store sensitive fields, but it must preserve enough information for authorized audit and diagnosis.
- The UI must expose a drill-down path from the human-readable summary to the underlying attempt payload for authorized users.

### 8.8 Room transcript completeness

- Every material room message or timeline entry must be linked to a ledger entity such as a step, attempt, review, or terminal event.
- The room must distinguish between user-facing summaries, system milestones, raw evidence, and reviewer decisions.
- The Team room must not contain untyped automation messages that cannot be traced back to the workflow state.

### 8.9 Long-history behavior

- The Team room must preserve workflow completeness even when message history is very long.
- Summaries, compaction, or pagination must not delete the ability to inspect prior attempts, prior reviews, or prior stop reasons.
- If old detail is paginated or collapsed, the UI must make it clear that the detail still exists and can be opened.

---

## 9. Canonical data model

The implementation should model the workflow with explicit entities.

### 9.1 Work objective

Fields:
- objective id
- room id
- run id
- source
- title
- description
- type
- created by
- created at
- current status

### 9.2 Work plan

Fields:
- plan id
- objective id
- version
- step list
- generated by
- generated at
- plan confidence
- approval state

### 9.3 Work step

Fields:
- step id
- plan id
- order index
- title
- description
- owner
- reviewer
- expected evidence
- status
- current attempt count
- current review round

### 9.4 Step attempt

Fields:
- attempt id
- step id
- attempt index
- actor
- actor type
- actor id
- actor display label
- provider
- model
- prompt ref
- prompt version
- context pack ref
- tool call refs
- inputs used
- raw input refs
- raw output ref
- output summary
- output artifact refs
- started at
- ended at
- status
- token or cost summary

### 9.5 Review record

Fields:
- review id
- step id
- attempt id
- reviewer
- verdict
- comments
- change requests
- evidence inspected
- created at
- finding list
- resolution state
- resolved by attempt id optional

### 9.6 Audit event

Fields:
- event id
- run id
- step id optional
- event type
- actor
- payload
- evidence refs
- created at
- linked attempt id optional
- linked review id optional
- display class

Required event types include:
- objective_created
- plan_created
- step_assigned
- step_started
- output_created
- review_started
- review_completed
- rework_requested
- rework_started
- step_passed
- step_failed
- run_paused
- run_resumed
- run_completed
- run_stopped

---

## 10. Auto-team lifecycle

The `auto_team` lifecycle must be explicit.

### 10.1 Start

When an `auto_team` room is created, the system must:

- create or load the objective
- generate or load the plan
- assign step ownership and review ownership
- start execution without requiring the user to click a second start button

### 10.2 Execute

The system must:

- work on the current step
- attach evidence to the step
- update the step status
- emit an audit event

### 10.3 Review

The system must:

- run the reviewer gate for the produced output
- record the verdict and feedback
- decide whether the work is accepted or needs rework

### 10.4 Rework

If the reviewer rejects the output, the system must:

- generate a revision intent from the feedback
- execute a new attempt
- preserve the rejected artifact
- record the revised artifact
- review again

### 10.5 Finish

The system must end only when:

- all required steps have passed review, or
- a policy exception / hard stop is triggered and recorded

The user must be able to tell which of those happened.

The terminal state must also explain:

- which completion gates were satisfied
- which completion gates were not satisfied
- whether the stop was success, accepted exception, or failure

---

## 11. Manual team lifecycle

Manual Team work should use the same ledger model, but with human-driven execution.

Manual-specific behavior:

- users may edit or approve the plan before execution
- execution may pause for human action
- reviewers may be human or model-assisted depending on policy
- the UI still records explicit steps, results, reviews, and rework

Manual work must not collapse into an unstructured chat transcript.

---

## 12. UI requirements

### 12.1 Primary panels

The new Team page should have these conceptual panels:

- overview panel
- plan panel
- current step panel
- review panel
- timeline panel
- artifacts panel
- optional conversation panel

### 12.2 Default emphasis

The default emphasis must be:

1. objective and run state
2. plan and step ownership
3. current execution evidence
4. review outcome and feedback
5. audit timeline

Conversation should be secondary unless the user explicitly opens it.

### 12.3 Visual clarity requirements

The UI must make status differences obvious:

- in progress
- awaiting review
- needs rework
- blocked
- passed
- completed
- stopped

### 12.4 Trace detail requirements

Every audit item must support drill-down to:

- raw result
- provider/model and prompt metadata
- context or evidence inputs used
- tool calls or external actions taken
- reviewer feedback
- related step
- related attempt
- linked artifact or evidence

---

## 13. Completion criteria

A run can be considered complete only if the UI and backend can prove:

- the objective was understood
- a plan existed
- each required step had an owner and reviewer or a documented exception
- each produced result was reviewed
- each failed review either triggered rework or was explicitly accepted as-is
- the final output meets the step or objective criteria
- the final terminal status is recorded

If any of these are missing, the system must show why completion is not valid.

The implementation must define a completion policy matrix per objective class so the engine can decide whether a run is:

- still executing
- awaiting review
- awaiting rework
- completed successfully
- completed with accepted exception
- terminally failed

---

## 14. Failure modes

The system must explicitly represent these failure modes:

- no plan could be generated
- no owner could be assigned
- no reviewer could be assigned
- result produced but no evidence attached
- review failed and rework was not triggered
- rework loop exceeded policy limits
- auto execution stopped due to budget, safety, or max-round policy
- objective could not meet completion criteria

Each failure mode must be visible in the timeline and summary.

---

## 15. Acceptance criteria

The feature is accepted when all of the following are true:

- A Team room shows objective, plan, ownership, review status, and timeline without requiring the user to infer them from chat.
- A reviewer comment and a rework loop are visible as separate auditable events.
- A failed review can be followed to the revised attempt and the next review result.
- `auto_team` runs continue through review and rework until the work is complete or an explicit stop reason is reached.
- A stopped run explains why it stopped and what evidence is missing, if any.
- A human can reconstruct who did what, what changed, and why the output passed or failed.
- Manual and auto Team modes share the same audit model but present different controls.

---

## 16. QA and testing expectations

Tests should prove:

- plan generation renders a structured plan
- step ownership and reviewer ownership render correctly
- review rejection creates a visible rework loop
- accepted output preserves the prior rejected attempt in history
- auto runs continue after a failed review when policy allows it
- auto runs stop with a clear reason when completion is impossible
- timeline entries reflect the correct order of events
- the conversation panel is secondary to the ledger panels
- authorized users can inspect attempt-level model metadata and raw result references
- long histories still preserve earlier attempts, reviews, and stop reasons after refresh/reload

Recommended test coverage:

- unit tests for audit event modeling
- service tests for run progression and review loop transitions
- component tests for step cards, review cards, and timeline items
- regression tests for `auto_team` start and completion behavior
- regression tests for multi-round review loops and reload/resume behavior

## 16.1 Security and retention expectations

- Detailed audit payloads must follow room/run authorization, not tenant-wide visibility alone.
- Sensitive prompt/context payloads may be redacted in the default UI, but authorized drill-down must remain possible.
- Retention and redaction rules for raw model inputs/outputs must be defined before implementation is considered complete.

---

## 17. Migration considerations

Historical runs may not have full structured data. The UI must handle:

- partial ledgers
- missing reviewer fields
- missing plan-step ownership
- older chat-only runs
- runs that started before this feature existed

The system should gracefully degrade and explicitly label missing data rather than pretending the record is complete.

---

## 18. Recommended implementation approach

The best implementation path is:

1. introduce a canonical ledger model for plan, step, attempt, review, and audit event
2. surface the ledger in the Team page as the primary UI
3. adapt the existing run engine to emit the required structured events
4. treat chat messages as supporting evidence linked to ledger events
5. make `auto_team` continue through review/rework loops until evidence-based completion
6. add tests for the full lifecycle before expanding any UI polish

---

## 19. Resolved policy decisions

### 19.1 Reviewer versus self-check policy

The system should use this default rule set:

- self-check is allowed only for non-user-visible bookkeeping steps such as status refresh, poll updates, connector heartbeat handling, and read-only synchronization
- a reviewer is required for every step that produces or modifies a user-visible result, artifact, plan, recommendation, draft, or external side effect
- plan creation and re-plan steps require reviewer validation before execution can proceed
- every final deliverable step requires a reviewer that is distinct from the producing actor whenever a distinct reviewer is available
- high-risk, critical-risk, and external publishing steps require human approval after the reviewer gate
- if the workflow cannot assign a distinct reviewer for a step that requires one, the run must pause with a diagnosable staffing reason

### 19.2 Auto-team loop policy

The system should not use a generic chat-style round cap as the primary termination rule for progressing work.

Instead, the default loop policy should be:

- up to 3 direct revision attempts per step before automatic re-plan
- up to 2 re-plan cycles per run before terminal failure or human escalation
- if 2 consecutive attempts are materially identical, mark the run as `stalled_repeated_attempt`
- if 5 actionable attempts occur without advancing any completion gate, mark the run as `stalled_no_gate_progress`
- waiting for an external job, polling a provider, or awaiting human approval does not consume revision budget
- budget and duration policy still apply, but the terminal state must explicitly show which completion gates remain unsatisfied

### 19.3 Review-trail visibility policy

The default visibility model should be:

- end users and normal room members see step summaries, ownership, reviewer identity, verdicts, reviewer comments, requested fixes, issue status, artifacts, completion gates, and terminal reasons
- workspace admins and authorized auditors also see attempt-level model/provider metadata, prompt refs, context refs, tool-call refs, token or cost summaries, and raw output refs
- sensitive prompt/context payloads must be redacted in the default UI
- raw payload drill-down must respect room/run authorization, not tenant scope alone

### 19.4 Conversation panel default

The conversation panel should be:

- collapsed by default for `auto_team` rooms
- open by default for manual or guided team rooms
- always available as a secondary panel, never the primary source of workflow truth

### 19.5 Historical backfill strategy

The system should not perform a one-shot backfill across all historical runs before rollout.

Instead:

- active rooms and runs from the last 90 days should receive background derived-ledger backfill
- older rooms should use lazy derivation on first open and may cache the derived ledger afterward
- historical runs that still lack enough data after derivation must be labeled partial rather than silently filled with guessed structure

### 19.6 Inline versus drill-down fields

Inline attempt cards should show:

- actor
- provider/model badge
- timestamp
- short output summary
- status
- artifact count
- review verdict
- open issue count
- completion-gate delta

Drill-down views should show:

- prompt template/version refs
- rendered prompt ref
- context pack refs
- tool-call refs
- raw output refs
- token/cost summary
- detailed issue-resolution mapping

### 19.7 Minimum retained audit payload

For each model-driven attempt, the minimum retained audit payload should include:

- actor identity and role
- provider and model
- prompt template id/version
- rendered prompt stored after secret redaction
- structured context pack refs plus stable item ids or hashes
- tool-call refs and side-effect refs
- raw output ref
- artifact refs
- token/cost summary

Retention policy should be:

- detailed redacted attempt payload retained for 365 days
- durable summaries, issue history, artifact refs, and terminal outcomes retained with room history
- unredacted secrets must not be stored in the audit payload
