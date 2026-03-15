# Section 08 - Agency Runtime Browser Session Execution

## Goal

Make the Agency `browser_session` node executable so an Agency Swarm run can create, resume, and hand off Browser Sessions during graph execution.

## Scope

- Add explicit runtime execution for `browser_session` nodes in the Python orchestrator.
- Persist active `browserSessionId` and summary state in agency-run context.
- Emit structured browser-session activity payloads back to Agency Chat.
- Support configured handoff modes:
  - `continue_running`
  - `review_required`
  - `needs_user_input`
  - `take_control`

## Implementation Notes

- Do not overload generic unknown-node fallback behavior.
- Keep the existing Agency builder schema additive and backward-compatible.
- Prefer a dedicated executor helper over embedding Browser Session logic inline in the orchestrator switch.
- Reuse the shared Browser Session summary contract so Agency Chat does not need a second mapping layer.

## Files Likely Touched

- `python-backend/app/services/agency_orchestrator.py`
- `python-backend/app/services/agency_service.py`
- `python-backend/app/services/live_browser_contract.py`
- `apps/web/client/src/pages/AgencyChat.tsx`

## Tests

- `browser_session` node executes instead of falling through to unknown-node handling.
- Agency run context stores and reuses the active `browserSessionId`.
- Handoff modes produce the expected summary state and next action.
- Existing agencies without `browser_session` nodes remain unaffected.

## Acceptance

- Running an agency graph can open and surface a Browser Session without requiring the user to click the Agency Chat toolbar button first.
