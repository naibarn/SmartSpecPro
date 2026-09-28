# Section 01: Rust health contract

## Ownership

- `apps/worker-app/src-tauri/src/commands.rs`
- Its colocated unit tests.

## Implementation

- Add a serialized health status that distinguishes healthy, transient,
  unavailable, and reconnect-required outcomes.
- Preserve `connected: true` and saved credentials for transient/unavailable
  results.
- Keep explicit auth/device rejections permanent.
- Use bounded retry timing without holding a stale UI error; preserve the
  existing refresh gate and server grace-window behavior.

## TDD acceptance

- Timeout/transport/429/5xx classification is transient.
- 401/403/revoked/device rejection is reconnect-required.
- Health refresh transport error does not clear saved connection.

## Risks

Do not treat the word `device` in a local missing-proof diagnostic as a server
revocation unless the response is an explicit auth/device verdict.
