# SPEC-208 W2/W3 Checkpoint — 2026-10-10

## Canonical integration

- Current configured canonical ref: `refs/heads/main`
- Current canonical SHA at this checkpoint: `eec45036091f1f43a215a46c643007f9f2c4ff44`
- W2 root-hardening PR: [#514](https://github.com/naibarn/SmartSpecPro/pull/514)
- PR head SHA: `a193db2ee62ffd97a614e7e8f66c506e45f43356`
- PR merge SHA: `74554a9317b506886bde154166e7750986e3b83e` (ancestor of current canonical SHA)
- Starting canonical SHA before PR: `e14730f45c1b1ad436dd49ede6c973c8cfed7240`

## W2 implementation

`apps/runner-app/src/moli_isolation.rs` now validates the profile `data_root`: it must be absolute, an existing non-symlink directory, owned by the Runner effective UID, and not group/other writable. The path is canonicalized and its device/inode/owner/mode are rechecked before profile paths are created. Ancestor directories are assumed host-administrator controlled.

The change hardens a Runner primitive. It does not launch Moli or enforce the policy at a process, resolver/socket, redirect, CDP, WebDriver, or BiDi boundary. The Runner continues to reject Moli browser commands. W2 remains open.

## Verification on current canonical SHA

On `eec45036091f1f43a215a46c643007f9f2c4ff44`:

- `rustfmt --edition 2021 --check apps/runner-app/src/moli_isolation.rs apps/runner-app/src/lib.rs` — exit 0.
- `CARGO_TARGET_DIR=/tmp/spec208-w2-target cargo test --manifest-path apps/runner-app/Cargo.toml --lib moli_isolation::tests -- --nocapture` — 5 passed, 0 failed, exit 0.
- `CARGO_TARGET_DIR=/tmp/spec208-w2-target cargo test --manifest-path apps/runner-app/Cargo.toml --lib job_commands_reject_browser_engines_without_a_runner_security_gate -- --nocapture` — 1 passed, 0 failed, exit 0.
- `git diff --check` — exit 0.

## W3 boundary and tests

The current executor only exposes the existing lease checks, deferred external wait, and Runner HTTP dispatch. Receipt persistence is in `runnerControl.ts`; cancellation uses the job control plane and Runner cancellation dispatch. There is no Moli launch, receipt emission, cancellation adapter, or profile cleanup hook. The Runner currently rejects Moli. A synthetic test asserting those missing behaviors would not validate production code, so no mock end-to-end harness was added.

On prior canonical SHA `74554a9317b506886bde154166e7750986e3b83e`, the existing focused executor suite passed 4/4 (exit 0), covering stale lease prevention, accepted dispatch receipt wait, and dispatch rejection settlement. These tests remain available but do not establish a Moli vertical slice.

A re-run on current SHA `eec45036091f1f43a215a46c643007f9f2c4ff44` was attempted. `pnpm exec vitest` exited 254 because the clean isolated worktree has no installed Vitest executable; invoking the shared Vitest CLI then failed to load `vitest/config` from that worktree. This is an environment/dependency-availability limitation, not a test assertion failure. No dependencies were installed.

## Host recovery state

At inspection, `/` had 62 GiB free and 48,912,767 free inodes; `/tmp` had 6.5 GiB free. `.git/workspace-authority.sqlite3` was 860,160 bytes, in DELETE journal mode, with no WAL/SHM/journal files; read-only `PRAGMA integrity_check` returned `ok`. No user files, caches, worktrees, database files, or build artifacts were deleted.

The registered user workspace `/home/dev/projects/SmartSpecPro` remains dirty at `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978` with nine owned/unclassified paths. Convergence to current main was refused safely as `DIRTY_WORK_PRESERVED`; recovery manifest: `.git/workspace-recovery/smartspecpro/workspace-63612604-a004-447e-b1c4-616de72d86b7/20261010T085535359302Z/manifest.json`. Authority verification reports `CONVERGENCE_PENDING` because the canonical user workspace is dirty and unsynced. Its files were preserved.

## Status and next action

- W0/W1 remain closed; W2, W3, and W4 remain open.
- W3 real lifecycle is blocked on a testable Runner Moli runtime boundary with receipt, cancellation, and cleanup hooks.
- W4 still has applicable advisory records for the pinned prototype, unverified publisher provenance, and incomplete deployed-target/license-notice evidence.
- Chromium remains production default; Moli production dispatch remains disabled.
- Next executable step: obtain/identify the approved isolated Runner runtime adapter and its source/runtime ownership. Then wire the existing profile and egress primitives to actual launch/listener/resolver/redirect/cleanup hooks; keep the Moli command guard until those gates pass. Continue W4 provenance/notices work independently when target artifacts and deployment inventory are available.

## Ten static QA review passes

These are distinct source/evidence reviews, not runtime tests. They cover the integrated W1/W2/W3/W4 surface visible at the checkpoint SHA and do not close W2, W3, or W4.

1. **Production routing/default:** reviewed `computerUseCapabilityRouting.ts` and executor construction. Chromium remains the enforced constraint and Moli remains default-off. PASS.
2. **Adapter authorization:** reviewed `moliCdpBrowserAdapter.ts` preconditions for authorization, network-isolation assertion, navigation approval, audit callback, and Runner cleanup callback. PASS FOR DISABLED PROTOTYPE; callbacks are not connected to Runner runtime.
3. **Runner command gate:** reviewed `control_channel.rs` browser engine validation and existing tests. Unsupported engine constraints fail before command acceptance; Moli is still rejected. PASS.
4. **Tenant/attempt profile scope:** reviewed hashed tenant+attempt naming, exclusive profile creation, mode 0700, and same-scope collision rejection. PASS FOR UNIX HELPER.
5. **Profile-root trust:** reviewed absolute path, symlink rejection, effective UID, group/other write rejection, canonicalization and device/inode recheck. PASS WITH LIMITATION: ancestor directories rely on the documented host-administrator control assumption.
6. **Cleanup semantics:** reviewed explicit idempotent cleanup and `Drop` fallback. PASS FOR PROFILE DIRECTORY; Drop ignores cleanup errors and no process lifecycle invokes/report cleanup yet.
7. **Listener exposure:** reviewed `bind_loopback_listener`; it rejects non-loopback binds. PASS FOR HELPER; no Moli CDP/WebDriver/BiDi listener is wired to use it, so protocol exposure remains an open W2 gate.
8. **Network target/SSRF policy:** reviewed local-name rejection, complete resolved-answer validation, IPv4/IPv6 special-range blocks, and pinned-address API. PASS FOR POLICY HELPER; no resolver/socket/redirect hook consumes the pin, so runtime egress is not enforced.
9. **worker_jobs/Runner lifecycle:** reviewed `computerUseRunnerJobExecutor.ts` ordering and focused tests. Stale lease prevents dispatch; accepted dispatch waits for receipt; rejected dispatch settles the external wait. PASS FOR EXISTING CHROMIUM EXECUTOR CONTRACT; there is no Moli receipt/cancel/cleanup vertical slice.
10. **Supply-chain evidence:** reviewed W4 recheck for the pinned v1.1.15 prototype graph, advisory records, release digest/provenance, and license inventory. PASS AS AN AUDIT RECORD; unresolved advisory applicability, publisher provenance, deployed target identity, and complete notices review keep W4 open.

Review conclusion: existing guard and helper code is a safe disabled checkpoint. No process isolation, tenant storage proof, socket egress enforcement, Moli Runner E2E, or production approval is established.
