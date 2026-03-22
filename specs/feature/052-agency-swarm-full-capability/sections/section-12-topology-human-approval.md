I now have all the context needed to write the section. Let me produce the content.

# Section 12 -- Topology & Human Approval

## Overview

This section implements two related features from the 052 Agency Swarm Full Capability spec:

1. **Agency Topology Column & UI Guide** -- A `topology` field on the `agencies` table (added by section-01 migration) that classifies agency communication patterns. A tooltip component in the AgencyBuilder sidebar explains the trade-offs of each topology type.

2. **Human Approval Runtime** -- A runtime mechanism where agents can request human approval during execution. The flow is: agent calls `request_approval` tool, orchestrator pauses and emits an SSE `approval_required` event, the frontend renders an `ApprovalCard` with approve/reject buttons, the user responds via a tRPC `submitApproval` procedure, and the agent resumes or receives rejection feedback.

**Feature references**: 2.17 (GAP-D topology, GAP-F human approval runtime)
**Phase**: 2 -- Communication & Streaming

## Dependencies

| Section | What It Provides |
|---------|-----------------|
| section-01-database-migration | `agencies.topology` column (varchar 30, default `'custom'`) |
| section-05-guardrails-backend | `enforceOnHandoff` guardrail pattern used as reference for approval flow interruption |
| section-07-agency-context | `AgencyRunContext` class for storing approval state (`approval:{uuid}` keys) |
| section-09-sse-streaming-backend | `AgencyEventEmitter` for publishing `approval_required` SSE events; `agencyStreamProxy.ts` for proxying events to client |

## Blocked Sections

None -- this section is a terminal node in the dependency graph.

---

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_approval_tool.py` | `request_approval` tool class for agent use |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_approval_tool.py` | Python unit tests for approval tool + orchestrator integration |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyApproval.test.ts` | Vitest tests for tRPC submitApproval procedure |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ApprovalCard.tsx` | Frontend card rendering approve/reject UI |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/TopologyGuide.tsx` | Sidebar tooltip explaining topology types |

## Files to Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` | Add `submitApproval` tRPC procedure; extend `saveBuilder` Zod schema to include `topology` in agency validation |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` | Replace existing `_await_approval` with new SSE-based approval flow using `AgencyRunContext` + `AgencyEventEmitter` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` | Register `request_approval` as a builtin tool available to agents |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/AgencyBuilder.tsx` | Add `TopologyGuide` to sidebar |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/AgencyChatStream.tsx` | Render `ApprovalCard` when `approval_required` SSE event received |

---

## TDD: Tests to Write First

### Vitest Tests (Node.js / tRPC)

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencyApproval.test.ts`

```
Test 1: "submitApproval verifies ownership -- creator can approve"
  - Create a mock agency run with createdBy = userId 42
  - Call submitApproval as user 42 with valid approvalKey
  - Expect success (no TRPCError)

Test 2: "submitApproval verifies ownership -- admin can approve"
  - Create a mock agency run with createdBy = userId 42
  - Call submitApproval as admin user (userId 99, role 'admin')
  - Expect success

Test 3: "submitApproval rejects non-owner non-admin"
  - Create a mock agency run with createdBy = userId 42
  - Call submitApproval as user 55 (not admin)
  - Expect TRPCError with code FORBIDDEN

Test 4: "submitApproval rejects if run not in awaiting_approval state"
  - Create a mock agency run with status = 'running' (not 'awaiting_approval')
  - Call submitApproval
  - Expect TRPCError with code PRECONDITION_FAILED

Test 5: "submitApproval rejects double-approval (idempotency)"
  - Create a mock approval record with status = 'approved' (already used)
  - Call submitApproval with same approvalKey
  - Expect TRPCError with code CONFLICT

Test 6: "approvalKey is crypto.randomUUID() format"
  - Generate an approvalKey via the creation flow
  - Assert it matches UUID v4 regex pattern

Test 7: "submitApproval publishes approval decision to Redis"
  - Call submitApproval with decision = 'approved'
  - Verify Redis publish was called on the correct channel with correct payload

Test 8: "submitApproval accepts optional feedback string"
  - Call submitApproval with decision = 'rejected' and feedback = 'needs more detail'
  - Verify feedback is included in the Redis published payload
```

### pytest Tests (Python)

File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_approval_tool.py`

