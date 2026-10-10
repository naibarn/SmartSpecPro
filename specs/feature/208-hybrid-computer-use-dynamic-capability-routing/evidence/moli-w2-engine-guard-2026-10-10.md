# SPEC-208 W2 Runner browser-engine guard — 2026-10-10

## Scope

Starting canonical SHA: `11aeb149ee27089aaabbb1d7ae198c1f94e96907`.
Integrated implementation PR #447 adds fail-closed validation for `browser.v1` commands: a provided browser engine constraint is accepted only when it is `chromium`. The check exists at the web command contract and Rust Runner protocol boundary. This does not establish a Moli isolation boundary or dispatch path. Chromium remains the production default; Moli remains disabled.

## Exact-SHA verification

Canonical SHA tested: `1c01e3fa80c8952d0903d4ddfbdfcf6619c3b65e`.

- Web focused command: `TMPDIR=/tmp/spec208-test-tmp pnpm exec vitest run --configLoader runner server/services/__tests__/runnerJobCommandContracts.test.ts server/services/__tests__/computerUseRunnerJobExecutor.test.ts --reporter=dot` (from `apps/web`)
  - Exit: 0
  - Result: 2 files passed, 16 tests passed.
- Runner library command: `TMPDIR=/tmp/spec208-test-tmp CARGO_TARGET_DIR=/tmp/spec208-cargo-target cargo test --manifest-path apps/runner-app/Cargo.toml --lib`
  - Exit: 0
  - Result: 174 passed, 0 failed.
  - Cargo emitted a warning that it could not save global last-use metadata because the root filesystem is full. The test binary completed successfully from `/tmp/spec208-cargo-target`.
- `git diff origin/main...HEAD --check`: passed on the implementation branch before merge.

## Security and remaining work

The guard blocks unsupported engine constraints but does not isolate per-tenant processes/profiles, remove WebDriver/BiDi access from Moli's shared listener, enforce destination policy at connection time, or prove the worker_jobs lease/cancel/receipt lifecycle. No Moli binary was executed. No live Runner acceptance, E2E, benchmark, deployment, or production readiness is claimed. Continue W2 with an OS-enforced boundary or a verified upstream protocol-disable mechanism; if unavailable, preserve fail-closed behavior and advance independent security classification work.
