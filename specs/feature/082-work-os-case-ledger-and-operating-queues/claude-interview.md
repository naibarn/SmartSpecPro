# Interview Transcript - Feature 082 Work OS

## Q1. What is the intended first-release storage strategy for the Work OS objects?

The first release should be additive, not a wholesale replacement. `work_request` and `work_case` should become new tables. `work_task` should map to the existing `team_work_items` substrate first, while approvals, exceptions, outcomes, and SLA records are added as new canonical tables. `work_item_events` should continue to act as the lifecycle journal.

## Q2. Should legacy team-work-item routes continue to work during the migration?

Yes. Existing team-work-item flows should remain operational and should be treated as compatibility surfaces. They should write through the canonical Work OS boundary so the system does not split ownership state between old and new models.

## Q3. What should be the canonical source of truth for ownership and SLA?

Web/server state should remain canonical for ownership, assignment, SLA, approvals, exceptions, and audit. Desktop can render and stage local execution, but it must mirror back to the server-canonical records and never become a second source of truth.

## Q4. How should Work OS interact with workpacks, role agents, approvals, and monitoring?

Workpacks and role agents should execute against Work OS objects, not beside them. Approvals and exceptions must remain work-scoped. Monitoring and notifications should surface SLA, backlog, and exception state from the Work OS so operators can inspect the business lifecycle in one place.

## Q5. What is the test strategy priority?

Start with schema and service tests, then router contract tests, then regression tests for tenant isolation and legacy compatibility. Vitest is the primary test framework, and `npm run check` is the type gate.

## Notes on interview source

This transcript is a synthesized planning interview derived from the spec and repo constraints. No interactive question/answer session was available in the current Codex environment, so the transcript captures the inferred architectural decisions that the implementation plan must honor.