```
Test 1: "approval_required SSE event emitted with correct approvalKey"
  - Mock AgencyEventEmitter
  - Call request_approval tool handler
  - Verify emitter.emit called with event_type='approval_required', data containing approvalKey (UUID), step, summary, agentName

Test 2: "approval request written to AgencyRunContext"
  - Create AgencyRunContext instance
  - Call request_approval tool handler
  - Verify context has key 'approval:{uuid}' with value {step, summary, status: 'pending'}

Test 3: "agent resumes after approval context flag set"
  - Set up approval in context with status='pending'
  - Simulate approval by setting status='approved'
  - Verify orchestrator _await_approval returns approval message

Test 4: "agent receives rejection feedback"
  - Set up approval in context with status='pending'
  - Simulate rejection: set status='rejected', feedback='Incomplete analysis'
  - Verify orchestrator _await_approval returns rejection message with feedback

Test 5: "approval timeout (30min) terminates run with approval_timeout status"
  - Mock asyncio.wait_for to raise TimeoutError after simulated 30min
  - Verify orchestrator sets run status to 'approval_timeout'

Test 6: "approvalKey invalidated after single use"
  - Write approval to context with status='pending'
  - Simulate approval (status='approved')
  - Verify subsequent read of same key shows status='consumed' or similar non-pending state

Test 7: "request_approval tool returns structured response"
  - Call request_approval tool
  - Verify return value is a string message indicating approval was requested (for agent to see)

Test 8: "approval polling checks context at 2-second intervals"
  - Mock context.get to return 'pending' twice then 'approved'
  - Verify _await_approval polled 3 times before returning
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`, `@pytest.mark.asyncio`

---

## Implementation Guidance

### Part A: Topology Column & UI Guide

#### Backend (saveBuilder extension)

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`, extend the `saveBuilder` input schema to accept a `topology` field:

- Add `topology: z.enum(["handoff_chain", "orchestrator_worker", "hybrid", "custom"]).default("custom").optional()` to the agency-level fields in the saveBuilder Zod schema.
- On save, write `topology` to the `agencies` table alongside other agency fields.
- No validation logic beyond the enum -- topology is informational and used by AI Creator for guidance.

#### Frontend (TopologyGuide component)

Create `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/TopologyGuide.tsx`:

- A small info tooltip or collapsible panel in the AgencyBuilder sidebar.
- Displays a table of topology types with descriptions:
  - `handoff_chain` -- Agents pass work sequentially. Best for linear pipelines.
  - `orchestrator_worker` -- One supervisor delegates to specialized workers. Best for complex task decomposition.
  - `hybrid` -- Mix of handoff and orchestrator patterns. For agencies with both sequential and delegated work.
  - `custom` -- Fully custom routing. No structural constraints.
- Include a dropdown or radio group to set the topology value.
- Use Radix UI `Tooltip` or `Popover` for the guide, styled with Tailwind.

### Part B: Human Approval Runtime

#### B.1 -- Python: request_approval tool

Create `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_approval_tool.py`:

- Define a `RequestApprovalTool` class compatible with the agency-swarm tool interface.
- The tool accepts parameters: `step` (str, what the agent is requesting approval for), `summary` (str, context for the human reviewer).
- On execution:
  1. Generate `approvalKey = str(uuid.uuid4())`.
  2. Write to `AgencyRunContext`: key `approval:{approvalKey}`, value `{"step": step, "summary": summary, "status": "pending", "agentName": self.agent_name}`.
  3. Emit SSE event via `AgencyEventEmitter.emit("approval_required", {"approvalKey": approvalKey, "step": step, "summary": summary, "agentName": self.agent_name})`.
  4. Return a string to the agent: `"Approval requested. Waiting for human decision on: {step}"`.

#### B.2 -- Python: Orchestrator approval wait loop

Modify `_await_approval` in `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`:

- After the `request_approval` tool writes to context, the orchestrator enters a polling loop.
- Poll `AgencyRunContext.get(f"approval:{approvalKey}")` every 2 seconds.
- Check for status changes: `approved`, `rejected`, or timeout.
- Timeout: 30 minutes (1800 seconds). Use `asyncio.wait_for` wrapping the poll loop.
- On `approved`: return `"[Human approval: APPROVED for '{step}' — proceeding]"`.
- On `rejected`: return `"[Human approval: REJECTED for '{step}' — feedback: {feedback}]"`. The rejection feedback comes from `context.get(f"approval:{approvalKey}")["feedback"]`.
- On timeout: set run status to `approval_timeout`, return `"[Human approval: timed out — run terminated]"`.
- After any resolution, mark the approval as consumed: `context.set(f"approval:{approvalKey}", {..., "status": "consumed"})`.

#### B.3 -- Node.js: submitApproval tRPC procedure

Add to `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`:

```
submitApproval procedure:
  Input schema:
    - runId: z.string().uuid()
    - approvalKey: z.string().uuid()
    - decision: z.enum(["approved", "rejected"])
    - feedback: z.string().max(2000).optional()

  Logic:
    1. Look up the agency run by runId. Verify it exists and belongs to ctx.user's tenant.
    2. Ownership check: run.createdBy === ctx.user.id OR ctx.user.role in ['admin', 'domain_admin'].
       If not, throw TRPCError FORBIDDEN.
    3. State check: Verify run is in 'awaiting_approval' state (or has a pending approval in its context).
       If not, throw TRPCError PRECONDITION_FAILED.
    4. Idempotency check: Verify the approvalKey has not already been used.
       If already consumed, throw TRPCError CONFLICT.
    5. Publish the decision to Redis channel `agency:run:{runId}:approval` with payload:
       { approvalKey, decision, feedback }.
    6. The Python orchestrator's poll loop reads from AgencyRunContext, which is updated
       by a Redis subscriber that listens on this channel and calls context.set().
    7. Return { success: true }.
