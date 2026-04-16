# Combined Specification - Feature 096 Goal-Driven Auto Team Automation

Date: 2026-04-15
Mode: self_review
Source files:

- `spec.md`
- `claude-research.md`
- `claude-interview.md`

## 1. Product Objective

Make `auto_team` behave like a real automation engine rather than a short-turn assistant loop.

The workflow must continue until the objective is complete, while still respecting hard safety and policy limits. The default posture is automation-first: the system, AI, LLMs, and agents should do the work, review the work, repair the work, and continue the workflow unless a genuine human approval boundary is reached.

## 2. Core Outcome

The system should:

- keep moving toward completion without relying on a small fixed number of turns
- pause only when waiting on a true external async result or a human approval boundary
- verify each step before advancing
- write durable evidence that the step completed
- use a persona-appropriate reviewer before accepting the step as done
- retry and repair failed steps automatically whenever safe
- escalate to a human only for explicitly safety-critical, irreversible, or policy-gated cases

## 3. Current State and Codebase Findings

### 3.1 Existing `auto_team` behavior

The current run engine is still turn-driven:

- `startRun()` queues an initial burst of auto advances for `auto_team`
- `resumeRun()` re-queues one turn after a paused run resumes
- `advanceRun()` runs up to a capped number of turns and then re-evaluates continuation
- the current loop decision still hinges on assistant-actionable work items versus human/external blocking

This means the current behavior is not yet goal-driven enough for true automation.

### 3.2 Existing status model is coarse

The durable `team_runs.status` enum currently supports only:

- `queued`
- `running`
- `paused`
- `completed`
- `failed`
- `stopped`

The desired runtime states such as `waiting_for_worker`, `waiting_for_poll`, and `awaiting_human_approval` are not yet durable DB states. The implementation plan must decide whether to:

- extend the durable enum, or
- keep the DB status coarse and add a richer runtime overlay for waiting states

### 3.3 Existing async patterns already exist

The codebase already has useful precedents for async execution:

- Python skill tasks return a `taskId` and persist a `running` / `done` Redis record
- media generation already uses job dispatch plus polling safety nets
- worker callbacks can resolve job events back to `teamRuns` and `teamRooms`

This gives the plan concrete patterns for job handles, polling, and completion detection.

### 3.4 Existing evidence patterns already exist

Adjacent automation flows already create durable artifact records and write back metadata such as:

- `runId`
- `stepKey`
- `adapterKind`
- task IDs
- success / credits / result type

This is a strong precedent for requiring durable evidence before a step can advance.

### 3.5 Existing tests are suitable for TDD

The repo already uses Vitest for service-level tests, including `runEngine` and adjacent automation services.

Relevant existing test coverage includes:

- auto-team loop continuation decision helpers
- human approval pause behavior
- external connector pause behavior
- stop policy evaluation
- async execution and artifact-writeback patterns in adjacent services

## 4. Functional Requirements

### 4.1 Automation-First Default

All steps should be executed by the system, AI, LLM, or agents by default.

The system should prefer:

- autonomous execution
- autonomous review by an appropriate persona
- autonomous repair and re-verification
- autonomous continuation to the next step

Human involvement should be the exception, not the default route.

### 4.2 Human Boundary

Human approval is required only for:

- destructive operations
- policy-sensitive actions
- external side effects explicitly gated by policy
- cases where the workflow cannot determine a safe next step after automated repair attempts

Human approval is not required for:

- ordinary skill execution
- swarm execution
- image generation jobs
- video generation jobs
- routine polling of async tasks
- deterministic workflow continuation

### 4.3 Escalation Policy

Escalate to a human immediately only when the issue is safety-critical, irreversible, or explicitly policy-gated.

Escalate immediately for:

- destructive operations that cannot be safely rolled back
- policy violations that must not be auto-resolved
- legal, compliance, or security-sensitive decisions with high impact
- requests to reveal, export, or modify protected data without clear authorization
- external side effects that would cause real-world harm if done incorrectly
- cases where the system cannot establish a trustworthy next step after automated repair attempts

Keep in automation first for:

- failed or low-quality skill outputs that can be corrected by re-run or prompt repair
- incomplete agent or swarm results that can be re-reviewed and repaired automatically
- image or video outputs that are off-spec but can be regenerated
- code or configuration changes that fail tests but can be fixed by the system
- workflow states that are ambiguous but still safely inspectable by automated reviewers
- temporary provider or worker failures that can be retried under policy

### 4.4 Risk Classes

Every step or dependency should be assigned a risk class that drives the default action:

- `low`
- `medium`
- `high`
- `critical`

Default behavior:

- `low`: stay in automation, repair/regenerate, re-verify
- `medium`: stay in automation, use stronger validation, ask a reviewer to inspect
- `high`: run automated checks first, then block or escalate according to policy
- `critical`: stop automation at the boundary and require human approval

### 4.5 Risk-to-Reviewer Mapping

