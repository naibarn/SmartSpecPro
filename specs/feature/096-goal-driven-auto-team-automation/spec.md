# Feature 096 - Goal-Driven Auto Team Automation

## 1. Problem Statement

The current `auto_team` execution behavior is still too turn-based and conservative for real automation workloads. It can continue automatically for a few turns, but it still stops or pauses too early in cases where the system should keep progressing toward the final objective.

For automation to be useful in practice, `auto_team` must behave like a real autonomous workflow runner:

- keep working until the goal is actually complete
- wait only for genuine asynchronous work that must finish externally
- pause only when a human decision is truly required
- stop only when policy constraints, failure conditions, or anomaly guards apply

The product goal is to make `auto_team` "auto for real" while remaining safe, observable, and policy-controlled.

## 2. Product Goal

`auto_team` should drive a run toward the final objective without relying on a fixed number of turns as the primary stopping condition.

The system should:

- continue to the next actionable step whenever the current step is complete
- poll for completion when work has been delegated to an async worker
- resume immediately when the delegated work is finished
- avoid infinite loops by using progress-based safety checks instead of arbitrary short turn limits
- require human confirmation only for high-risk or policy-sensitive decisions

## 3. Current Behavior Gap

The present behavior is not fully goal-driven:

- it can queue a small initial burst of auto-advances
- it may pause when work items are assigned to human or external members
- it still treats loop continuation as a turn-management problem
- it does not yet have a strong concept of "waiting for a job result" versus "waiting for a person"

This feature closes that gap.

## 4. Scope

### In Scope

- Make `auto_team` continue until the objective is reached, subject to policy and safety guardrails
- Add explicit runtime states for asynchronous waiting and polling
- Distinguish human approval from async worker completion
- Support periodic polling for external results such as:
  - skills execution
  - agency swarm execution
  - image generation jobs
  - video generation jobs
- Continue workflow immediately after an async job completes
- Detect lack of progress and repeated loops
- Surface the current run state clearly in UI and status surfaces
- Keep the existing policy controls, but make them a safety boundary rather than the main stopping mechanism

### Out of Scope

- Rewriting the entire orchestration engine from scratch
- Removing all stop policies
- Changing unrelated non-auto team execution modes unless needed for shared runtime contracts
- Building a new agent framework
- Adding manual user confirmation for every step

## 5. Core Behavioral Rules

### 5.1 Goal-Driven Continuation

`auto_team` must continue if the workflow still has actionable progress to make.

The engine should ask, on each evaluation:

- Is the objective complete?
- Is there a next step the system can do by itself?
- Is the current work merely waiting for an async result?
- Is a human decision actually required?
- Is the run repeating without meaningful progress?

If the objective is not complete and the system can keep moving, it should keep moving.

### 5.2 Async Work Is Not Human Blocking

When the system sends work to an external runtime or worker that has its own completion lifecycle, the run must enter a waiting state instead of pausing as if a human were blocked.

Examples:

- skill execution that returns a job handle and finishes later
- agency swarm execution that must report back when done
- image generation requests
- video generation requests

For these cases, the orchestration layer must:

- store a durable job reference
- poll status periodically
- resume the workflow automatically when the job completes

### 5.3 Human Approval Is Limited

Human approval should be required only when the system reaches a high-risk decision that cannot be safely inferred or auto-resolved.

Examples of human-gated cases:

- destructive actions
- irreversible side effects
- explicit policy restrictions
- ambiguous situations where the model cannot safely choose a path

Human approval must not be used as a generic fallback for ordinary async waiting.

### 5.4 Safety Against Infinite Loops

Removing turn-based stopping does not mean removing safety.

The system must still detect and stop on:

- repeated identical actions without progress
- cycles that do not move the objective forward
- worker jobs that remain stuck beyond policy limits
- invalid or contradictory workflow states
- tenant, budget, duration, or user policy violations

The anti-loop system should be based on progress signals, not a fixed short turn count.

