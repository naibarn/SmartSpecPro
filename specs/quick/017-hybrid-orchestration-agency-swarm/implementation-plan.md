# Hybrid Orchestration Plan

## Objective
Build a hybrid orchestration experience where the platform can design and execute a combined flow that uses Virtual workflow for deterministic steps and Agencies swarm for collaborative reasoning, with a new user command/button that triggers the combined mode.

## Current-codebase fit
The repository already has the key primitives:
- a routing layer that can escalate from chat/skill into agency-level collaboration
- a workflow/orchestrator engine for stepwise execution, approvals, and retries
- a Python agency service that already splits agent-only vs multi-node execution
- a topology model that already understands hybrid agency graphs

This means the new feature should extend the existing split rather than introduce a new parallel architecture.

## Proposed solution

### 1) Add a hybrid orchestration coordinator
Create a coordinator layer that accepts a single task brief and returns a staged execution blueprint.

The blueprint should include:
- task goal and constraints
- which stages should run in workflow mode
- which stages should run in swarm mode
- handoff points between stages
- validation gates and approval requirements
- budget and risk expectations

### 2) Standardize the contract between workflow and swarm
Define a shared orchestration contract so both sides speak in the same shape:
- input brief
- stage type
- expected output schema
- confidence / risk metadata
- handoff payload
- validation status

Workflow should own the canonical state machine. Swarm should return structured proposals that workflow can validate and commit.

### 3) Add a user-facing command/button
Add a command surface such as `Hybrid Orchestrate` or `Design Collaborative Flow`.

The command should:
- analyze the user request
- choose the collaboration pattern
- show a preview of the plan
- let the user approve or revise before execution
- execute through the existing workflow path with swarm sidecars where needed

### 4) Introduce stage roles for swarm
Support named swarm roles so the coordinator can request the right behavior:
- explorer
- critic
- synthesizer
- validator
- executor assistant

These roles do not replace the agency graph; they help shape how swarm contributes at each stage.

### 5) Make workflow the validation and commit boundary
Only the workflow side should:
- commit final state
- apply approvals
- publish outputs
- write audit trails
- handle rollback and retries

Swarm may propose, review, compare, and refine, but should not bypass the workflow gate.

## Affected files and modules

### Node.js / frontend
- `apps/web/server/services/roomIntentRouter.ts`
- `apps/web/server/services/routingPolicyEngine.ts`
- `apps/web/server/services/routingFallbackLadder.ts`
- `apps/web/server/routers/agency.ts`
- `apps/web/client/src/components/chat/AgencyEscalationCard.tsx`
- likely a new UI component for the hybrid preview/approval surface

### Python / backend
- `python-backend/app/services/agency_orchestrator.py`
- `python-backend/app/services/agency_service.py`
- `python-backend/app/services/agency_swarm_adapter.py`
- likely a new coordinator/service module for hybrid planning

### Tests
- router tests for hybrid routing decisions
- agency service tests for topology and handoff behavior
- UI tests for the new command/button and preview flow

## Implementation approach

### Phase 1: coordination contract
Implement the shared plan shape first, then make both sides emit and consume it.

### Phase 2: routing and orchestration
Teach the router to recognize when a task should become a hybrid collaboration instead of plain swarm escalation.

### Phase 3: UI command surface
Add the new command/button and a preview screen for the staged plan.

### Phase 4: execution and guardrails
Wire approval, validation, and audit into the hybrid flow so the final commit stays deterministic.

### Phase 5: observability and iteration
Add telemetry for:
- plan chosen
- stages executed
- handoffs
- approval outcomes
- budget spent
- fallback frequency

## Risks and mitigations

### Risk: duplicated orchestration logic
Mitigation: keep one shared contract and one workflow commit boundary.

### Risk: swarm overuse increases latency and cost
Mitigation: only use swarm on stages that benefit from parallel reasoning, critique, or synthesis.

### Risk: unclear user expectations
Mitigation: always show a preview of the plan before execution and label each stage clearly.

### Risk: mutation safety
Mitigation: enforce that swarm outputs are proposals until validated by workflow.

## Acceptance criteria
- The system can produce a hybrid plan from a single user request.
- The plan clearly marks workflow stages and swarm stages.
- The user can approve or cancel the plan before execution.
- Final state changes still go through the workflow validation/commit path.
- The feature is test-covered at router, backend, and UI levels.

## Rollout notes
- Ship behind a feature flag first.
- Start with plan preview only, then enable execution.
- Keep the legacy agency escalation path as fallback until the hybrid path is stable.

