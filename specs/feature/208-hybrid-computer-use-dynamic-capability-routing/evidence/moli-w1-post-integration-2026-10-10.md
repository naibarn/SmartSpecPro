# SPEC-208 W1 post-integration verification — 2026-10-10

- Canonical ref: `refs/heads/main`
- Integrated SHA: `fe5e04015b2b947d03d41ce800948582be40c721` (PR #445 merge commit)
- Verification profile: `quick`
- Scope: disabled Moli adapter flag/production gates, adapter lifecycle and cleanup, and unchanged canonical computer-use Runner job executor tests.

Command, run from `apps/web`:

```text
TMPDIR=/tmp/spec208-test-tmp pnpm exec vitest run --configLoader runner server/services/__tests__/moliBrowserEngine.test.ts server/services/__tests__/moliCdpBrowserAdapter.test.ts server/services/__tests__/computerUseRunnerJobExecutor.test.ts --reporter=dot
```

Result: exit code 0; 3 files passed; 17 tests passed; 2 live Moli cases skipped because no verified `MOLI_BINARY_PATH` or CDP endpoint was configured. The current `127.0.0.1:19223` endpoint had no listener. No Moli binary was run.

`git diff origin/main...HEAD --check` passed before PR creation. The PR preview workflow was `SKIPPED`; GitHub reported no required status checks on `main`. No typecheck, Runner E2E, supply-chain refresh, benchmark, deployment, or acceptance result is claimed. The 80-case suite remains `NOT_RUN`.
