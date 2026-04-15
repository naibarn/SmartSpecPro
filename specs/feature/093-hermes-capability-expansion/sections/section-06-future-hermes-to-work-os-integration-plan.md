# Section 06 - Future Hermes To Work OS Integration Plan

## Objective

Prepare Hermes to act as a front-end assistant for Work OS once Feature 082 is available, without introducing a parallel work model.

For the implementation-ready task breakdown, see [section-06-future-hermes-to-work-os-integration-tasks.md](./section-06-future-hermes-to-work-os-integration-tasks.md).

## Scope

- let Hermes create Work OS requests from user intent
- let Hermes update canonical work cases and tasks
- let Hermes surface queue, approval, exception, and outcome state in plain language
- keep all work state canonical in Feature 082

## Out of Scope

- no new queue model
- no new case model
- no parallel approval state
- no Hermes-owned work ledger
- no bypass of Work OS tenant or audit rules

## Implementation Steps

### 1. Define action-to-Work-OS mappings

- map Hermes intent types to canonical Work OS operations
- require explicit target selection for create/update actions
- route ambiguous actions to triage

### 2. Add a Work OS integration adapter

- keep the adapter thin and service-oriented
- call Feature 082 APIs only
- preserve tenant, actor, and trace identifiers

### 3. Project status back into Hermes surfaces

- show case, task, queue, and approval status in plain language
- avoid exposing internal work-model jargon unless the user asks for it
- use read-only summaries in Teams and Admin Monitoring

### 4. Protect canonical ownership

- reject any attempt to write local Hermes-only work state
- ensure state transitions are owned by the Work OS service boundary
- keep fallback behavior available when Work OS data is missing or the target is unsafe

### 5. Add regression coverage

- verify canonical work items are created and updated through Feature 082
- verify ambiguous work actions route to triage
- verify no parallel queue or case state is introduced

## Suggested Acceptance Criteria

1. Hermes can create a canonical `work_request` through Feature 082.
2. Hermes can update a `work_task` or `work_assignment` through Feature 082.
3. Hermes can display current work state without inventing its own queue or case state.
4. Unsafe targets are routed to triage.
5. Tenant isolation and actor attribution are preserved on every write.
