# TDD Guidance

## Test Strategy

This spec is not implemented yet, but implementation should start with contract and retrieval tests before UI expansion.

## Tests To Add First

### Memory Scope Retrieval

- agent only sees its own private memory by default
- team shared memory is visible to all team members
- room memory is visible only in the correct room
- project memory does not replace team or room memory
- retrieval order respects agent -> run -> room -> team -> project -> user

### Team Chat Runtime

- room messages preserve sender and recipient metadata
- orchestrator can switch between full trace and summary visibility
- autonomous room stops when stop policy is reached
- agent work that changes visible progress is persisted as a room post linked to the relevant work item
- peer critique and revision replies preserve `replyToMessageId`, citations, and artifact references where present
- sensitive tool outputs are sanitized or redacted before room persistence according to room/team policy

### Team Blueprints And Roster Kinds

- blueprint instantiation creates a complete roster with orchestrator, producer, reviewer, and approval path defaults
- the same persona can be instantiated into multiple teams without data collision
- connector-backed and human members render in roster APIs without being treated as personas

### Brainstorm Migration

- legacy brainstorm requests resolve to a discussion template
- summary output remains compatible with existing downstream consumers

### Automation Handoffs

- agent-initiated workflow/presentation/video/agency handoffs emit traceable metadata
- approval-required actions pause correctly

### Routine Work And Quality Loop

- scheduled routine creates or updates a work item instead of dispatching directly to one producer
- medium-risk artifacts require an independent reviewer before completion
- rejected work returns to `needs_revision`
- end-of-day summary includes successes, failures, pending approvals, and carry-over items
- stale revision updates fail via optimistic concurrency instead of silently overwriting a newer draft

### External Connector Members

- connector dispatch requires matching capability plus approval policy
- authenticated callback attaches results to the correct handoff/work item
- degraded connector health prevents silent selection when a safer native path exists
- duplicate callback delivery is rejected via idempotency/replay protection
- callback bound to wrong team/run/work item is rejected and audit-logged

## Regression Checks

- existing single-persona chat still works
- existing agency chat still works
- existing brainstorm endpoint remains functional during migration
- tenancy and RBAC boundaries remain enforced
- existing persona creation/editing remains reusable across multiple teams
