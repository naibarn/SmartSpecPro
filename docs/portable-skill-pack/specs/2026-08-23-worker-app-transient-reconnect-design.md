# Worker App transient reconnect design

## Goal

Make short Smart AI Hub outages, service restarts, network failures, 429s, and
5xx responses recover automatically without a native error dialog or a manual
Worker App reconnect. Preserve the saved connection and running worker loop.
Only show a reconnect-required error for an explicit credential/device verdict.

## Approved behavior

- Auto-recovery budget: 2 minutes from the first transient health failure.
- Transient failures: request timeout, connection failure, HTTP 429, HTTP 5xx,
  and equivalent unavailable control-plane responses.
- Permanent failures: HTTP 401/403, revoked/expired refresh token, invalid
  worker binding, device mismatch, or an explicit server-side connection block.
- During recovery the UI says that it is reconnecting and continues to retain
  the saved connection. It does not show a native error dialog.
- A successful probe or refresh returns the UI to Connected automatically.
- After the 2-minute budget, the UI reports that Smart AI Hub is still
  unavailable and offers a retry/reconnect action, but does not delete saved
  credentials unless the server explicitly rejected them.

## Architecture

The Rust command returns a typed health classification in addition to the
existing connection fields. Probe transport failures remain transient instead
of being converted into `healthy: false` credential verdicts. Refresh failures
are classified using the same boundary. The existing 60-second server refresh
reuse grace window protects the ambiguous case where a request timed out after
the server issued replacement tokens but before the client received them.

The React layer maps the typed status to four user-visible states:

| Internal status | User state | Dialog | Saved connection |
| --- | --- | --- | --- |
| healthy | Connected | none | retained |
| transient | Reconnecting automatically | none | retained |
| unavailable | Server unavailable | no blocking error dialog | retained |
| reconnect_required | Reconnect required | error dialog once per reason | clear only for explicit invalidation |

When health returns to healthy, the React state must explicitly reset from
`error` or `reconnecting` to `connected`; clearing only the alert de-duplication
key is insufficient.

## Failure handling

The Worker App must never infer credential invalidation from a timeout. The
worker loop may continue using valid cached execution/upload tokens while the
control-plane health probe retries. A permanent auth response remains blocking
because continuing to claim work with rejected credentials is unsafe.

## Testing and rollout

- Add Rust unit coverage for transient classification and permanent rejection.
- Add React/source-level coverage for the status mapping, automatic recovery,
  and the absence of a native error dialog for transient failures.
- Run Worker App typecheck and focused Rust tests. Run the full Worker App test
  suite if the focused checks pass.
- Do not change server auth or migrations in this task. Deployment and manual
  Windows/Worker App acceptance remain separate release-boundary checks.