## 6. Runtime State Model

The run engine should support a richer state model than plain `running` / `paused`.

Recommended states:

- `running`
- `waiting_for_worker`
- `waiting_for_poll`
- `awaiting_human_approval`
- `blocked`
- `completed`
- `failed`

### 6.1 State Semantics

- `running`: the engine can perform the next step immediately
- `waiting_for_worker`: the engine has dispatched external work and is awaiting completion
- `waiting_for_poll`: the engine is scheduled to poll again shortly
- `awaiting_human_approval`: the workflow cannot continue until a human acts
- `blocked`: the workflow cannot continue because of policy, failure, or unresolved dependency
- `completed`: the objective has been achieved
- `failed`: the run cannot continue because of an unrecoverable error

### 6.2 Pause vs Wait

`paused` should remain reserved for explicit hold conditions such as:

- user pause
- administrator pause
- policy pause

It should not be used as the generic state for async waiting if the system can continue automatically after polling.

## 7. Polling and Completion Detection

### 7.1 Worker Job Tracking

Any delegated async work must store enough metadata to allow safe completion checks.

Required metadata should include:

- job id or task id
- provider or worker type
- current job status
- last checked time
- next poll time
- terminal error message when applicable
- link back to the originating run and work item

### 7.2 Polling Rules

The engine must poll async jobs periodically until one of the following happens:

- the job succeeds
- the job fails terminally
- the job exceeds its own timeout or policy budget
- the workflow no longer needs the result

Polling should be idempotent and safe to repeat.

### 7.3 Resume Behavior

When a job completes:

- the engine should load the latest result
- update the work item or artifact state
- continue with the next step in the workflow immediately

If a job fails:

- the engine should decide whether to retry, replan, or block
- failure should not silently look like completion

## 8. Progress and Loop Guards

The system must include safety checks that detect abnormal repeated behavior.

Recommended guard signals:

- repeated identical prompt or action sequence
- unchanged work item state across multiple polls
- repeated dispatch to the same worker without new evidence
- repeated completion of the same branch without advancing the goal
- no new artifacts, state changes, or decisions after several cycles

When a guard triggers, the engine should:

- log the anomaly
- preserve run context for debugging
- move the run to `blocked` or `failed` depending on severity
- surface the reason clearly in UI and telemetry

## 9. Planning and Decomposition Policy

Every incoming topic, objective, or spec must be planned before execution starts.

The system must not hand the whole task as one undifferentiated block to a single LLM pass unless the task is trivially small and the policy still permits it.

### 9.1 Required planning evidence

Before execution begins, the automation must write a durable plan artifact that includes:

- the interpreted objective
- the proposed subtask breakdown
- the persona assignment for each subtask
- the reviewer persona for each subtask
- the verification method for each subtask
- the retry / repair rule for each subtask
- the expected evidence artifact for each subtask

If the work originates in Work OS, the plan must be derived from the Work OS case or request objective and preserve the same case identity. The plan may decompose that objective, but it must not invent a disconnected parallel job without a linked Work OS record.

### 9.2 Persona-aware decomposition

The planner may use the spec plus team context to ask an LLM or agent to help split the work, but the output must explicitly identify:

- which persona owns each subtask
- which persona reviews each subtask
- what each persona is qualified to do
- how many review passes or repair loops are allowed before escalation

### 9.3 Parallelization rule

Any work that can safely be separated by persona, dependency, or surface should be split before execution.

The planning system should prefer:

- independent subtasks over one large prompt
- parallel persona work where dependencies allow it
- explicit reviewer separation from the worker persona

### 9.4 Planning loop

If the first decomposition is too coarse, missing evidence, or unclear about reviewer responsibility, the system must loop and refine the plan before starting execution.

Planning is complete only when the plan itself has been reviewed, repaired if necessary, and written down durably.

## 10. Exploration and Comparison Policy

