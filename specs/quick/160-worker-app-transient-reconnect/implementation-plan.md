# Implementation plan

## Objective

Separate transient control-plane availability failures from permanent worker
credential rejection, retry transient health checks automatically for two
minutes, and restore the connected UI state after recovery.

## Work items

1. Extend the Rust health response with a stable status classification while
   keeping existing fields compatible.
2. Add a Rust helper that classifies timeout, transport, 429, and 5xx errors as
   transient; keep 401/403/revoked/device-block errors as permanent.
3. Update the health command to return transient/unavailable states instead of
   `healthy: false` for transport failures.
4. Update the React health effect and connection status mapping to show
   reconnecting/unavailable copy, suppress the native error dialog for those
   states, retry within the two-minute budget, and reset to connected on success.
5. Add focused Rust tests and deterministic UI/source tests for the mapping and
   recovery transitions.

## Risks and mitigations

- A refresh timeout may have committed on the server: keep the token and rely
  on the existing 60-second replay grace; never clear credentials from a
  transport error.
- A genuine revoked token must not be hidden: classify only explicit auth
  status/messages as permanent.
- A stale UI error may remain after recovery: assert the success transition
  explicitly sets `connectionState` to `connected`.
- Long outages should not create an infinite blocking modal: stop the fast
  retry budget after two minutes and expose a non-destructive unavailable state.

## Acceptance criteria

- A 30-second request timeout never opens the reconnect-required native dialog.
- Transient status retries automatically and recovers without browser approval.
- A successful health response clears `error`/`reconnecting` state.
- A 401/403/revoked/device mismatch still shows reconnect required.
- Saved connection data is retained through transient and unavailable states.
- Focused tests, Worker App typecheck, and the full Worker App Rust suite pass.
