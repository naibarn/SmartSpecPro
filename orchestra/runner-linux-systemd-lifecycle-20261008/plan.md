# Linux Headless Runner Service Lifecycle — WorkUnit Plan

## Authority and baseline
- Parent outcome: user-requested Runner repair/build/install work
- Normative owner: SPEC-205, especially native platform target and release sections
- Canonical baseline: `origin/main` at `0f3e8a30ca59d41d671618313b9960a49fc3b73f`
- Isolated worktree: `/home/dev/worktrees/runner-linux-systemd-lifecycle-20261008`
- Existing boundaries: `smartaihub-runner`, `sah-runner-v1`, existing release catalog, runner jobs/outbox; no new queue or protocol

## Audit result
Linux x86_64 selection, release signing gate, admin CLI target, catalog platform, and same-origin download already exist. Runner 0.2.8 release assets currently contain Windows CLI and container manifest, not Linux. The binary has no systemd service template or install/upgrade/uninstall command.

## Design decision
Ship the existing Linux CLI artifact as a bundle containing the binary, a rootless systemd user unit, and a lifecycle installer. The installer accepts `install`, `upgrade`, and `uninstall`; it never invokes sudo, changes account permissions, enables lingering, opens a network port, or removes Runner data. Upgrade atomically replaces the binary and rolls back if systemd reload/restart fails. Uninstall disables the user unit and removes only the installed binary/unit, preserving enrollment, workspace metadata, and credentials. First install leaves the unit stopped so the user can run `smartaihub-runner connect` and approve enrollment before starting it.

## Requirement-to-test matrix

| Requirement | Observable behavior | Test | RED evidence | Residual boundary |
|---|---|---|---|---|
| Linux release includes install material | Linux tar contains executable, installer, systemd user unit, and manifest/checksums | Workflow static check plus tar-list test | Current workflow archives only the raw binary | No signed release is published by source tests |
| Install is rootless and does not start before enrollment | Creates user bin/unit paths, reloads systemd, prints connect/start steps, leaves service stopped | Shell lifecycle test with temporary HOME and fake `systemctl` | Installer is absent | Real systemd user manager/browser enrollment not proven |
| Upgrade is atomic and rollback-safe | Replaces binary and restarts only if previously active; restores old binary/unit on failure | Shell lifecycle test, fake restart failure | No installer lifecycle exists | Physical Linux process and filesystem semantics remain unverified |
| Uninstall preserves Runner data | Stops/disables unit, removes installed binary/unit, keeps data root and workspace registry | Shell lifecycle test | No uninstall action exists | Host-specific systemd policy not proven |
| No inbound port or privilege change | Service binds no listener; installer refuses root and uses `systemctl --user` only | Script/unit static assertions | No service template exists | Manual physical deployment remains separate |

## Verification commands
- `bash -n apps/runner-app/install-linux-runner.sh`
- `bash apps/runner-app/tests/test-linux-install.sh`
- `node scripts/verify-runner-release-workflow.mjs`
- `cargo test --locked --offline --manifest-path apps/runner-app/Cargo.toml --lib`
- `git diff --check`

## Acceptance boundary
Source tests do not prove a physical Linux host. Do not publish a release or enable a real service as a side effect. Linux artifact build, signature import, catalog visibility, and physical service lifecycle remain separate evidence gates.