Not every task should go straight from plan to execution with only one path.
For objectives that are ambiguous, high-impact, or naturally multi-solution, the system should explore multiple candidate approaches before it commits to a single execution plan.

### 10.1 When exploration is required

Exploration should happen when one or more of the following are true:

- the objective can reasonably be solved in multiple ways
- the team is uncertain which persona or surface is best for the first move
- the task is large enough that the first plan may hide a better branch
- the risk class is medium or higher and the choice of approach affects downstream cost, speed, or safety
- the user asks for options, alternatives, comparison, brainstorming, or recommendation

Exploration may be skipped when:

- the task is trivially small
- the path is deterministic and policy-approved
- the workflow must proceed immediately for safety or time-sensitive reasons

### 10.2 Exploration output

When exploration runs, the system should generate at least 2 candidate approaches when feasible.
Each candidate should capture:

- the proposed route or strategy
- the personas involved
- the expected strengths
- the tradeoffs
- the risk profile
- the evidence or validation that would distinguish success

The system should then compare the candidates and select one execution plan, or explicitly state why no candidate is safe enough to continue.

### 10.3 Exploration budget

Exploration must be bounded.
The system should use a limited exploration budget so that brainstorming does not replace execution.

Recommended guardrails:

- cap the number of candidate plans generated
- cap the number of comparison loops
- stop exploring once the selected plan is clearly better than the alternatives
- do not keep exploring after the evidence is sufficient to choose

### 10.4 Candidate comparison

Candidate plans should be compared on criteria such as:

- speed
- safety
- determinism
- evidence quality
- ability to parallelize
- cost
- fit to Work OS identity and case continuity

The comparison result should be written durably so Teams can inspect why one path was chosen over another.

### 10.5 Relationship to execution

Exploration is a pre-execution phase, not a replacement for planning or verification.

The sequence should be:

1. explore candidate approaches when needed
2. select a preferred candidate
3. write the durable plan artifact
4. review and repair the plan
5. execute with goal-driven continuation

If exploration reveals that a human must choose between materially different safe options, the system should escalate with a clear comparison instead of silently guessing.

The reviewed plan must show:

- the plan review status
- the number of review / repair loops performed
- the remaining issues, if any
- whether the plan is ready to move into execution
- whether owner and reviewer separation is preserved for the non-trivial steps

The system must not advance into `in_progress` until the reviewed plan has passed the required checks.
If the plan cannot be written durably, the run must remain blocked or paused rather than silently continuing into execution.

## 10. Human Confirmation Boundary

The feature must define a narrow confirmation boundary so the system does not stop unnecessarily.

### 9.1 Automation-First Default

All steps should be executed by the system, AI, LLM, or agents by default.

The workflow must only send work to a human when:

- the step is explicitly policy-gated for human approval
- the action is genuinely safety-critical or irreversible
- the system cannot produce a trustworthy decision or repair path on its own

For ordinary work, the system should keep the task inside automation as long as possible and should prefer:

- autonomous execution
- autonomous review by an appropriate persona
- autonomous repair and re-verification
- autonomous continuation to the next step

The presence of a human reviewer should be the exception, not the default route.

### Human confirmation is required for:

- destructive operations
- policy-sensitive actions
- external side effects that the user explicitly wants gated
- cases where the workflow cannot determine a safe next step

### Human confirmation is not required for:

- ordinary skill execution
- swarm execution
- image generation jobs
- video generation jobs
- routine polling of async tasks
- deterministic workflow continuation

### 9.2 Escalation Policy

The system should escalate to a human immediately only when the issue is safety-critical, irreversible, or explicitly policy-gated.

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

If a step can be corrected, re-verified, and advanced without a human deciding the outcome, the system should do that instead of escalating.

### 9.3 Risk Classes

The runtime should classify each step or dependency into a risk class so the next action can be selected consistently.

#### Low Risk

Definition:

- the step is reversible
- the step is inspectable by automation
- the failure can usually be corrected by re-run, repair, or re-review

