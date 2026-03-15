# Section 02: Agency Handoff Follow-up

## Current state

- Agency Swarm exists in `/agencies/*`.
- Chat does not yet provide:
  - direct “Send this task to Agency” entry
  - planner-driven escalation UX
  - return artifact linking a Chat message to an agency run

## Follow-up implementation shape

1. Add a Chat-level handoff action for complex tasks.
2. Reuse planner/agency escalation metadata where available.
3. Persist a Chat artifact that points to the spawned agency run.
4. Support return navigation from Agency back to Chat.
5. Add feature gating for tenants via existing agency/planner flags.

## Suggested acceptance criteria

- User can escalate a Chat task into an agency run from Chat.
- Chat shows status and resume links for the agency run.
- Agency run can return a result artifact back into the originating conversation.
