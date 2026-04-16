# Section 04: Verification, Reviewer Routing, Risk Classes, and Escalation

## Goal

Enforce the policy that every step must be verified, reviewed by a suitable persona, and either repaired or escalated according to risk.

This section is the policy engine for step completion.

## What This Section Must Change

### 1. Verification contract

Define the verification contract for a step:

- the step must have a verification method
- the step must write evidence
- the step must pass a quality gate before it can advance

### 2. Persona routing

Select a reviewer persona based on the type of work and the risk class.

Default reviewer mapping:

- `low` -> technical reviewer or domain persona
- `medium` -> technical reviewer plus QA/validator
- `high` -> safety or policy persona
- `critical` -> human approval with safety oversight

### 3. Repair loop

If verification fails, the system must repair and re-verify before advancement.

The step should not move forward just because the worker produced some output.

### 4. Escalation boundary

Escalate to a human only when the issue is explicitly safety-critical, irreversible, or policy-gated.

Examples that should remain automation-first:

- low-quality skill outputs that can be repaired
- incomplete swarm outputs that can be re-reviewed
- off-spec image/video outputs that can be regenerated
- code/config changes that can be fixed by rerunning tests
- temporary worker/provider failures

### 5. Work-item integration

Reuse existing work-item fields and events for:

- risk class
- approval state
- reviewer / approver IDs
- worker job fields
- artifact references

## Files Likely Touched

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/workAutomationExecutionService.ts`
- `apps/web/server/services/workItemService.ts`
- `apps/web/server/services/monitoringService.ts`
- `apps/web/server/services/__tests__/runEngine.test.ts`
- `apps/web/server/services/__tests__/workAutomationExecutionService.test.ts`

## Implementation Notes

- Keep reviewer selection deterministic and testable.
- Reuse existing risk and approval fields instead of inventing a second approval model.
- Make failure reasons explainable so the UI can surface them clearly.
- The policy should work for both async worker steps and directly executed steps.
- The current slice centralizes the reviewer/risk mapping in `apps/web/server/services/verificationPolicy.ts`, threads verification evidence into work-item events, and records step-level verification policy metadata in `workAutomationExecutionService` so the UI and backend can render the same gate logic.

## Completion Criteria

- Every step has a verification path.
- Every step has evidence before completion.
- Every step has a persona-appropriate reviewer.
- High and critical risk work escalate only when necessary.
- Failed steps loop through repair and re-verification before advancement.
