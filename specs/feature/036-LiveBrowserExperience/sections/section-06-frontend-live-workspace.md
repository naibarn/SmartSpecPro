# Section 06: Frontend Live Workspace

## Goal

Extend the existing automation entry flow and deliver a usable live workspace UI that makes browser state, ownership, approvals, assists, and reconnect behavior explicit and accessible.

## Scope

- Add `Run in Live Mode` to the existing automation flow.
- Transition into a session-backed live workspace after creation.
- Build viewport, chat, timeline, assist/approval rail, and takeover toolbar components.
- Handle reconnect, degraded states, responsive behavior, and accessibility requirements.
- Keep non-live automation behavior intact when live mode is not used.

## Implementation Work

1. Extend the automation modal and page flow to create live sessions and route into a live workspace state.
2. Add a session-aware frontend state model that tracks `sessionId`, `sessionVersion`, control mode, token state, reconnect state, pending approvals, pending assists, and terminal conditions.
3. Build the live workspace UI composition with explicit ownership indicators and blocking state banners.
4. Implement refresh/reconnect behavior so the user returns in observer mode first and reacquires control only when allowed.
5. Add mobile and tablet degradation rules that suppress takeover while preserving read-only command and approval/assist handling.
6. Ensure screen-reader announcements and keyboard support exist for all non-canvas controls.

## Tests To Write First

- Test: `Run in Live Mode` launches the live-session path from the automation modal.
- Test: live workspace renders the correct state for provisioning, ready, agent running, waiting for human, human controlling, reconnecting, expired, and blocked states.
- Test: ownership badges and banners update correctly from replayed or live events.
- Test: refresh returns the session in observer mode first.
- Test: mobile/tablet layouts disable takeover while preserving approval and assist interactions.
- Test: accessibility announcements fire for approval requests, assist requests, reconnect states, and ownership changes.
- Test: non-live automation entry and execution continue to work unchanged.

## Files And Areas Likely Touched

- `apps/web/client/src/components/automation/*`
- new live-browser UI components under `apps/web/client/src/components/`
- state hooks or stores for live sessions
- approval or workflow UI components reused by the live workspace

## Risks And Guardrails

- Do not turn a live-mode failure into an implicit blind-mode execution.
- Keep remote canvas limitations explicit and accessible through surrounding controls.
- Avoid burying controller conflicts or recovery-required states in transient toast notifications.

## Done Criteria

- Live mode launches from the existing automation flow.
- Workspace states are explicit and testable.
- Reconnect and degraded UX are implemented.
- Accessibility and responsive constraints from the plan are covered.

## As-Built

- Actual files changed:
  - `apps/web/client/src/App.tsx`
  - `apps/web/client/src/components/automation/AutomationChatModal.tsx`
  - `apps/web/client/src/components/automation/AutomationPreviewPanel.tsx`
  - `apps/web/client/src/components/automation/LiveBrowserWorkspace.tsx`
  - `apps/web/client/src/components/automation/__tests__/AutomationChatModal.test.tsx`
  - `apps/web/client/src/pages/AutomationPage.tsx`
- Deviations from plan:
  - The first live workspace delivery still renders inline inside `AutomationChatModal` after route handoff, rather than promoting the whole workspace into a dedicated standalone page.
  - Reconnect behavior is implemented with explicit refresh and polling-driven session resync first; full event-stream hydration remains a later follow-up.
- Tests added/updated:
  - `apps/web/client/src/components/automation/__tests__/AutomationChatModal.test.tsx`
- Known follow-ups:
  - Promote the inline live workspace into a dedicated route-owned page once the provider viewport and replay stream are ready.
  - Replace polling-first live updates with the planned event-stream transport once provider streaming is available end to end.
