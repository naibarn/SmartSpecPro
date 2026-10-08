# Runner Windows Codex Shim — 10 Review Rounds

Review baseline: `origin/main` at `6f16fdcb75b075f35b638d31fbc42d02a1a8bf08`.
Final focused evidence: `cargo test --locked --offline --manifest-path apps/runner-app/Cargo.toml --lib` — 153 passed; `cargo check --locked --offline --manifest-path apps/runner-app/Cargo.toml --bin smartaihub-runner` — passed; `cargo fmt --check` and `git diff --check` — passed.

| Round | Gap checked | Result and disposition |
|---|---|---|
| 1 | Production job path versus CLI shim type | Found `OsProcessHost` launching `.cmd` directly despite discovery and Verify using `cmd.exe`; unified launcher in `process.rs`; process tests pass. |
| 2 | Version diagnostics using a different launcher | Reused shared launcher in bounded version probe; full Runner library suite passes. |
| 3 | Verify smoke test launcher drift | Reused the shared launcher and maps unsupported batch arguments to a fixed error code; adapter tests pass. |
| 4 | PowerShell-only npm shim installation | Added `.ps1` discovery and argument-vector PowerShell invocation; launcher tests pass. |
| 5 | Windows shell injection through `.cmd`/`.bat` arguments or executable path | Found unsafe command-string boundary; added fail-closed metacharacter check and distinct `RUNNER_PROCESS_CMD_SHIM_UNSAFE_ARGUMENT`; negative tests pass. |
| 6 | Default user-level installation roots when GUI PATH is stale | Added `%APPDATA%\\npm`, profile-derived roaming npm fallback, and `%USERPROFILE%\\.local\\bin`; root tests pass. |
| 7 | User roots lost when PATH reaches scan bound | Found appended roots could be truncated; reserved scan capacity for fallback roots; boundary test passes. |
| 8 | Native executable and argument preservation | Native Windows executable bypasses shells; PowerShell keeps spaced arguments as separate argv entries; tests pass. |
| 9 | Workspace-controlled shell executable resolution | Found `cmd.exe`/`powershell.exe` could resolve against the job working directory; changed both to absolute paths under `%SystemRoot%\\System32` and added a missing-SystemRoot error test. |
| 10 | Cross-platform regressions, environment inheritance, and release/runtime proof boundary | Rechecked that working directory and inherited environment are preserved, no secrets are logged, and Linux direct launch is unchanged. Final package suite and binary check rerun after round 9. Actual Windows shell, real job receipt/artifacts, live device version/catalog, signed Linux release, and physical Linux service remain unverified and are not claimed. |

All discovered code gaps in these rounds were repaired and the package checks were rerun after the last change. This review closes only the Windows shim invocation slice; it does not close the parent Runner outcome.