```

Rate limit: Apply existing `createRateLimitMiddleware` at 10 requests/minute per user.

#### B.4 -- Approval Bridge: Redis pub/sub between Node.js and Python

The approval decision flows:
1. Node.js tRPC `submitApproval` publishes to Redis channel `agency:approval:{runId}`.
2. Python side: A background listener (started per run alongside the orchestrator) subscribes to `agency:approval:{runId}`. When a message arrives, it updates `AgencyRunContext.set(f"approval:{approvalKey}", {"status": decision, "feedback": feedback})`.
3. The orchestrator's poll loop in `_await_approval` detects the status change and resumes.

This follows the same Redis pub/sub pattern used by the SSE streaming system (section-09).

#### B.5 -- Frontend: ApprovalCard component

Create `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ApprovalCard.tsx`:

- Renders when `AgencyChatStream` receives an `approval_required` SSE event.
- Props: `approvalKey`, `step`, `summary`, `agentName`, `runId`, `onDecision` callback.
- UI:
  - Card with amber/yellow border (indicating attention needed).
  - Agent name badge, step description, summary text.
  - Two buttons: "Approve" (green) and "Reject" (red).
  - Optional textarea for rejection feedback (shown when "Reject" is clicked).
  - Loading state while the tRPC mutation is in flight.
  - Disabled state after decision submitted (prevents double-click).
- Calls `trpc.agency.submitApproval.useMutation()` on button click.
- After successful submission, update the card to show the decision (approved/rejected) with a timestamp.

#### B.6 -- Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Cryptographic approval key | `crypto.randomUUID()` (Node.js) / `uuid.uuid4()` (Python) -- not sequential, not guessable |
| Ownership verification | `submitApproval` checks `run.createdBy === user.id` OR user is admin/domain_admin |
| Single-use keys | After approval/rejection, key status set to `consumed`; subsequent attempts get CONFLICT error |
| Idempotency | Check approval status before processing; reject if already consumed |
| Timeout | 30-minute default; orchestrator terminates run with `approval_timeout` status |
| Tenant isolation | Run lookup includes `tenantId` filter matching the authenticated user's tenant |

---

## Integration Points

### With section-07 (AgencyRunContext)

- Approval state stored as context keys: `approval:{uuid}` with value `{step, summary, status, agentName, feedback?}`.
- The `request_approval` tool and the orchestrator both read/write these keys.
- The Redis subscriber (bridge) also writes to context when Node.js publishes a decision.

### With section-09 (SSE Streaming)

- `AgencyEventEmitter.emit("approval_required", {...})` publishes the event that flows through Redis pub/sub to the Node.js SSE proxy and then to the client.
- The `approval_required` event type must be included in the SSE event type enum defined in section-09.
- The Node.js `agencyStreamProxy.ts` passes this event through unchanged.

### With section-05 (Guardrails)

- If `enforceOnHandoff` is enabled on input guardrails, the approval feedback message should also pass through input guardrails before being forwarded to the agent. This is a future enhancement -- for now, feedback is passed directly.

---

## Verification Checklist

- [ ] `topology` field accepted in `saveBuilder` and persisted to `agencies` table
- [ ] `TopologyGuide` component renders in AgencyBuilder sidebar with all 4 topology descriptions
- [ ] `request_approval` tool registered as builtin tool available to agents
- [ ] `request_approval` writes approval state to `AgencyRunContext`
- [ ] `approval_required` SSE event emitted with `approvalKey`, `step`, `summary`, `agentName`
- [ ] `submitApproval` tRPC procedure validates ownership, state, and idempotency
- [ ] `submitApproval` publishes decision to Redis for Python orchestrator consumption
- [ ] Orchestrator polls context and resumes agent on approval
- [ ] Orchestrator returns rejection feedback to agent on reject
- [ ] 30-minute timeout terminates run with `approval_timeout` status
- [ ] `approvalKey` is single-use (consumed after first decision)
- [ ] `ApprovalCard` renders in chat stream with approve/reject buttons
- [ ] `ApprovalCard` shows loading and disabled states appropriately
- [ ] All 8 Vitest tests pass
- [ ] All 8 pytest tests pass
- [ ] No TypeScript errors (`pnpm check` in `apps/web`)