Default reviewer mapping:

- `low` -> technical reviewer or domain persona
- `medium` -> technical reviewer plus QA/validator
- `high` -> safety or policy persona
- `critical` -> human approval with safety/policy oversight

The runtime may add additional reviewers for cross-domain steps, but it should start from this mapping.

### 4.6 Step Verification Policy

Every step must have:

- a defined verification method
- durable evidence that it succeeded
- a persona-appropriate reviewer before completion is accepted

Required verification types may include:

- durable writeback of state or artifact data
- test execution with a pass/fail result
- deterministic validation against a schema, contract, or rule set
- comparison against an accepted reference or rubric
- human approval only when policy-gated or inherently subjective

The system must not treat an unverified model assertion as completion.

### 4.7 Persona-Based Review

The reviewer must match the type of work being evaluated.

Expected reviewer roles:

- planner/coordinator for workflow alignment
- technical reviewer for implementation correctness
- QA/validator for tests and contract checks
- domain persona for subject-matter quality
- safety/policy persona for high-risk actions

The system must not rely on a single execution pass with no reviewer.

### 4.8 Work OS Synchronization

The automation layer must stay consistent with the existing Work OS model.

The Work OS case or request projection is the business-facing mirror of the work, while the team run snapshot is the execution-facing mirror. They must stay aligned so operators never see contradictory state.

Required rules:

- every meaningful team-run transition must be reflected back into Work OS as a matching case, task, or event update
- Work OS should expose the authoritative business status that operators use for intake, ownership, exception, and outcome tracking
- team-run runtime overlays should project into Work OS instead of inventing a conflicting parallel lifecycle
- if a state cannot be mapped cleanly, the system must record an exception or blocked state rather than silently diverging
- status labels shown in Teams, Work OS Console, and monitoring surfaces must describe the same underlying progression with consistent wording
- any automated repair or re-run must preserve the same case identity and history rather than creating a conflicting duplicate case unless the user explicitly requested a new case

If the work originates in Work OS, the plan must be derived from the Work OS case or request objective and preserve the same case identity. The plan may decompose that objective, but it must not invent a disconnected parallel job without a linked Work OS record.

The implementation must use a deterministic mapping between execution state and Work OS state:

| Team run / runtime state | Work OS state | Meaning |
|---|---|---|
| `queued` / planning | `planned` or `triaged` | The work has been accepted, interpreted, or queued for decomposition |
| `running` | `in_progress` | The team is actively executing the next step |
| `waiting_for_worker` | `in_progress` | The team has delegated work and is waiting on an external job result |
| `waiting_for_poll` | `in_progress` | The team is scheduled to check the delegated work again |
| `awaiting_human_approval` | `waiting_for_approval` | Progress is blocked until a human approves or rejects the gated step |
| `blocked` | `blocked` or `escalated` | The workflow cannot safely continue without policy resolution or repair |
| `completed` | `completed` | The work reached a terminal successful outcome |
| `failed` | `failed` | The work reached an unrecoverable failure outcome |
| `stopped` due to user action | `cancelled` | The run was intentionally halted by a user or operator |
| `stopped` due to policy / unresolved dependency | `blocked` or `escalated` | The run cannot continue and needs resolution rather than cancellation |

If a state does not fit the matrix cleanly, the system must prefer `blocked` plus an exception record over silent divergence.

### 4.9 Exploration and comparison policy

For ambiguous, high-impact, or naturally multi-solution work, the system should explore multiple candidate approaches before selecting an execution plan.

The system should:

- generate at least two candidate approaches when feasible
- compare them on speed, safety, determinism, evidence quality, parallelizability, and cost
- write the comparison result durably so Teams can inspect why one path was chosen
- escalate to a human if the comparison shows multiple materially different safe options and the system cannot justify one path

Exploration should be bounded and skipped when the task is trivial, deterministic, or time-critical.

### Review Protocol by Work Type

#### Skill execution

Review:

- terminal success state
- objective alignment
- output / log / payload presence
- usability for the next step

#### Agency swarm execution

Review:

- converged or terminal state
- coherence across contributors
- evidence of collaboration and completion
- fit for the next workflow step

#### Image / video generation

Review:

- job completed successfully
- asset exists and is accessible
- asset matches prompt / format / policy
- asset is suitable for downstream use

#### Code / configuration changes

Review:

- tests pass
- diff matches the intended behavior
- adjacent paths are not regressed
- the change is written back to code/config/docs as expected

#### Policy-sensitive or high-risk steps

Review:

- allowed under tenant/user policy
- enough evidence to proceed safely
- irreversible side effects explicitly approved
- required gate not bypassed

#### Final completion

Review:

- required artifacts complete
- objective satisfied
- outstanding work items closed or intentionally deferred
- final evidence written durably
- no unresolved dependency blocks completion

### 4.9 Retry and Repair Loop

If a step fails verification:

