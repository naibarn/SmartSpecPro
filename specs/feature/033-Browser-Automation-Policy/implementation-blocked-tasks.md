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
