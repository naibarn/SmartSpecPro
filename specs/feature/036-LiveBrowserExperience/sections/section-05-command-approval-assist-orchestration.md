# Section 05: Command, Approval, And Assist Orchestration

## Goal

Make live-browser interaction deterministic by defining how commands, approvals, assists, cancelation, takeover, and resume are serialized and how those flows emit durable business events.

## Scope

- Implement single-session command serialization and queue depth enforcement.
- Pause and resume the agent around approvals, assists, and takeover.
- Reuse approval infrastructure with live-specific context anchoring.
- Add assist request lifecycle handling.
- Invalidate queued work explicitly when context changes materially.
- Bind command, approval, and assist context to the active tab or an explicit tab identifier so tab changes never become implicit.

## Implementation Work

1. Add session-scoped command queue behavior with explicit acceptance and rejection rules.
2. Block new agent work while approvals or assists are pending, except for the resolution command and cancelation.
3. Implement `takeControl`, `returnControl`, `pauseAgent`, `approveAction`, `rejectAction`, and `submitAssistResponse` as versioned session mutations.
4. Revalidate policy, DOM fingerprint, URL/origin, and approval freshness before resuming after human intervention.
5. Emit durable events for request creation, resolution, takeover start/end, command invalidation, and session incidents.
6. Ensure command routing, approval context, and assist prompts remain attached to the active tab or explicit tab target, and invalidate stale work when the active tab changes materially.

## Tests To Write First

- Test: only one agent-owned command executes at a time.
- Test: queue overflow returns `command_queue_full`.
- Test: approval and assist pending states block new agent work.
- Test: cancelation preempts queued work and moves the session toward shutdown.
- Test: takeover pauses the agent before controller authority is granted.
- Test: returning control without successful revalidation keeps the session blocked rather than resuming the agent.
- Test: invalidated queued commands emit explicit events rather than disappearing silently.
- Test: approval and assist resolution applies only to the tab context that originated the request, or fails with explicit revalidation when tab context drifted.
- Test: tab switches invalidate or rebind queued work only through explicit session-manager rules.

## Files And Areas Likely Touched

- Python session manager command modules
- approval and assist integration services
- shared event-emission helpers
- Node/Python contract handlers for command responses

## Risks And Guardrails

- Avoid race conditions between approval resolution, cancelation, and takeover.
- Keep human direct input auditable but redacted where needed.
- Do not let queue behavior become implicit or UI-only.
- Do not let active-tab changes silently retarget pending commands, approvals, or assist requests.

## Done Criteria

- Command flow is serialized and explicit.
- Approval and assist lifecycles are integrated.
- Takeover/resume behavior is deterministic.
- Business-event history reflects every consequential orchestration step.

## As-Built

- Actual files changed:
  - `python-backend/app/services/live_browser_session_manager.py`
  - `python-backend/tests/unit/services/test_live_browser_session_manager.py`
- Deviations from plan:
  - The session-manager slice now prioritizes explicit pending-human-input failures for agent-owned commands before the generic waiting-state gate so approval and assist blocking remains auditable and deterministic.
  - Sensitive takeover step-up auth is still deferred; the current section covers deterministic takeover, return-control, approval, assist, cancelation, and tab-drift orchestration inside the authoritative manager.
- Tests added/updated:
  - `python-backend/tests/unit/services/test_live_browser_session_manager.py`
- Known follow-ups:
  - Add the planned step-up auth gate before granting takeover in sensitive flows.
  - Wire the section-05 manager events and approval/assist state into the later frontend workspace and operational telemetry surfaces.
