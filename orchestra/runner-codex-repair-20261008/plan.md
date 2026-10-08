# Runner Codex Repair — WorkUnit Plan

## Task Classification
- Scope: large overall; this checkpoint is a bounded runner-app slice
- Risk: high (local executable discovery and process launch)
- Affected domains: Rust Runner process execution and tool discovery
- Estimated file count: 3 source/test files plus this evidence plan
- Chosen route: direct isolated implementation with focused tests
- Bug route: true
- Classification notes: SPEC-205 defines the existing cross-platform Runner contract. Canonical handoff is unresolved, so this checkpoint preserves `sah-runner-v1` and uses the concrete production dispatch defect evidenced in source.

## Ownership and canonical baseline
- Canonical ref: `origin/main`
- Baseline SHA: `6f16fdcb75b075f35b638d31fbc42d02a1a8bf08`
- Isolated worktree: `/home/dev/worktrees/runner-windows-codex-dispatch-20261008`
- In-scope source ownership: `apps/runner-app/src/{process,adapters,discovery}.rs`
- No active writer found for these exact paths. The `factory-runner-postmerge-handoff` worktree owns factory handoff documentation only.

## Evidence-backed finding
Windows discovery already recognizes `.cmd` and `.bat`, and the adapter smoke test routes them through `cmd.exe`. Production dispatch in `OsProcessHost::spawn` instead calls `Command::new(spec.program)` directly. A discovered `codex.cmd` can therefore pass discovery yet fail to spawn for real jobs. Version probing and smoke verification have a separate launcher helper, so process invocation rules are duplicated. `.ps1` shims are not discovered.

## Requirement-to-test matrix

| Requirement | Observable behavior | Test level and location | RED evidence | GREEN evidence | Residual boundary |
|---|---|---|---|---|---|
| Windows Codex shims use one launch path for version probe, smoke verification, and jobs | `.cmd`/`.bat` use guarded `cmd.exe`; `.ps1` uses PowerShell; native executable receives args directly | Unit: `apps/runner-app/src/process.rs`; Windows-host subprocess fixtures in the same file | Existing `OsProcessHost` uses `Command::new(spec.program)` while smoke probe has a separate shim branch | Focused Rust tests assert selected executable and argument vector; unsafe batch input has a distinct failure code; shell is resolved absolutely from `SystemRoot` | Windows-host fixtures are committed but cannot run on this Linux host; actual Codex auth/job receipt still needs a configured Windows Runner |
| Runner discovers user-level Codex shims | Windows candidate names include `.ps1`, `.cmd`, and `.bat` after native executable options; common per-user roots remain within the scan bound | Unit: `apps/runner-app/src/discovery.rs` executable-name ordering and root merge | `.ps1` and user-level fallback roots were absent | Focused tests check candidate order, default npm/local roots, and scan-limit reservation | A real Windows user's PATH and installation layout remain unverified |
| Job keeps the approved workspace and inherited credentials/config environment | ProcessSpec still carries requested workspace and selected environment | Unit: `apps/runner-app/src/adapters.rs` existing process-spec assertion | Existing behavior is unchanged by design | Existing focused adapter test plus new launcher assertion | Real Codex authentication and artifact receipt require Windows host/job access |

## Verification plan
- `cargo fmt --check --manifest-path apps/runner-app/Cargo.toml`
- `cargo test --locked --offline --manifest-path apps/runner-app/Cargo.toml --lib`
- `cargo check --locked --offline --manifest-path apps/runner-app/Cargo.toml --bin smartaihub-runner`
- `git diff --check`
- Windows real job dispatch, completion receipt, artifacts, auth/error classification, and failure recovery remain external acceptance obligations until an authorized Windows Runner is available.

## Scope boundary and next actions
- This checkpoint fixes only the Windows shim dispatch gap.
- Next after this checkpoint: reconcile the SPEC-205 handoff requirement rows through `tools.spec_handoff` against this SHA; then continue the next ready Linux packaging/service lifecycle unit.
- Do not claim release, deployment, production readiness, or Windows real-runner acceptance from local tests.
