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
