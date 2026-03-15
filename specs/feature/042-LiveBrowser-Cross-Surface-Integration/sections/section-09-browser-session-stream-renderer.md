# Section 09 - Browser Session Stream Renderer

## Goal

Upgrade the Browser Session workspace from a summary shell into a live rendered browser viewport that supports observe and takeover flows.

## Scope

- Render the remote browser stream with existing viewer and controller token contracts.
- Support observe mode, takeover mode, reconnect fallback, and token refresh.
- Keep compact layouts observe-only in this phase.
- Preserve existing approval, assist, and return-navigation controls.

## Implementation Notes

- Reuse the existing Browser Session route and workspace shell.
- Prefer one renderer abstraction shared by Automation, Chat-origin, and Agency-origin Browser Sessions.
- If stream rendering fails, show an explicit degraded state instead of a silent blank viewport.
- Keep stream token handling separate from product-facing copy and status mapping.

## Files Likely Touched

- `apps/web/client/src/components/automation/LiveBrowserWorkspace.tsx`
- new stream renderer component under `apps/web/client/src/components/automation/`
- `apps/web/shared/liveBrowser.ts`
- `python-backend/app/services/live_browser_runtime.py`

## Tests

- Viewer token renders observe mode successfully.
- Controller token enables interactive takeover mode.
- Token refresh or reconnect updates renderer state without losing the session shell.
- Compact layouts remain observe-only with explicit copy.

## Acceptance

- Users can see the actual remote page state from the Browser Session workspace and take control when policy and layout allow it.
