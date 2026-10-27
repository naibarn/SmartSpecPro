# SPEC-293 Windows Runner Acceptance — 2026-10-27

- Captured: `2026-10-27T03:52:43Z`
- Canonical source SHA: `486339f977c96c351b08f3d0c51753d1723b27da`
- Outcome: **Windows Runner acceptance NOT VERIFIED**. Native Windows CI tests and an unsigned-review build passed, but no currently authorized enrolled Windows Runner host or authenticated owner session was reachable to verify the installed binary or perform device-level lifecycle acceptance.

## Runner and host availability

- Orca reported only the local Linux host; the saved remote environment list was empty. `uname -s` reported `Linux`; the Runner user service was `inactive`; no Windows shell bridge (`pwsh.exe`, `powershell.exe`, `cmd.exe`, or `tasklist.exe`) was available in this session.
- SPEC-224's latest prior authenticated Runner observation was `local-runner`, version `0.2.41`, at `2026-10-26T15:15:24Z`. Its five-minute snapshot expired. A later access recheck returned HTTP 401 for `runnerNodes.list`; current installed version, heartbeat, consent, and project registrations remain unknown.
- No authenticated browser/Playwright session was available. The recorded Runner/workspace API recheck returned HTTP 401. No Runner mutation or DevelopmentRun was sent.
- The approved `runner-release.yml` unsigned-review workflow ran with `publish=false`; it neither signed for distribution, published, nor installed an update.

## Native Windows build and test evidence

- Workflow [40446187471](https://github.com/naibarn/SmartSpecPro/actions/runs/40446187471) completed successfully on `windows-latest` from canonical source SHA `486339f977c96c351b08f3d0c51753d1723b27da`, version `0.2.42`, target `x86_64-pc-windows-msvc`, profile `local_device`, unsigned-review, `publish=false`.
- Native Windows `cargo test --manifest-path apps/runner-app/Cargo.toml` passed: Runner library 199 passed, 0 failed, 2 ignored; integration binaries passed, including desktop workspace binding 4/4 and session-host 8/8. The Windows workspace tests covered authorized root boundaries, Project A/B creation and stable reopen identity, existing-directory import without modifying contents, symlink and junction/reparse escape rejection, legacy registration upgrade/identity, legacy registry loading/migration, interrupted provisioning recovery, and serialized conflicting run candidate applies.
- The Windows build and package steps passed. Uploaded artifact ID `12708521801`; GitHub artifact ZIP SHA-256 `a5932c9fa978e49811cb9060519c150fdfd95b8b315dc97b7fe3623d74a60697`. The downloaded manifest identifies `sourceCommit=486339f977c96c351b08f3d0c51753d1723b27da`, `target=x86_64-pc-windows-msvc`, and `version=0.2.42`. Executable SHA-256: `f2e8477fe2a00dfa48450862a7811e6f23a9ed20f4560c1d8754f664ebfee3a9`.
- This proves that the exact integrated Windows source was tested and built into a Windows executable artifact. It does not prove the enrolled Runner installed or is running that binary.
- Earlier run `40445536323` exposed a Windows-only test assertion bug: JSON-escaped backslash paths were compared as raw text. The task-owned test was corrected to compare parsed `localPath` with the serialized canonical path in commit `486339f`; the full native Windows run above passed afterward.

## Independent checks and consumer seam

- Linux Runner tests at source SHA `4962028ca3d06897d4d7262f75d151ed913870cd`: `cargo test --manifest-path apps/runner-app/Cargo.toml -- --quiet` passed (217 passed, 0 failed, 2 ignored; desktop workspace binding 4/4; session-host integration 8/8). The final Windows-only JSON assertion adjustment was separately verified by the Linux desktop binding integration test 4/4 at `486339f`.
- Web runner contracts, Runner workspace projection, project presentation identity, and Task Control panel at source SHA `805d9b125ff86fd1d8043019bbf446e79e0ac4bb`: 4 Vitest files, 38 tests passed. No authenticated Playwright UI check was possible.
- SPEC-293 remains the workspace authority. SPEC-224 consumes the existing seam: resolve authorized source `workspace_ref`, identify the job and attempt, use protected candidate create/reattach/apply for `(jobId, attempt)`, register the execution workspace through the SPEC-293 registry, and project only workspace/run IDs, attempt, source workspace ID, optional project ID, and lifecycle to Task Control. Local filesystem paths are not projected. SPEC-224 dispatch, settlement, Final Verify, and execution state machine were not changed.

## Remaining acceptance

A fresh authenticated session to the registered Windows Runner is required to verify its installed build and perform actual authorized root registration, Project A/B creation and reopen after restart, import/legacy compatibility, traversal and junction rejection, concurrent-write/CAS rejection, interrupted provisioning recovery, sanitized Task Control facts, and the SPEC-224 consumer flow. Keep Windows Runner acceptance **NOT VERIFIED** until those device-level facts are observed. The build artifact is not installed; the last recorded installed version `0.2.41` is stale and unverified.
