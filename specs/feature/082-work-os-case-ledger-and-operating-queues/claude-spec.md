# Synthesized Specification - Feature 082 Work OS

## 1. Objective

Deliver a canonical Work OS layer that makes business work first-class through durable requests, cases, tasks, assignments, approvals, exceptions, outcomes, SLA state, and work logs.

## 2. Scope

### In scope

- Add a canonical intake object for business requests.
- Add a canonical case container for multi-step business work.
- Map executable tasks to the existing team-work-item substrate first.
- Add approval, exception, outcome, and SLA records as explicit objects.
- Preserve a server-canonical work identity across chat, workpacks, role agents, monitoring, and desktop execution.
- Expose tenant-visible inboxes, queues, timelines, and operational dashboards.
- Keep legacy team-work-item and workpack evidence reachable from the new case timeline.

### Out of scope

- Replacing workpacks or role agents.
- Introducing a second workflow engine.
- Replacing existing approvals or monitoring systems wholesale.
- Migrating every old work object in one release.

## 3. Key decisions

1. The first release is additive.
2. `work_task` maps to `team_work_items` first.
3. `work_request` and `work_case` are new tables.
4. Approvals, exceptions, outcomes, and SLA state are explicit records.
5. Web remains the source of truth for ownership, SLA, and audit state.
6. Desktop is a truthful execution surface, not a second source of truth.
7. Legacy surfaces must write through the canonical Work OS boundary.

## 4. Existing codebase fit

- `team_work_items` already supports revisioning, assignment, locks, approvals, and artifact links.
- `work_item_events` already provides lifecycle audit history.
- `teamWorkItemRouter` already mirrors lifecycle events into room messages.
- `monitoringRouter` already exposes operational summaries and admin alerting.
- `approvalsRouter` already proxies approval operations and should be integrated rather than bypassed.

## 5. Testing stance

- Use Vitest for schema, service, and router tests.
- Use `npm run check` as the type gate.
- Add regression tests for tenant isolation, compatibility writes, and lifecycle event emission.