Examples:

- incomplete skill output
- off-spec image generation
- fragmentary swarm output
- a workflow branch that needs another automated pass

Default action:

- keep in automation
- repair or regenerate
- re-verify
- advance only after passing review

#### Medium Risk

Definition:

- the step could affect downstream quality
- the step needs stronger verification
- the step is not immediately harmful, but a bad result would waste time or credits

Examples:

- code/config changes with failing tests
- ambiguous plan outputs
- async worker results that look complete but need contract validation

Default action:

- keep in automation
- run stronger validation
- ask a persona reviewer to inspect
- retry or repair before escalation

#### High Risk

Definition:

- the step may create a material policy, security, privacy, or compliance issue
- the step may create a significant external side effect
- automated repair is possible, but only within strict boundaries

Examples:

- protected data access requests
- security-sensitive workflow actions
- potentially destructive operations with uncertain impact

Default action:

- run automated checks first
- escalate immediately if the policy says human approval is mandatory
- otherwise keep the step blocked until the safety persona or human approval resolves it

#### Critical Risk

Definition:

- the step is irreversible or could cause serious harm if wrong
- the system cannot safely self-correct
- the policy requires human approval before action

Examples:

- irreversible production changes
- high-impact compliance decisions
- destructive external side effects

Default action:

- stop automation at the boundary
- require human approval
- do not auto-continue until approval is granted

The runtime should prefer the lowest safe risk class and should only escalate upward when automated repair and automated review can no longer produce a trustworthy result.

### 9.4 Risk-to-Reviewer Matrix

Use the following default mapping when selecting the reviewer persona for a step:

| Risk Class | Default Reviewer Persona | Escalation Rule |
|---|---|---|
| Low | Technical reviewer or domain persona | Stay in automation unless repeated repair fails |
| Medium | Technical reviewer plus QA/validator | Require stronger validation before advancing |
| High | Safety or policy persona | Block or escalate if policy or risk remains unresolved |
| Critical | Human approval with safety/policy oversight | Do not continue without explicit approval |

The runtime may choose an additional reviewer persona when a step crosses multiple domains, but it should always start from the matrix above.

When a step is both risky and technical, the safer persona should review first, and the technical persona should confirm that the repair or output is sound before advancement.

### 9.5 Teams UI plan visibility

The Teams UI must expose the current plan continuously so the team can inspect:

- the current goal or topic
- the plan steps and subtask breakdown
- who owns each step
- who reviews each step
- the current status of each step
- what evidence has already been written
- what verification criteria remain before the step can advance

The plan view must be durable and refreshable so it can be checked at any time during execution.

The UI should make it obvious whether the team is:

- still planning
- actively executing a planned step
- waiting on review
- waiting on a worker result
- blocked by policy
- ready to move to the next step

## 11. UI and Status Visibility

The user should be able to see at a glance:

- what the run is currently doing
- whether it is actively running or waiting
- what it is waiting for
- when it will poll again
- whether a human decision is needed
- whether the run is blocked by policy or anomaly detection

### 11.2 Work OS synchronization

The automation layer must stay consistent with the existing Work OS model.

The Work OS case or request projection is the business-facing mirror of the work, while the team run snapshot is the execution-facing mirror. They must stay aligned so operators never see contradictory state.

Required rules:

- every meaningful team-run transition must be reflected back into Work OS as a matching case, task, or event update
- Work OS should expose the authoritative business status that operators use for intake, ownership, exception, and outcome tracking
- team-run runtime overlays should project into Work OS instead of inventing a conflicting parallel lifecycle
- if a state cannot be mapped cleanly, the system must record an exception or blocked state rather than silently diverging
- status labels shown in Teams, Work OS Console, and monitoring surfaces must describe the same underlying progression with consistent wording
- any automated repair or re-run must preserve the same case identity and history rather than creating a conflicting duplicate case unless the user explicitly requested a new case

### 11.3 Status mapping matrix

