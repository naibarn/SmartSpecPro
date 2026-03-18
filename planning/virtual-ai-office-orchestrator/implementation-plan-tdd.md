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

### Brainstorm Migration

- legacy brainstorm requests resolve to a discussion template
- summary output remains compatible with existing downstream consumers

### Automation Handoffs

- agent-initiated workflow/presentation/video/agency handoffs emit traceable metadata
- approval-required actions pause correctly

## Regression Checks

- existing single-persona chat still works
- existing agency chat still works
- existing brainstorm endpoint remains functional during migration
- tenancy and RBAC boundaries remain enforced
