# Section 02 - Navigation And Origin Return Contract

## Goal

Make Browser Session launch and close behavior origin-aware so users return to the correct screen after leaving the browser workspace.

## Scope

- Replace hardcoded `/dashboard` close behavior in `AutomationPage.tsx`.
- Add origin metadata to Browser Session launch paths.
- Preserve direct deep-link resume behavior for copied URLs and recovery flows.
- Define fallback behavior when origin state is stale or unavailable.
- Confirm the chosen Chat model is the existing full-page Browser Session route with return metadata rather than a second side-panel browser implementation.

## Implementation Notes

- Prefer a simple, explicit contract such as route state or `returnTo` query metadata.
- Ensure Chat, Agency, and Workflow can all open the same Browser Session route.
- Keep resume URLs stable and safe if parent screens are unavailable.
- Avoid creating separate navigation logic per surface.
- Include explicit fallback precedence: valid origin route, surface default, then dashboard only as last resort.
- Preserve enough restore state to return users to the correct thread, panel, or execution focus.

## Files Likely Touched

- `apps/web/client/src/pages/AutomationPage.tsx`
- `apps/web/client/src/App.tsx`
- Browser Session launch call sites in Chat, Agency, and Workflow surfaces

## Tests

- Close from Chat returns to the same chat thread.
- Close from Agency returns to the same agency conversation.
- Close from Workflow returns to the same editor or execution context.
- Direct `/automation/live/:sessionId` open without origin still works.
- Compact-layout launches still reopen correctly in observe-first mode.

## Acceptance

- Browser Session close behavior is correct for every supported launch surface.
- No supported launch path depends on a dashboard-only fallback when valid origin context exists.