- record the failure reason
- attempt corrective action when feasible
- rerun verification after correction
- continue looping until the step passes or a policy limit is reached

The workflow may only move to the next step after the failed step has been repaired and re-verified successfully.

### 4.10 Async Waiting and Polling

When the system sends work to an external runtime or worker with its own completion lifecycle, the run should enter a waiting state rather than pausing as if a human were blocked.

Examples:

- skill execution that returns a job handle and finishes later
- agency swarm execution that must report back when done
- image generation requests
- video generation requests

Required behavior:

- store a durable job reference
- poll status periodically
- resume workflow automatically when the job completes

### 4.11 Goal-Driven Continuation

`auto_team` must continue if the workflow still has actionable progress to make.

The engine should ask on every evaluation:

- Is the objective complete?
- Is there a next step the system can do by itself?
- Is the current work merely waiting for an async result?
- Is a human decision actually required?
- Is the run repeating without meaningful progress?

The loop should continue while the objective remains incomplete and the system can keep moving safely.

### 4.12 Loop and Anomaly Guards

The system must still detect and stop on:

- repeated identical actions without progress
- cycles that do not move the objective forward
- worker jobs that remain stuck beyond policy limits
- invalid or contradictory workflow states
- tenant, budget, duration, or user policy violations

### 4.13 Planning and Decomposition Policy

Every incoming topic, objective, or spec must be planned before execution starts unless the task is trivially small and policy explicitly allows a direct pass.

The system must write a durable plan artifact that captures:

- interpreted objective
- subtasks
- persona ownership for each subtask
- reviewer persona for each subtask
- verification method for each subtask
- retry / repair loop rule for each subtask
- evidence artifact expected from each subtask

The planner may ask an LLM or agent to help split the work, but the output must explicitly identify:

- which persona owns each subtask
- which persona reviews each subtask
- what each persona is qualified to do
- how many review passes or repair loops are allowed before escalation

Any work that can safely be separated by persona, dependency, or surface should be split before execution. Planning is complete only when the plan itself has been reviewed and written down durably.

### 4.14 Teams UI plan visibility

The Teams UI must show the current plan continuously so operators can inspect:

- the goal or topic
- the breakdown into subtasks
- the owner for each subtask
- the reviewer for each subtask
- the status of each subtask
- the evidence already written
- the verification criteria that still need to pass

The plan view must stay durable and refreshable throughout execution.

The UI should make it obvious whether the team is:

- still planning
- executing a planned step
- waiting on review
- waiting on a worker result
- blocked by policy
- ready to move to the next step

## 5. Runtime / Data Model Implications

### 5.1 Status model

The current durable `team_run_status` enum is too coarse for the new runtime states.

The plan must decide whether to:

- extend the DB enum, or
- keep the DB status coarse and add a runtime overlay for richer waiting states

### 5.2 Evidence model

The implementation should reuse existing durable artifact/evidence patterns where possible, including:

- run snapshots
- agent run summaries
- artifact/library records
- work item durable fields

### 5.3 Work-item model

`team_work_items` already includes fields that can support the new policy:

- status
- risk class
- approval state
- reviewer / approver member IDs
- worker job IDs and job state/output/error fields

This likely reduces the need for brand-new tables in the first implementation slice.

## 6. Acceptance Criteria

- `auto_team` continues without relying on a small fixed number of turns as the primary stopping mechanism
- the system keeps work inside automation unless human approval is truly required
- every step has a verification method and durable evidence
- every step has a persona-appropriate reviewer before completion is accepted
- each major work type has a defined review protocol
- each step is assigned a risk class that drives the default action
- low and medium risk work remain automation-first
- high and critical risk work are gated by safety policy and human approval where required
- the system escalates immediately only for explicitly safety-critical or policy-gated cases
- failed verification causes the system to loop through repair and re-check before advancing
- the system does not advance without a passing quality gate
- the system does not trust a single pass without review
- every incoming task is split into a documented plan before execution when the task is not trivially small
- the plan records persona ownership, reviewer ownership, verification method, and repair loop rules
- work that can be safely split is split before execution instead of being sent as one large prompt
- the Teams UI shows the plan continuously with steps, owners, reviewers, status, and evidence
- the plan view is durable and refreshable throughout execution
- Work OS and team-run state stay synchronized and never present contradictory status for the same case or request
- Work OS-originated work keeps the same case identity and history throughout planning, execution, repair, and completion

## 7. Out of Scope

- Rewriting the entire orchestration engine from scratch
- Removing all stop policies
- Adding manual user confirmation for ordinary work
- Replacing all existing async patterns everywhere in the product at once

## 8. Implementation Guidance

The plan should focus on:

- evolving `runEngine` into a goal-driven controller
- deciding how rich runtime states map to durable DB status
- reusing existing async job / polling patterns
- using existing artifact/evidence writeback patterns
- extending tests first for the new policy and state transitions

The plan should preserve compatibility with existing runs and existing team workflows wherever possible.