The implementation must use a deterministic mapping between execution state and Work OS state.

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

The status surface should avoid vague labels such as "paused" when the system is actually waiting on an external job.

## 12. Implementation Guidance

The feature is expected to affect the orchestration layer, not just the UI.

Likely implementation areas:

- run engine state machine
- auto-advance scheduler
- async job metadata contracts
- polling supervisor or worker
- work item state mapping
- run status UI
- telemetry and anomaly logging

The implementation should preserve compatibility with existing run data and should avoid breaking older runs or existing team workflows.

## 13. Step Verification Policy

Every step in the autonomous workflow must have an explicit verification method before the system can move forward.

### 13.1 Required Verification Types

Each step must use one or more of the following verification methods:

- durable writeback of state or artifact data
- test execution with a pass/fail result
- deterministic validation against a schema, contract, or rule set
- comparison against an accepted reference or rubric
- human approval only when the step is policy-gated or inherently subjective

The verification and correction loop should also be performed by the system, AI, LLM, or agents wherever possible.

Human involvement is allowed only after automated execution, automated review, and automated repair have been attempted or when policy explicitly requires immediate human approval.

### 13.2 Evidence Requirements

Before a step can be considered complete, the system must persist evidence that the step succeeded.

Acceptable evidence includes:

- stored output artifacts
- job completion records
- validation logs
- test results
- status transitions recorded in the run ledger
- checksum, hash, or signature checks where applicable

The system should not treat an unverified model assertion as completion.

### 13.3 Persona-Based Review

Because this is a team system, each step should be reviewed by the persona or role most suited to evaluate that kind of work.

The reviewer should:

- inspect the step output
- compare it against the step objective and evidence
- identify gaps, risks, or missing validation
- propose concrete corrections or improvements
- decide whether the step is ready to advance or must loop back for repair

The system must not rely on a single execution pass with no reviewer. At minimum, there must be a second-pass evaluation from an appropriate persona before the step can be marked complete.

Expected reviewer examples:

- planner or coordinator persona for objective alignment and workflow structure
- technical reviewer persona for implementation correctness
- QA or validator persona for test and contract checks
- domain persona for subject-matter quality and completeness
- safety or policy persona for high-risk actions

### 13.4 Review Protocol by Work Type

The reviewer persona must match the kind of step being evaluated.

#### 12.4.1 Skill Execution

Primary reviewer persona:

- technical reviewer or domain persona

Required checks:

- verify the skill completed with a terminal success state
- verify the output matches the skill objective
- verify any written artifacts, logs, or returned payloads are present
- verify the result is usable by the next workflow step
- if the skill output is incomplete or low quality, request repair and re-run

#### 12.4.2 Agency Swarm Execution

Primary reviewer persona:

- planner or coordinator persona with a technical reviewer cross-check

Required checks:

- verify the swarm reached a converged outcome or explicit terminal state
- verify the combined result is coherent across contributors
- verify the swarm produced evidence of collaboration and completion
- verify the result maps cleanly to the next workflow step
- if the swarm output is fragmented or contradictory, loop back for revision

#### 12.4.3 Image and Video Generation

Primary reviewer persona:

- QA or validator persona with domain review when needed

Required checks:

- verify the generation job completed successfully
- verify the returned asset exists and is accessible
- verify the asset matches the requested prompt, format, and policy
- verify the asset is suitable for downstream use
- if the asset is malformed, low quality, or off-spec, request regeneration or prompt repair

#### 12.4.4 Code or Configuration Changes

Primary reviewer persona:

- technical reviewer persona

Required checks:

- verify tests pass for the changed surface
- verify the diff implements the intended behavior
- verify no regression is introduced in adjacent paths
- verify the change is written back to code, config, or documentation as expected
- if tests fail or the diff does not match the step goal, loop back for repair

#### 12.4.5 Policy-Sensitive or High-Risk Steps

Primary reviewer persona:

