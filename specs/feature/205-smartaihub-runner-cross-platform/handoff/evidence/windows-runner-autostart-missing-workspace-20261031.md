# Windows Runner autostart with missing saved workspace

- WorkUnit: `SPEC205_WINDOWS_RUNNER_AUTOSTART_MISSING_WORKSPACE_20261031`
- Integrated source: `origin/main` at `9503ac2a23fd7d9cc4cf5d4b81c31474f70e83a0`.
- Owner diagnostic: app `0.2.56`, built `2026-10-31T12:23:03Z`, generated `2026-10-31T12:47:10Z` (UTC). It confirms `hasStoredConnection=true`, the same enrolled Runner ID, Developer target `https://aimarkethubs.com`, and `running=false`. The access token was still valid until `2026-10-31T13:00:37Z`; `lastErrorCode` was `RUNNER_WORKSPACE_NEEDS_RESELECT`, while no credential refresh error was reported. Thus this specific startup failure is a missing/unresolvable saved default workspace, not evidence that the website target or stored connection was forgotten or that the token had already expired. The report does not prove an actual refresh attempt or post-expiry recovery.

## Repair

- Desktop autostart no longer treats a missing/moved saved default workspace as a reason to abort the Runner control loop. It clears the stale default-workspace environment selection, keeps the workspace error visible, and still starts the normal authenticated Control Plane connection. The stale path is not reused or granted access.
- When heartbeat confirms the connection, the UI now reports that the Runner is connected while separately explaining that a replacement Workspace must be selected before local work that requires one.
- Other non-workspace startup errors remain blocking; valid workspace configuration continues to be selected as before.

## Verification

- Regression tests cover missing, valid, and unset default workspace startup resolution.
- `cargo test --manifest-path apps/runner-desktop/src-tauri/Cargo.toml -- --test-threads=1` — 17 passed.
- `cargo fmt --manifest-path apps/runner-desktop/src-tauri/Cargo.toml -- --check`, `node --check apps/runner-desktop/ui/app.js`, and `git diff --check` — passed.
- The source is integrated on `origin/main`; use the authenticated Runner Releases page to build/download the review installer. No installer was built in this work.

## Acceptance pending

The owner's current `0.2.56` installation predates this fix and still needs a release built through the web flow. After installing over the existing app, verify that opening with an unresolved default workspace still authenticates and heartbeats, select a valid workspace before workspace-dependent work, then verify token refresh after a real/safely controlled near-expiry condition and long-idle recovery. Keep runtime/24-hour acceptance pending until observed on the existing Runner ID. No re-enrollment or credential bypass is part of this repair.
