# Section Cross-Consistency Review - Round 1

Planning directory: `specs/feature/124-smart-ai-hub-worker-app`

## Scope Reviewed

- `sections/index.md`
- `section-01-contracts-and-flags.md`
- `section-02-worker-queue-scheduler.md`
- `section-03-lease-attempt-watchdog.md`
- `section-04-artifact-verification.md`
- `section-05-hyperframes-projection-storyboard.md`
- `section-06-worker-connect-auth.md`
- `section-07-worker-app-runtime-pack.md`
- `section-08-tauri-hyperframes-executor.md`
- `section-09-user-job-monitor-ui.md`
- `section-10-admin-worker-monitor-ui.md`
- `section-11-future-local-ai-mcp-rollout.md`

## Scorecard

| Category | Result | Notes |
| --- | --- | --- |
| Interface alignment | PASS after fixes | Job type, assignment attempt, worker auth, artifact types, and MCP tool names are consistent. |
| Coverage gaps | PASS after fixes | User-facing monitors now depend on the producer sections they consume. |
| Overlaps | PASS | No two sections are scoped to implement the same primary UI surface or service as owner. |
| Dependency order | PASS after fixes | Dependency graph now matches section-level dependencies. |
| Self-containment | PASS | Each section includes goal, dependencies, files, tests, implementation steps, acceptance criteria, and UI/UX contract. |

## Issues Found And Fixed

1. `section-05-hyperframes-projection-storyboard` maps stale/stalled worker
   states but did not declare dependency on
   `section-03-lease-attempt-watchdog`.
   - Fixed section dependency.
   - Updated `sections/index.md` dependency graph and summary.

2. `section-09-user-job-monitor-ui` consumes executor progress/completion states
   but did not declare dependency on `section-08-tauri-hyperframes-executor`.
   - Fixed section dependency.
   - Updated `sections/index.md` dependency graph and summary.

3. `section-10-admin-worker-monitor-ui` surfaces verification diagnostics but
   did not declare dependency on `section-04-artifact-verification`.
   - Fixed section dependency.
   - Updated `sections/index.md` dependency graph and summary.

4. Backend/contract sections that indirectly affect UI state did not include the
   required UI/UX contract headings.
   - Added UI/UX contract blocks to sections 01, 02, 03, 04, 06, 08, and 11.

## Interface Map

| Producer | Contract / Output | Consumer |
| --- | --- | --- |
| section-01 | `hyperframes_final_composite`, progress/failure codes, capability families, feature flags | sections 02-11 |
| section-02 | queued `worker_jobs` row, idempotency, billing metadata | sections 03, 04, 05, 09, 10 |
| section-03 | `assignmentAttempt`, lease validation, reassign/watchdog states | sections 04, 05, 08, 09, 10 |
| section-04 | verified artifact refs and verification report | sections 05, 08, 09, 10 |
| section-06 | worker-specific pairing/tokens | sections 07, 08, 10 |
| section-07 | Worker App runtime doctor/capability readiness | section 08 and admin/user status surfaces |
| section-08 | executor progress, uploads, completion/failure events | section 09 and operational projections |
| section-11 | reserved local AI/MCP job families and rollout guards | future sections |

## Final Validation

- `check-sections.py`: complete, 11/11 sections.
- `check-ui-contracts.py`: passed, all 11 UI-affecting sections include required
  UI/UX contract headings.
