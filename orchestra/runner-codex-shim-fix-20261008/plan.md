# Runner Codex Windows npm shim repair

## Evidence ledger

- Source: attached Runner debug JSON `runner-debug-1791444194817.json`.
- Observation: Codex was discovered at `<USER_HOME>\\AppData\\Roaming\\npm\\codex`; its `testReasonCode` is `probe_launch_failed`, and its version is null.
- Environment: Windows x86_64; the npm roaming directory is present in PATH; credentials are stored and token refresh has no reported error.
- Root cause: Windows discovery ranks the extensionless npm alias before `codex.cmd`; the process launcher can wrap `.cmd`/`.ps1` shims but sends extensionless paths directly to Windows process creation.
- Separate unresolved evidence: `runner.lastErrorCode=RUNNER_OPERATION_FAILED` is generic in this report and has no operation detail to correlate with the Codex probe.
- Confidence: high for Codex probe launch failure because the reported selected path and exact code match source behavior. Real Windows verification remains required.
- Windows verification uncovered a separate test-only baseline compile error: Linux-only `build_local_session_inventories` and `MAX_SAFE_JS_INTEGER` were imported unconditionally by the shared diagnostics test module (`E0432`). The production calls and test are Linux-gated; their imports now use the same gate so Windows can execute the platform suite.
- Second Windows run compiled the suite and passed the shim discovery test, then reported four existing Windows portability failures: `cmd.exe` shim execution (now includes stdout/stderr in assertion), two session-registry directory fsync failures (gated to Unix, matching checkpoint storage), and a verbatim-path comparison in a Spec 224 test (expected path now canonicalized).

## Scope and completion predicate

Change Windows CLI discovery so native executables and supported Windows shims take precedence over extensionless aliases, preserve Unix discovery behavior, prove a directory containing both `codex` and `codex.cmd` selects `codex.cmd`, and get the existing Windows Runner test suite past platform-specific baseline failures. Keep Runner protocol and auth behavior unchanged.

## Work unit

- Owner: conductor
- Base: `origin/main` at `5f965b9cccbe8849263b177cd0b41514372f4191`
- Owned paths: `apps/runner-app/src/discovery.rs`, this task's scoped Orchestra evidence
- Verification: focused regression test, full `cargo test --manifest-path apps/runner-app/Cargo.toml`, `cargo fmt --check`, Windows-hosted Runner workflow with publish disabled.
- Residual proof: the user's Windows machine must install a post-fix build and export a fresh debug file before Codex task execution is accepted as fixed.

## Loop policy

- Iterations: 1/12
- Tool-call batches: within 30; exact cost telemetry unavailable
- Dispatch waves/subagents: 0; direct scoped implementation
- Repair rounds: 1/5 (test exposed expected stale candidate ordering; implementation now matches intended Windows ordering)
- Stop reason: continue until canonical integration and Windows hosted verification are recorded
