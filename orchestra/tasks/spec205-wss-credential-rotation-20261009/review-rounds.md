# SPEC-205 Focused QA/Security Reviews

Review candidate: `481a9f665dfb9b06de0d78ad44580cc0cb9bfa48` plus the task worktree delta.

| Pass | Review surface | Result / evidence |
|---|---|---|
| 1 | Credential disclosure | Diagnostics contain revision/timestamps/status only; no token, private key, proof assertion, or raw server body. The rotation test asserts token bytes are absent from exported diagnostics. |
| 2 | Session rebinding | Session identity is compared with the original stored binding; mismatches return `RUNNER_CREDENTIAL_SESSION_BINDING_MISMATCH` and never replace transport credentials. Covered by `changed_session_or_tenant_fails_closed_without_replacing_current_credentials`. |
| 3 | Tenant rebinding | Tenant binding and token tenant claims are rechecked before replacing token/proof. Same fail-closed test covers tenant mismatch. |
| 4 | Expiry / malformed token | Latest token must remain valid for at least 60 seconds; malformed/expired tokens do not replace the active transport. Covered by invalid and missing/expired credential tests. |
| 5 | Device proof coupling | New proof is rebuilt from the persisted device identity and new token; loopback verifies its signature against B's `jti`. Covered by `active_loop_transport_reads_rotated_connection_and_rebuilds_token_bound_device_proof`. |
| 6 | WSS socket lifetime | Socket reset is coupled to `replace_credentials`; test observes A, A after socket-only close, then B after replacement. `active_transport_reauthenticates_after_credentials_are_rotated` proves close-only is insufficient. |
| 7 | Refresh/read race | Credential state is checked before and after blocking receive; a command read across rotation is discarded before parse/ack/execution. Existing journal remains the idempotent replay authority. |
| 8 | Capability freshness | Credential revision change forces a new capability publication; its acknowledgement time is reset on rotation and recorded only after accepted/applied/duplicate ack. |
| 9 | Active process safety | Credential store/binding/validity errors cancel active external processes before the control loop returns. `credential_authority_failures_cancel_active_processes` covers fatal code classification. |
| 10 | Idle and transient errors | Normal WSS read timeout remains `Idle` and is not recorded as runtime failure; transient network errors remain distinct from credential authority failures. |
| 11 | Atomic store replacement | Four bounded reads tolerate the Desktop remove/rename gap; malformed persisted data and exhausted retries fail closed. No unbounded wait or lock added. |
| 12 | Repeat rotation/restart | Repeated rotations advance only the process-local revision; restart loads the latest persisted authenticated connection. Covered by `repeated_rotations_advance_revision_and_restart_uses_latest_persisted_token`. |

Final focused verification: `cargo test --manifest-path apps/runner-app/Cargo.toml` — 173 unit tests and 8 integration tests passed (181 total). `cargo fmt --manifest-path apps/runner-app/Cargo.toml` and `git diff --check` passed.

Not established by these reviews: installed Windows Runner acceptance, backend/session continuity on the production host, or SPEC-224 dispatch authorization. Those gates remain separate and protected.
