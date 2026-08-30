# Section 02: Worker App UI recovery

## Ownership

- `apps/worker-app/src/main.tsx`
- Any small pure status-mapping helper extracted beside it.

## UI/UX Contract

- Target user: a creator leaving Worker App running unattended to receive render
  jobs.
- Surface inventory: connection status card, native dialog, reconnect button,
  last-check/expiry line.
- State matrix: checking, connected, reconnecting, unavailable, and permanent
  reconnect-required; preserve the existing ready/render-paused states.
- Copy: use calm English copy already used by this app; transient text must say
  `Smart AI Hub is temporarily unavailable. Retrying automatically...` and must
  not say that the saved connection is no longer accepted.
- Accessibility: status uses the existing semantic status region; no modal is
  opened for transient states; buttons remain keyboard accessible.
- Responsive/browser evidence: run Worker App typecheck and source tests;
  manual Windows/Tauri browser evidence remains a release-boundary check.

## Implementation

- Map transient health to reconnecting without native error dialog.
- Retry fast health checks until the two-minute budget, then show non-blocking
  unavailable status and retain the connection.
- On healthy response, set connection state back to connected and clear the
  transient message.

## Acceptance

- One timeout cannot leave a sticky reconnect-required state.
- Recovery requires no user click.
- Permanent credential rejection still gets one de-duplicated dialog.