- safety or policy persona, and human approval if required by policy

Required checks:

- verify the action is allowed under tenant and user policy
- verify the action has enough evidence to proceed safely
- verify any irreversible side effects are explicitly approved
- verify the step is not bypassing a required gate
- if policy is unclear, block advancement until clarified

#### 12.4.6 Final Completion Step

Primary reviewer persona:

- coordinator persona with QA and technical confirmation

Required checks:

- verify all required artifacts are complete
- verify the run objective is satisfied
- verify outstanding work items are closed or intentionally deferred
- verify the final evidence has been written to durable storage
- verify the run can be marked complete without unresolved dependencies

### 13.5 Quality Gate Before Advancement

Before advancing to the next step, the engine must evaluate whether the current result is good enough to proceed.

The quality gate should answer:

- Did the step produce the expected artifact or state change?
- Did the verification method pass?
- Does the output satisfy the step's contract or acceptance rule?
- Is the output consistent with the run objective?

If the answer is no, the engine must not advance.

### 13.6 Retry and Repair Loop

If a step fails verification, the system must:

- record the failure reason
- attempt corrective action when feasible
- rerun the verification after correction
- continue looping until the step passes or a policy limit is reached

The workflow may only move to the next step after the failed step has been repaired and re-verified successfully.

### 13.7 Step-Level Policy Enforcement

This verification policy is mandatory for:

- async worker completion
- artifact generation
- intermediate agent handoffs
- output validation
- final run completion

The policy must be enforced consistently across workflows so that a step is never treated as done without proof.

## 14. Acceptance Criteria

### Continuation

- `auto_team` continues running without being limited to a small fixed number of turns
- the engine advances to the next step whenever there is still actionable progress to make
- the system keeps work inside automation unless human approval is truly required

### Async Waiting

- skill jobs, swarm jobs, image jobs, and video jobs are tracked as async work rather than human-blocking pauses
- the engine polls those jobs until completion or terminal failure

### Human Gating

- only genuinely human-required decisions cause the run to wait for human approval
- ordinary async work does not require manual approval

### Safety

- repeated non-progress loops are detected
- policy-based limits still work
- stuck jobs do not spin forever
- loop guards produce explainable reasons

### Visibility

- run state clearly shows whether the system is running, waiting on a worker, waiting on a poll, or awaiting human approval
- the user can understand why the run has not progressed

### Verification

- every workflow step has a defined verification method
- the engine writes or stores evidence for each completed step
- every step has a persona-appropriate reviewer before completion is accepted
- each major work type has a defined review protocol and primary reviewer persona
- the system attempts autonomous execution, autonomous review, and autonomous repair before escalating to a human
- the system escalates immediately only for the explicitly safety-critical or policy-gated cases defined in the escalation policy
- each step is assigned a risk class that drives the default action
- low and medium risk work remain in automation first
- high and critical risk work are gated by safety policy and human approval where required
- each risk class maps to a default reviewer persona through a documented decision matrix
- failed verification causes the system to loop through repair and re-check before advancing
- the system does not advance to the next step without a passing quality gate
- the system does not trust a single pass without review
- every incoming task is split into a documented plan before execution when the task is not trivially small
- the plan records persona ownership, reviewer ownership, verification method, and repair loop rules
- work that can be safely split is split before execution instead of being sent as one large prompt
- the Teams UI shows the plan continuously with steps, owners, reviewers, status, and evidence
- the plan view is durable and refreshable throughout execution
- Work OS and team-run state stay synchronized and do not present conflicting status for the same work
- Work OS-originated work keeps the same case identity and history throughout planning, execution, repair, and completion

## 15. Success Definition

This feature is successful when `auto_team` behaves like a real autonomous workflow runner:

- it keeps working until the goal is complete
- it waits only for actual async dependencies
- it asks humans only when humans are truly needed
- it keeps itself safe with progress-aware guardrails

That is the desired behavior for a production-grade automation system.
