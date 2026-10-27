# SPEC-293 Runner Workspace Isolation Checkpoint

- Profile: `quick`
- Canonical source SHA: `7d37b44fe0e7aa93b48c50958771b4aa7f29298e`
- Captured: `2026-10-27 01:10 UTC`
- Environment: Linux x86_64; `MemAvailable=24,609,200 kB`; memory PSI `some avg10=0.00`, `full avg10=0.00`.
- Outcome: PASS for the focused Linux scope below.

## Verification

- `cargo test --manifest-path apps/runner-app/Cargo.toml workspace_registry::tests --lib` — 18 passed. Covers two projects beneath one registered root, stable reopen, path traversal/root authorization, import preservation and Unix symlink escape, legacy registry migration, recovery of interrupted provisioning, run identity/lifecycle, redacted bounded projection, and registry history retention.
- `cargo test --manifest-path apps/runner-app/Cargo.toml spec224_candidate::tests --lib` — 7 passed. Covers isolated candidate apply/reattach, write-set and per-path CAS, interrupted apply journal recovery, symlink rejection, and simultaneous same-project applies (one wins; the stale write conflicts).
- `cargo check --manifest-path apps/runner-app/Cargo.toml --bin smartaihub-runner` — passed on Linux.
- From `apps/web`: `pnpm exec vitest run server/services/__tests__/runnerContracts.test.ts server/routers/__tests__/runnerNodesWorkspaceProjection.test.ts shared/__tests__/projectIdentityPresentation.test.ts client/src/components/chat/__tests__/UniversalControlPlanePanel.test.tsx --maxWorkers=1 --reporter=dot` — 4 files, 38 tests passed.
- `git diff --check` — passed.

## Acceptance boundary

The Windows reparse-point guard is implemented with Windows file attributes,
but it was not executed on a Windows host. A Linux cross-target attempt using
`cargo check --target x86_64-pc-windows-gnu --bin smartaihub-runner` could not
compile dependency `ring` because `x86_64-w64-mingw32-gcc` is unavailable.
This is an environment/toolchain limitation, not Windows acceptance evidence.
Actual Windows Runner path, reparse-point and restart validation remains open.

## Consumer contract

SPEC-224 supplies its existing `workspace_ref`, job ID and attempt to the
Runner. The Runner resolves the registered source workspace and registers its
existing isolated candidate as a SPEC-293 run workspace. Task Control receives
only the run/workspace IDs, source workspace ID, optional project ID, attempt
and lifecycle. It receives no local path. Existing SPEC-224 dispatch,
settlement, Final Verify and execution state machine are unchanged.
