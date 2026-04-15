# Research Notes - Feature 082 Work OS

## Research decision

- Codebase research: yes
- Web research: no
- Testing: existing codebase uses `vitest` for TypeScript unit/router tests and `tsc --noEmit` via `npm run check` for type validation

Reasoning:
- The feature is deeply tied to existing repo patterns for work items, team runs, approvals, monitoring, and schema evolution.
- No external technology choices were required by the spec beyond internal platform architecture.
- The main risk is consistency with existing server/router/schema conventions, not outside best practices.

## Codebase findings

### 1. The repo already has a work-item substrate, but it is narrower than the Work OS spec

Relevant files:
- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/workItemService.ts`
- `apps/web/server/routers/teamWorkItem.ts`
- `apps/web/server/routers/__tests__/teamWorkItem.test.ts`
- `apps/web/server/services/__tests__/workItemSchema.test.ts`

Key observations:
- `team_work_items` already stores revision/version, assignment, approval state, lock ownership, parent/superseded links, due dates, and artifact references.
- `work_item_events` already provides an immutable lifecycle audit trail.
- `workItemService` already treats work items as versioned records with lock, revision, supersession, approval, and routing semantics.
- The current model is good enough to map into a first-release `work_task`, but it does not yet express `work_request`, `work_case`, `work_exception`, `work_outcome`, or explicit SLA policy objects.

Implication:
- The implementation should extend the current substrate instead of replacing it.
- The first release should preserve the existing work item identity and expose new Work OS concepts as additive layers.

### 2. Router patterns already exist for tenant-safe server-canonical ownership and lifecycle events

Relevant files:
- `apps/web/server/routers/teamWorkItem.ts`
- `apps/web/server/routers/monitoring.ts`
- `apps/web/server/routers/approvals.ts`
- `apps/web/server/routers.ts`

Key observations:
- `teamWorkItemRouter` uses tenant resolution helpers and mirrors lifecycle changes into room messages, which is a strong precedent for case timeline mirroring.
- `monitoringRouter` already provides admin-scoped operational summaries, run/event inspection, alert acknowledgement, and incident actions.
- `approvalsRouter` currently proxies approval workflows to a Python backend, which means Work OS approval surfaces should likely integrate rather than replace that path on day one.
- The server already centralizes router registration, so a new Work OS router can be added cleanly without inventing a new top-level transport.

Implication:
- Work OS APIs should reuse existing tenant resolution and audit patterns.
- New case/task/exception routes should be modeled as first-class server routes, not as ad hoc service calls from UI components.

### 3. Monitoring and notification surfaces are already present and should be linked, not duplicated

Relevant files:
- `apps/web/server/routers/monitoring.ts`
- `apps/web/server/services/monitoringService.ts`
- `apps/web/server/services/orchestratorNotificationService.ts`
- `apps/web/server/services/unifiedNotificationService.ts`

Key observations:
- Monitoring already expects admin-grade metrics, alert streams, and incident actions.
- Notifications already have tenant-scoped retrieval and read/dismiss actions.
- The Work OS should feed its SLA, backlog, and exception state into these existing operational surfaces instead of creating a separate ops stack.

Implication:
- The plan should treat Work OS metrics as inputs to existing monitoring views and notifications.
- The implementation should preserve tenant scoping at every step.

### 4. Workpack and role-agent layers are the execution consumers, not the source of truth

Relevant files:
- `apps/web/server/services/workpackLedgerService.ts`
- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/services/runEngine.ts`
- Feature specs 079 and 080

Key observations:
- Workpack ledger records already capture run steps, artifacts, and connector summaries.
- Team-run machinery already supports pause/resume/advance/stop semantics.
- The Work OS spec should bind those execution records back to the same business work object rather than letting them define ownership themselves.

Implication:
- The implementation plan should make case/task identity the anchor for workpack and role-run evidence.
- Any new run linkage should be additive and backward-compatible.

### 5. Existing test setup is mature enough for router/service/schema-first TDD

Relevant files:
- `apps/web/package.json`
- `apps/web/server/routers/__tests__/teamWorkItem.test.ts`
- `apps/web/server/services/__tests__/workItemSchema.test.ts`
- other Vitest suites under `apps/web/server/**/__tests__`

Key observations:
- `npm run check` is `tsc --noEmit`.
- `npm test` runs `vitest run`.
- Router tests use dependency mocking patterns that are compatible with adding new route tests before implementation.
- Schema tests already verify enum values and table shape.

Implication:
- TDD should be organized around:
  - schema shape tests
  - service behavior tests
  - router contract tests
  - regression tests for tenant isolation and event emission
- The plan can rely on existing Vitest conventions rather than introducing a new testing framework.

## Testing notes

- Existing framework: Vitest
- Existing validation gate: `npm run check`
- Likely test locations:
  - `apps/web/server/services/__tests__/`
  - `apps/web/server/routers/__tests__/`
  - `apps/web/server/services/*.test.ts`

Recommended test strategy for this feature:
- Add schema shape tests for new Work OS tables and enums.
- Add service tests for request-to-case creation, task mapping, SLA state, exception creation, and outcome capture.
- Add router tests for tenant gating, adapter compatibility, and timeline projections.
- Add regression tests to ensure legacy `teamWorkItem` paths still emit the Work OS lifecycle events and do not bypass the canonical service boundary.
