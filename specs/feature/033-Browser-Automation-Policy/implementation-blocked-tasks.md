# Implementation Blocked Tasks

## blocked

- task_id: sec04-copilot-live-hook
  section: section-04-execution-surface-enforcement
  task: wire Automation Copilot execution to the shared browser policy contract immediately before live action dispatch
  blocked_by: the current execute request and Python executor do not expose a stable workflow-entitlement identity or a Node-owned action-policy callback per dispatch
  unblock_condition: add a cross-stack execution seam that carries workflow identity into execution and invokes policy evaluation on each live action / transition
  status: blocked
  owner_step: section-04 follow-up
  notes: raw browser launch guard is implemented; live Copilot enforcement is still missing

- task_id: sec04-python-transition-hooks
  section: section-04-execution-surface-enforcement
  task: re-evaluate policy on navigation, redirect, popup, frame, and prompt transitions in the Python executor
  blocked_by: no current per-action policy callback interface exists in the Python executor
  unblock_condition: introduce a transition hook API in the executor that can consume browser-policy decisions or request them from Node
  status: blocked
  owner_step: section-04 follow-up
  notes: required before Sections 05-07 can be honestly completed against live execution

- task_id: sec05-live-transfer-enforcement
  section: section-05-data-handling-and-trust-controls
  task: enforce transfer, clipboard, and iframe trust controls on every live browser action and transition
  blocked_by: the section-04 cross-stack execution seam still does not provide a per-action Node policy callback for the Python executor
  unblock_condition: wire the live executor through the shared policy callback and invoke section-05 controls before dispatch and on transitions
  status: blocked
  owner_step: section-05 follow-up
  notes: helper-layer logic and tests are in place, but production dispatch is not yet consuming them

- task_id: sec05-redis-action-counters
  section: section-05-data-handling-and-trust-controls
  task: back section-05 thresholds with Redis-scoped workflow/action counters instead of caller-supplied counts
  blocked_by: no browser-policy counter namespace or executor-side counter update path exists yet
  unblock_condition: define Redis keying and mutation points in the live browser execution path
  status: blocked
  owner_step: section-05 follow-up
  notes: deterministic threshold evaluation is implemented; stateful counting is deferred

- task_id: sec06-live-audit-persistence
  section: section-06-audit-observability-and-incident-controls
  task: emit browser-policy audit artifacts from the live decision path into JSONL and structured DB persistence
  blocked_by: the live browser decision path is not yet centralized, and no dedicated browser-policy decision table exists
  unblock_condition: complete the per-action execution seam and add the backing decision-storage migration/DDL
  status: blocked
  owner_step: section-06 follow-up
  notes: helper-layer artifact builders and integrity verification are implemented

- task_id: sec06-live-incident-plumbing
  section: section-06-audit-observability-and-incident-controls
  task: wire kill switches, deny overrides, and approval revocation into live executor dispatch and approval polling
  blocked_by: missing live execution callback and browser-specific approval endpoint plumbing
  unblock_condition: connect runtime dispatch and approval status flows to the shared browser-policy helpers
  status: blocked
  owner_step: section-06 follow-up
  notes: fail-closed incident helper logic exists, but runtime invocation does not

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
