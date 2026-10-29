# Section 01 — Runner Copilot adapter

- **Requirement IDs:** R1, R2, R4, R7
- **Objective:** Implement the official SDK-backed Copilot Runner adapter with truthful discovery, dynamic models, bounded session lifecycle, safe event normalization and fail-closed permission mediation.
- **Owned scope:** Runner manifest/lockfile and relevant adapter, discovery, execution, and focused tests. Do not modify unrelated Runner modules.
- **Prerequisites:** Verify exact APIs and MSRV of the official SDK version; check platform target compatibility.
- **Completion predicate:** absent/unauthenticated/incompatible Copilot never appears ready; authorized adapter operations are lease/workspace scoped; model and event data are dynamic/redacted; unsafe tools are denied.
- **Verification:** focused `cargo test --manifest-path apps/runner-app/Cargo.toml` and any scoped formatting/compile check.
- **Expected evidence:** SDK version and API inspected, probe/model/event/permission/session tests pass.
- **Fallback:** no guessed SDK protocol, ambient login, auto-install or approve-all; return an explicit unavailable/unsupported state.
- **Blocker challenge:** retry with verified official version and supported platform targets; isolate unsupported capability without affecting existing providers.
- **Waiting/reactivation:** live auth is not required for offline tests; re-run live probe only after authorized Copilot credentials/runtime are made available.
