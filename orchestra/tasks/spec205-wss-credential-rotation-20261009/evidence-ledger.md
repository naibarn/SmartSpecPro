# SPEC-205 Evidence Ledger — WSS Credential Rotation

**Source SHA:** `481a9f665dfb9b06de0d78ad44580cc0cb9bfa48`

| Evidence | Observation | Confidence / boundary |
|---|---|---|
| User-supplied Windows/Control Plane incident | Backend source `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978` rejected an event at `2026-10-09 20:10:09.832694 Asia/Bangkok` for expired access token. Previous token expired 20:10:07; Desktop debug reported a renewed expiry at 20:24:12. | Strong temporal correlation; incident event is not bound to a credential revision or WSS handshake ID. Do not claim historical causality from timing alone. |
| Current Runner loop source | `connection_status_inner` loads `StoredRunnerConnection` and constructs `NativeControlTransport` once. `run_live_control_loop` receives fixed `&access_token`; keepalive and capability refresh reuse that value/transport. | Direct source finding; exact locations are in `diagnostics.rs`. |
| Current transport source | `NativeControlTransport` owns `access_token`, `device_proof`, and optional WSS socket. A reconnect calls `connect_wss` on the same transport. | Direct source finding; closing only the socket does not replace token or proof. |
| Backend source at user-supplied deployed SHA | WSS message validation uses the token stored in socket authentication context and revalidates it for capability/reconcile events. Current main differs from `ccd4cd11` in refresh error classification, not the relevant WSS token binding. | Source-level comparison; deployed process was not read in this WorkUnit. |
| Ownership scan | 151 registered worktrees scanned for dirty/staged changes in the three authorized files; none found. Related PRs #337/#341/#348/#379 are merged; no open Runner PR found. | Current repository scan only. |

## New deterministic evidence

- Local loopback WSS test reproduces A rejected → credential store rotates to B → active transport reauthenticates with B and receives accepted acknowledgement. It validates B's token-bound device-proof signature. The session remains the same.
- Separate transport test proves closing only the WSS socket reconnects with A; only explicit token+proof replacement reconnects with B.
- Fail-closed tests cover changed session, changed tenant, malformed/expired token, unavailable/invalid store, repeated rotations, and restart loading the latest persisted credential.
- Capability publication is forced after credential revision changes. The existing durable receipt journal remains the source of replay/idempotency; no job is redelivered by the credential handoff itself.
- Credential-authority failure now cancels active external agent processes before the live loop exits. Normal WSS idle is not reported as a runtime failure.
- Desktop Export Debug now includes sanitized credential revision, rotation time, transport recreation, WSS auth acknowledgement, capability acknowledgement, and typed failure/timestamp fields.
- Verification on the task candidate: `cargo test --manifest-path apps/runner-app/Cargo.toml` passed 173 unit tests and 8 integration tests (181 total); `cargo fmt --manifest-path apps/runner-app/Cargo.toml` and `git diff --check` passed.

## Still not established

- Historical incident event is not tied to a credential revision or handshake ID; the incident's exact past cause remains unconfirmed. The deterministic current-code mechanism is reproduced.
- The Desktop Tauri crate and Windows release build have not been built on this Linux host. PR CI/Windows workflow and owner-approved candidate acceptance remain pending.
- No live Windows session, backend logs, production deployment, protected dispatch, or SPEC-224 authorization was touched or accepted.
