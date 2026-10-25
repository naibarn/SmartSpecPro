# Runner Desktop responsiveness checkpoint — 2026-10-25

## Source and installed-version comparison

- The user-reported Windows x64 Runner v0.2.36 matches the GitHub Actions unsigned-review artifact from run [39180639819](https://github.com/naibarn/SmartSpecPro/actions/runs/39180639819), source commit `3c44e4353f241d46c1a0a87bf76e2fac54a744a4`, artifact SHA-256 `283c348f2d2e217054323b8088097314072406ffdcc8ca5fa18656b14bb448e7`.
- The artifact manifest identifies `x86_64-pc-windows-msvc`, version `0.2.36`, and `unsigned-review`. The installed Windows machine itself was not accessible to inspect its file hash.
- The four requested source files at that v0.2.36 build commit are byte-for-byte unchanged at pre-fix canonical baseline `b07eba2d6`; the symptoms therefore reproduce against the current source before this checkpoint.

## Confirmed causes and implementation

- The shared disabled-button CSS used `cursor: wait`, so controls disabled because Runner was running looked busy. The UI now uses a neutral not-allowed cursor and adds a spinner only while an operation is pending.
- `stop_runner` ran synchronous lifecycle shutdown and joined the worker on its command path. Shutdown now runs off the UI thread, signals cancellation immediately, waits with a 30-second bound, and keeps `running`/`stopping` observable if the control worker or its child processes have not exited. The worker handle is retained on timeout and joined only after completion.
- Five-second status polling could overlap workspace/status refreshes and allow older replies to repaint newer state. Status requests are single-flight, coalesce one follow-up poll, and use a UI revision guard. Ordinary status refresh no longer rescans tools.
- Codex version/authentication probes could establish `Ready` without a completed model task. Readiness now records version, authentication, real task-probe evidence, capability publication acknowledgement, and authorized execution separately. A current, session-bound real task probe is required for ready execution evidence; responses and credentials are not persisted in the proof cache.
- Credential refresh continues through the stored connection in `load_or_refresh` without re-pairing. Status renewal runs off the UI thread. The active WSS transport detects stored-token rotation, rebuilds token-bound device proof, invalidates old capability acknowledgement, and republishes the current snapshot.

## Verification evidence

- Linux focused checks passed at implementation commit `1e2d03b90b8de561835ca73fedbb5b800271c8e5`: Desktop `cargo check`; Runner task-evidence, Codex readiness, session-bound evidence, and rotated-transport tests; JavaScript syntax; and Web Runner contract/control tests (38/38).
- A new loopback refresh test passed on canonical commit `2656a487f0c4b576833be3338a98095703c6ebc4`; the `connection::tests` suite passed 11/11. It verifies the stored refresh token is used, both tokens and the runner session rotate in place, and no pairing call is needed.
- Windows x64 run [40202174814](https://github.com/naibarn/SmartSpecPro/actions/runs/40202174814) passed the Runner release UI/API checks, native Runner boundary suites, Desktop workspace-binding test, and NSIS build. It produced unsigned-review Runner `0.2.37`, source commit `1e2d03b90b8de561835ca73fedbb5b800271c8e5`, installer SHA-256 `c3e0f5b68170f030a4a41f734cbacb5e42a02dfcb7b8c7d2cb98cfded580e468`.
- The local GNU Windows cross-check was unavailable because `x86_64-w64-mingw32-gcc` is absent. The hosted Windows compile, tests, and installer succeeded.
- Interactive Windows UI acceptance was not run: this execution environment has no Windows Desktop session. The new installer has not been installed on the affected machine. No real Codex task, live Control Plane capability acknowledgement, idle resource measurement, or duplicate-registration check was performed on that machine.

## SPEC-224 continuation

- Keep `SPEC224_CORE_RUNNER_REV24_LIVE_ACCEPTANCE` as the next ready WorkUnit. Personal Mini-App V1/V2 pilot and generic Mini-App work remain closed.
- The original live DevelopmentRun and protected Runner E2E remain unverified. Continue when the existing Windows `local-runner` is available on its already-enrolled identity/workspace and an authenticated non-production tenant owner creates the real run-bound grant. Install the review artifact only on that existing machine while preserving its stored connection and workspace registry; do not pair a second Runner or invent a task result/grant.
- Current implementation evidence does not establish Codex task readiness or live Control Plane capability readiness. The next live run must execute the configured Codex harness task probe, receive an acknowledged capability snapshot, and then exercise the existing SPEC-224 run/job path.

## Exact-SHA handoff freshness

- `git diff --exit-code 65644d583564f31e9d39376c8cff57f8e53c3df8 2656a487f0c4b576833be3338a98095703c6ebc4 -- apps/web/server/services/__tests__/spec224DevelopmentRunTaskControl.integration.test.ts apps/web/server/services/personalMiniAppPreview.ts apps/web/server/services/miniAppFactoryRuntime.ts specs/feature/224-Autonomous\ Development\ Orchestrator\ Runtime/handoff/evidence/spec224-miniapp-v1-v2-pilot-receipts-20261025.md` passed. The new canonical reconciliation note also records that Final Verify still refuses missing receipts and that no live successful Final Verify occurred.
- These requirement rows were rebound to the current canonical SHA from unchanged implementation/test/receipt paths. No Mini-App code, receipt, or acceptance was rebuilt or rerun; their closed status and the overall SPEC-224 partial status are preserved. `REQ-F12D04357ED8` continues to use the current report's explicit separation of Mini-App, Core, and protected Runner outcomes.
