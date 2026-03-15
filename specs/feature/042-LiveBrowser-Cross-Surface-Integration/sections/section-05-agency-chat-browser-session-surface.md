# Section 05 - Agency Chat Browser Session Surface

## Goal

Make Agency Chat capable of showing Browser Session state as structured UI, not only plain text stream output.

## Scope

- Surface Browser Session status cards or panels in Agency Chat.
- Show shared states such as running, review required, needs user input, person in control, reconnecting, and ended.
- Reuse the shared navigation contract to reopen the Browser Session workspace from Agency Chat.

## Implementation Notes

- Keep Agency Chat primarily conversation-first, but add a structured sidecar or embedded state rail for browser work.
- Review and user-input prompts should be visible and actionable from the conversation surface.
- Avoid duplicating full Automation UI when a lighter summary or reopen action is enough.
- Gate the surface behind `agencyBrowserSessionUi` so builder and chat rollout can be coordinated.
- Compact-layout behavior remains observe-first and should explain why manual control is unavailable.

## Files Likely Touched

- `apps/web/client/src/pages/AgencyChat.tsx`
- related agency activity components
- browser-session summary helpers from section 01
- optional analytics helper wiring for Agency-origin Browser Session events

## Tests

- Agency Chat renders each shared Browser Session state correctly.
- Reopen Browser Session from Agency Chat preserves conversation context.
- Review and user-input prompts use the standardized wording.
- When `agencyBrowserSessionUi` is off, Agency Chat falls back to existing rendering.

## Acceptance

- Users can understand and act on browser-related agency states without relying on free-text explanations alone.
