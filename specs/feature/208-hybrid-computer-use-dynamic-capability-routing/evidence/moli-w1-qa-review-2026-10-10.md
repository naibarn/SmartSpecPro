# SPEC-208 Moli W1 QA review — 2026-10-10

Review base: `origin/main` at `b7c2e46d3ca4b07bc525aa76f461ce4d1f8ecb08` plus W1 checkpoint `a0bb47bc3` and the focused audit fix in this worktree. These are source reviews, not runtime test runs. They cover the disabled adapter checkpoint only; repeat against W2–W5 after those changes are integrated.

| Pass | Review focus | Result |
| --- | --- | --- |
| 1 | Default flags and production selection (`computerUseCapabilityRouting.ts`; adapter `connect`). | PASS: defaults are disabled/shadow-only, selection returns Chromium in production, and the adapter independently rejects every production environment. |
| 2 | Attempt identity and deadline validation (`AuthorizedMoliAttempt`; `openSession`; `send`). | PASS: required job, user, project, lease, fence, session, grant, capability revision, and a parseable deadline are checked before setup. |
| 3 | Authorization freshness (`openSession`; session `navigate`, `evaluate`, `fill`, and command path). | PARTIAL: authorization and active-attempt callbacks are checked before setup and commands. The callbacks are injected policy seams; no real Runner lease/policy implementation is connected. |
| 4 | Network isolation claims (`confirmNetworkIsolation`; `navigationAllowed`). | BLOCKED for runtime: a true callback is only an assertion from its caller; this adapter does not install or verify an OS/network boundary or enforce DNS/IP rules. |
| 5 | Protocol exposure and endpoint trust (`connect`; loopback URL validation). | BLOCKED for runtime: loopback validation does not make the shared Moli listener CDP-only. WebDriver/BiDi remain exposed by the upstream listener; do not dispatch to it without a Runner-owned boundary. |
| 6 | Tenant/browser storage separation (BrowserContext setup and isolation tests). | PARTIAL: CDP BrowserContexts are per attempt. The independent-process/profile test is skipped without `MOLI_BINARY_PATH`; no live Runner tenant-isolation result was collected. |
| 7 | Failure cleanup and audit observability (setup catch and cleanup test). | PASS for the reviewed path: context disposal and runtime cleanup are both attempted; failures are aggregated. This pass fixed swallowed cleanup-audit write errors and added an assertion for the propagated audit error. |
| 8 | Deadline, timeout, cancellation, and stale-command behavior (`send`; session methods). | PARTIAL: requests are bounded by deadline and command timeout, and closed sessions reject further operations. A timed-out CDP side effect, real cancellation, browser crash, and lease revocation against a running process remain untested. |
| 9 | Dispatch authority and control-plane duplication (`computerUseRunnerJobExecutor.ts`; repository Runner modules). | BLOCKED for runtime: existing executor emits the Chromium `browser.v1` command. The Moli adapter is not called by the canonical `worker_jobs` → Runner execution path; no second queue or executor was added. |
| 10 | Evidence/claim accuracy (focused test output and Phase 1 evidence). | PASS: 17 focused tests passed; two live Moli tests were skipped because no verified binary/endpoint was configured. The 80-case suite remains `NOT_RUN`; this review claims no Runner E2E, benchmark, typecheck, or production readiness. |

## Runtime status

The focused Vitest run passed 3 files / 17 tests with 2 skipped. `http://127.0.0.1:19223/json/version` had no listener. No Moli binary was found on `PATH`, so no unaudited binary was executed. W1 remains a default-disabled adapter hardening checkpoint. W2 protocol/tenant isolation and W3 real Runner lifecycle are still open security gates.
