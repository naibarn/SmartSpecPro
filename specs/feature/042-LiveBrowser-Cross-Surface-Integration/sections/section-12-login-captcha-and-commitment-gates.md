# Section 12 - Login, Captcha, And Commitment Gates

## Goal

Make high-friction and irreversible browser barriers explicit so the product can safely pause AI progress and require the right human action.

## Scope

- Add explicit barrier types for:
  - login required
  - captcha required
  - payment review required
  - booking confirmation required
- Map those barriers into the shared Browser Session presentation layer.
- Require human takeover or explicit approval before irreversible submit actions.
- Preserve existing MFA step-up and sensitive-page takeover rules.

## Implementation Notes

- Barrier type should be durable runtime data, not inferred from copy alone.
- Captcha should always block autonomous continuation.
- Payment and booking confirmation should act as commitment gates even if the page is otherwise controllable.
- Keep barrier-aware logic compatible with Chat, Agency, and Workflow branching semantics.

## Files Likely Touched

- `apps/web/shared/browserSession.ts`
- `apps/web/client/src/components/automation/LiveBrowserWorkspace.tsx`
- `python-backend/app/services/live_browser_session_manager.py`
- workflow or agency branching helpers

## Tests

- Barrier states map to the correct user-facing copy and branch values.
- Captcha pauses AI progress and requests a human action.
- Payment or booking confirmation cannot continue without explicit confirmation.
- Existing MFA takeover behavior continues to work on auth or financial pages.

## Acceptance

- The product explains why automation paused on login, captcha, payment, or booking steps and does not allow AI-only continuation through irreversible actions.
