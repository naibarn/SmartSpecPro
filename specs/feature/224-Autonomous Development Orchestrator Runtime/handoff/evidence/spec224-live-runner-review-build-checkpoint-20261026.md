# SPEC-224 Live Runner Restoration Checkpoint — 2026-10-26

## Canonical implementation

- `origin/main` and source SHA: `6e0942a4d644247ab2b9d5649682e0a0eca967ab`.
- The Runner workspace fingerprint fix uses the immutable Git tree for clean workspaces, so a clean tracked tree larger than the old 512 MiB content-walk limit can receive a deterministic fingerprint. Focused Rust module tests passed 10/10, including a sparse >512 MiB tracked file and symlink regression. `rustfmt --edition 2021 --check apps/runner-app/src/workspace_registry.rs` passed. Repository-wide `cargo fmt --check` is not clean because of unrelated pre-existing formatting in `apps/runner-app/src/lib.rs`; that file was not changed.
- Focused Mini-App visibility/router/runtime tests passed 29/29. These are local tests, not live public publication/browser evidence.

## Windows Runner observations

Read-only local development database observation at `2026-10-25T19:47:05Z`:

- Existing registration `local-runner`, tenant `tenant-ZCSKEM9s`, owner user ID `1`, Windows x86_64 local device, status online, fresh heartbeat and capability snapshot expiring `2026-10-25T19:52:04Z`.
- Codex CLI `0.161.0` is available and authenticated (`auth_status_ok`), but `taskProbeState=not_run`.
- Browser capability is observed ready. All 11 published capability policy decisions remain `pending`; none is authorized. There are zero `runner_execution_sessions` for this runner.
- Existing workspace registration is present, but its reported source head is `fbd7fd1bd8324973540664d7f7de2bd9e5844757`, it is behind current main, and no content fingerprint is recorded. No DevelopmentRun, worker job, attempt, lease, dispatch receipt, tool receipt, settlement, or Final Verify was created by this checkpoint.

## Review installer

- GitHub Actions run: [40226692138](https://github.com/naibarn/SmartSpecPro/actions/runs/40226692138), conclusion `success`, exact head SHA `6e0942a4d644247ab2b9d5649682e0a0eca967ab`.
- Windows x64 NSIS job passed the native boundary checks, desktop workspace-binding checks, unsigned installer build, checksum manifest, and artifact upload.
- Artifact: `smartaihub-runner-windows-x64-0.2.39-unsigned-review`.
- Installer SHA-256: `dad002cfbe1b55a3596f3f0581f1f29f2f53967731ba2a4953e21b59744566a8`; downloaded artifact checksum verification passed. Manifest marks it `unsigned-review`, not a published/signed release.

## Remaining live acceptance

The only immediate operator step is on the already-enrolled Windows Runner: download and install the 0.2.39 unsigned review artifact over 0.2.38 while retaining enrollment/workspace, then use the Runner UI's `ทดสอบสั่งงานจริง` action on the authenticated Codex row. After its fresh heartbeat/task-probe acknowledgement, sign in to SmartAIHub Chat and start one small reversible non-production Core DevelopmentRun using the registered workspace. The existing admission service must create any scoped grant from that authenticated Start and actual run/job/attempt/lease/source/budget identities; no grant has been fabricated.

After the Runner reconnects, sync the existing workspace to current `origin/main`, verify its fingerprint and bind it to the same tenant. Continue the real lifecycle, controlled interruption/reconnect, receipts and independent Final Verify. Revision-24 public publish/read/unpublish and same-/cross-tenant denial still need an isolated disposable app and legitimate owner/second-user browser identities. Gateway receipt, credit, usage and trace acceptance remains separate. Closed Personal Mini-App pilot and V1/V2 evidence are unchanged.
