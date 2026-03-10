# Implementation Blocked Tasks

## blocked

- task_id: sec04-copilot-live-hook
  section: section-04-execution-surface-enforcement
  task: wire Automation Copilot execution to the shared browser policy contract immediately before live action dispatch
  blocked_by: none
  unblock_condition: implemented 2026-03-10 via execution-scoped policy context + Node internal evaluation endpoint
  status: done
  owner_step: section-04 follow-up
  notes: Automation Copilot now passes a Node-owned browser-policy context into Python and evaluates each live action before dispatch

- task_id: sec04-python-transition-hooks
  section: section-04-execution-surface-enforcement
  task: re-evaluate policy on navigation, redirect, popup, frame, and prompt transitions in the Python executor
  blocked_by: none
  unblock_condition: implemented 2026-03-10 via Playwright popup/frame/dialog/filechooser/download watchers that route synthetic events through the Node-owned policy client
  status: done
  owner_step: section-04 follow-up
  notes: URL transitions, popup creation, iframe navigation, and prompt/file/download surfaces now re-check policy before later browser steps continue

- task_id: sec05-live-transfer-enforcement
  section: section-05-data-handling-and-trust-controls
  task: enforce transfer, clipboard, and iframe trust controls on every live browser action and transition
  blocked_by: none
  unblock_condition: implemented 2026-03-10 via generator-side iframe metadata enrichment and live frame-scoped executor dispatch
  status: done
  owner_step: section-05 follow-up
  notes: pre-dispatch policy checks plus popup/frame/file-picker/download surfaces run live, upload/clipboard/download actions are first-class transfer checks, and generator validation now auto-emits frame selector/origin/trust metadata for uniquely matched iframe actions

- task_id: sec05-redis-action-counters
  section: section-05-data-handling-and-trust-controls
  task: back section-05 thresholds with Redis-scoped workflow/action counters instead of caller-supplied counts
  blocked_by: none
  unblock_condition: implemented 2026-03-10 via execution-scoped Redis counter keys and executor-side mutation/hydration points before policy evaluation
  status: done
  owner_step: section-05 follow-up
  notes: the live executor now hydrates and mutates `browser_policy:{tenant_id}:{execution_id}:counters` so policy thresholds use Redis-backed counts instead of transient caller state

- task_id: sec06-live-audit-persistence
  section: section-06-audit-observability-and-incident-controls
  task: emit browser-policy audit artifacts from the live decision path into JSONL and structured DB persistence
  blocked_by: the per-action execution seam now exists, but there is still no JSONL writer or dedicated browser-policy decision table/partition DDL
  unblock_condition: attach audit artifact writing to the live Node evaluation path and add the browser-policy decision storage migration
  status: blocked
  owner_step: section-06 follow-up
  notes: runtime enforcement exists; durable audit persistence still does not

- task_id: sec06-live-incident-plumbing
  section: section-06-audit-observability-and-incident-controls
  task: wire kill switches, deny overrides, and approval revocation into live executor dispatch and approval polling
  blocked_by: pre-dispatch incident checks, approval waits, and cached-approval revalidation are now wired, but operator-facing polling/status surfaces still need browser-specific runtime coverage
  unblock_condition: surface browser-specific approval/revocation status and audit telemetry through the live runtime so operators can observe and act on incident state directly
  status: blocked
  owner_step: section-06 follow-up
  notes: kill-switch and deny logic execute live through the Node policy runtime, and cached approvals now re-check DB state before reuse; the remaining gap is continuous operator-visible incident visibility

- task_id: sec07-raw-sql-partition-migration
  section: section-07-rollout-migrations-and-release-gates
  task: create the additive raw SQL migration for browser-policy decision storage, monthly partitions, and maintenance ownership
  blocked_by: no browser-policy decision table or partition DDL exists yet
  unblock_condition: define the final decision-storage schema and add the production migration path
  status: blocked
  owner_step: section-07 follow-up
  notes: migration-plan metadata and readiness checks are implemented, but not the DDL itself

- task_id: sec07-release-gate-integration
  section: section-07-rollout-migrations-and-release-gates
  task: invoke rollout and rollback readiness checks from deployment or feature-flag orchestration
  blocked_by: no current deployment-control path consumes browser-policy rollout helper results
  unblock_condition: connect release automation or operator tooling to the browser-policy rollout helpers
  status: blocked
  owner_step: section-07 follow-up
  notes: gate and rollback helper logic is implemented and tested in isolation
