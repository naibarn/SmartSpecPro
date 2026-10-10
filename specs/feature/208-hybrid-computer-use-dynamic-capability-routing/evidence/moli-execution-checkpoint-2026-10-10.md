# SPEC-208 execution checkpoint — 2026-10-10

## Canonical source and WorkUnits

- Exact verification SHA: `87f08914837ce5ff5e06ee90967919d9f73fd746` (`origin/main` after PRs #506, #508, #510, and #511).
- Starting SHA for W2/W3 parallel implementation: `06068ae9db6c433b9a10353f71f2becdba18218e`.
- W0 ownership/baseline reconciliation: closed. Dirty canonical user checkout preserved; task work proceeded in separate registered worktrees.
- W1 safe adapter baseline: closed. Code integrated by PR #445 (`fe5e04015b2b947d03d41ce800948582be40c721`); W1 focused typecheck evidence recorded separately.
- W2 isolation: **partial checkpoint only**, PR #510 merged at `e0f1031c453a21273f8d03d3bca81916b12834ee`.
- W3 lifecycle: **baseline contract tests only**, PR #508 merged at `225dbfb1196c1139f6902cbe739b3f3a403f0289`.
- W4 audit: fresh evidence in PR #511, merged at `87f08914837ce5ff5e06ee90967919d9f73fd746`.

## Changes and verification

- W2 adds Runner-owned Unix per-tenant/attempt private profile-directory primitives (exclusive creation, 0700 checks, explicit and Drop cleanup), a loopback-only listener bind helper, and a conservative network-target validator. Non-Unix profile preparation fails closed.
- W2 tests on the exact canonical SHA:
  - `CARGO_TARGET_DIR=/tmp/spec208-w2-target cargo test --manifest-path apps/runner-app/Cargo.toml --lib moli_isolation::tests -- --nocapture` — **4 passed, exit 0**.
  - `CARGO_TARGET_DIR=/tmp/spec208-w2-target cargo test --manifest-path apps/runner-app/Cargo.toml --lib job_commands_reject_browser_engines_without_a_runner_security_gate -- --nocapture` — **1 passed, exit 0**.
  - `rustfmt --edition 2021 --check apps/runner-app/src/moli_isolation.rs apps/runner-app/src/lib.rs` and `git diff --check` — **exit 0** before integration.
- W3 adds two synthetic tests on the existing worker_jobs → Runner gateway path. Focused command `TMPDIR=/tmp/spec208-test-tmp pnpm exec vitest run --configLoader runner server/services/__tests__/computerUseRunnerJobExecutor.test.ts --reporter=dot` — **4 passed, exit 0** on the exact canonical SHA.
- W4 independently refreshed all 11 OSV records against the immutable v1.1.15 lockfile, checked six fixed crate candidates/checksums, matched the GitHub release asset digest, and found no release attestation. The full classifications and sources are in `moli-w4-recheck-2026-10-10.md`.

## Security state and remaining blockers

- The W2 profile/network helpers are not connected to a Moli process, resolver/socket, or protocol server. The caller must connect only to the returned IP pins; this code does not enforce it. No Runner-owned CDP/WebDriver/BiDi restriction or egress boundary is active.
- Current Runner validation still rejects Moli; the worker executor still pins Chromium. No Moli binary was downloaded or run, no tenant traffic was dispatched, and no production flag changed.
- W3 remains open: there is no real Runner-owned Moli launch, receipt/audit completion path, cancellation/lease-revocation cleanup, crash/retry settlement, or orphan/resource verification.
- W4 remains open: no fixed Moli release/build was verified; publisher provenance, deployed artifact inventory, reproducible SBOM/source-to-binary evidence, complete platform notices, and legal review are unresolved.
- Host recovery: at check time, `/` had 64 GB available and 48,998,051 free inodes. Read-only authority SQLite `integrity_check` returned `ok`; journal mode `delete`; WAL/SHM/journal files were absent. No user cache, database, or worktree was deleted. The earlier bulk disk recovery cause remains unconfirmed.

## Next executable work

Continue W2 in the approved isolated runtime boundary: connect Runner-owned per-attempt profile/process lifecycle to a pinned Moli runtime, restrict its listener to authorized loopback CDP, enforce redirect/DNS/IP egress policy at the actual socket layer, and test tenant separation plus cleanup. Do not relax the current Chromium-only Runner guard until those tests pass. Then continue W3 against that integrated boundary; W4 may proceed independently on verified artifact/provenance and notice gaps. Phase 1, Phase 2, and production approval remain open.
