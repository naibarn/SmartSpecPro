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
  blocked_by: none
  unblock_condition: implemented 2026-03-10 via live Node runtime audit persistence plus the `browser_policy_decisions` storage path
  status: done
  owner_step: section-06 follow-up
  notes: the internal browser-policy evaluation route now writes aligned JSONL and DB audit artifacts, returns trace/event-hash metadata, and uses the dedicated decision-storage schema

- task_id: sec06-live-incident-plumbing
  section: section-06-audit-observability-and-incident-controls
  task: wire kill switches, deny overrides, and approval revocation into live executor dispatch and approval polling
  blocked_by: none
  unblock_condition: implemented 2026-03-10 via runtime incident metadata on the Node response plus Python-side status propagation during approval waits and denials
  status: done
  owner_step: section-06 follow-up
  notes: kill-switch and deny logic execute live through the Node policy runtime, cached approvals still re-check DB state before reuse, and browser-specific approval/revocation status now reaches operator-facing task status/detail fields

- task_id: sec07-raw-sql-partition-migration
  section: section-07-rollout-migrations-and-release-gates
  task: create the additive raw SQL migration for browser-policy decision storage, monthly partitions, and maintenance ownership
  blocked_by: none
  unblock_condition: implemented 2026-03-10 via `0060_browser_policy_decision_partitions.sql` plus Drizzle typing for `browser_policy_decisions`
  status: done
  owner_step: section-07 follow-up
  notes: the additive partitioned decision table, current/future monthly partitions, and pg_partman ownership comment now exist in raw SQL, with Drizzle schema typing for query-side access

- task_id: sec07-release-gate-integration
  section: section-07-rollout-migrations-and-release-gates
  task: invoke rollout and rollback readiness checks from deployment or feature-flag orchestration
  blocked_by: none
  unblock_condition: implemented 2026-03-10 via feature-flag promotion gating for `automationCopilot` backed by Redis-fed release and rollout readiness snapshots
  status: done
  owner_step: section-07 follow-up
  notes: enabling `automationCopilot` now fails closed unless release-readiness and rollout-gate checks pass, giving feature-flag orchestration a concrete consumer of the rollout helpers
