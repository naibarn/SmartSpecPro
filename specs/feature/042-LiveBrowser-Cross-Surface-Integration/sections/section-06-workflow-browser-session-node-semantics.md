# Section 06 - Workflow Browser Session Node Semantics

## Goal

Upgrade Virtual Workflow so browser collaboration is represented as explicit workflow semantics rather than a one-shot automation block.

## Scope

- Add an additive browser-session node family:
  - `browser_session_start`
  - `browser_session_instruction`
  - `browser_session_wait_for_user`
  - `browser_session_review_gate`
- Support start, wait, instruction, and resume behavior through explicit node composition.
- Keep existing saved workflows compatible.

## Implementation Notes

- The workflow editor already supports registry-driven input rendering, so the main work is in backend node contracts and execution behavior.
- The chosen direction is additive semantics over destructive replacement.
- Use stable, user-meaningful field names for node inputs and outputs.
- Ensure workflow execution logs can communicate browser-session state clearly.
- Keep legacy `web_automation` for one-shot automation and existing saved graphs.
- Prefer load-time normalization, version-aware serialization, and runtime fallback over bulk migration scripts.
- Gate new nodes behind `workflowBrowserSessionNodes`.
- Start with the following baseline contracts:
  - `browser_session_start`
    - inputs: `goal`, `startUrl`, `launchContext`
    - outputs: `browserSessionId`, `sessionStatus`, `browserSessionSummary`
  - `browser_session_instruction`
    - inputs: `browserSessionId`, `instructionText`
    - outputs: `browserSessionId`, `sessionStatus`, `browserSessionSummary`
  - `browser_session_wait_for_user`
    - inputs: `browserSessionId`, `waitReason`, `timeoutSeconds`
    - outputs: `browserSessionId`, `sessionStatus`, `pendingUserStep`
  - `browser_session_review_gate`
    - inputs: `browserSessionId`, `reviewReason`, `reviewSummary`
    - outputs: `browserSessionId`, `sessionStatus`, `reviewState`
- Expose explicit branch fields for downstream nodes:
  - `sessionStatus`: `running`, `waiting_for_user`, `review_required`, `completed`, `failed`, `expired`
  - `reviewState`: `not_required`, `pending`, `approved`, `rejected`
  - `pendingUserStep`: `{ type, reason, expiresAt, resolved }`
  - `outcome`: `continue`, `wait`, `approve`, `reject`, `fail`
- Downstream branching must use these explicit fields rather than parsing human-readable text.

## Files Likely Touched

- `python-backend/app/orchestrator/node_registry.py`
- `python-backend/app/orchestrator/node_executors/web_automation_executor.py`
- `apps/web/client/src/pages/WorkflowEditor.tsx`
- `apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx`

## Tests

- Contract tests for new browser-session workflow semantics
- Compatibility tests for existing one-shot `web_automation`
- UI tests for node configuration rendering if new inputs are introduced
- Flag-gated visibility tests for new nodes
- Serializer or loader normalization tests for saved workflows
- Branch-field tests for `sessionStatus`, `reviewState`, `pendingUserStep`, and `outcome`

## Acceptance

- Workflow authors can model collaborative browser flows without losing support for existing automation graphs.
