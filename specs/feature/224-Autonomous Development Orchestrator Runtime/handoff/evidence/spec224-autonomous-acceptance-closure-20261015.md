# SPEC-224 Autonomous Acceptance Closure — 2026-10-15

## Source and scope

- Canonical base: `8ae9575ef15ece3eeacb19b133c6fdb71d8932df` (PR #969).
- Recovery decision implementation: `4a5a2317004d79f4a5c3cce15fc616dc1564fb25`.
- Dependency recovery: `pnpm install --offline --frozen-lockfile --filter @smartspec/web...` in the disposable `/tmp/spec224-acceptance-8ae` worktree. `superjson@1.13.3` was already declared by `apps/web/package.json` and present in `pnpm-lock.yaml`; no lockfile or package manifest changed. The prior failure came from the absence of package-level `apps/web/node_modules` links.

## Verification

- Resource profile: `quick`; command was run through `apps/web/scripts/spec224-verification-runner.mjs`, with a single Vitest worker. Initial available-memory observation was 24,732 MiB.
- Result on implementation SHA `4a5a2317004d79f4a5c3cce15fc616dc1564fb25`: **72 passed, 1 skipped**, 12 files passed, 1 skipped. Runner evidence result: `PASSED`, exit 0, from 2026-10-15T15:58:52Z to 2026-10-15T15:59:18Z.
- The existing Developer Fast Lane E2E passed 4/4. It uses its deterministic model fixture. Its injected-clock provider-capacity case preserves a three-day wait, resumes the same WorkUnit with a distinct model-call ID, retains unknown prior usage, and does not repeat the existing thread start. This is simulated recovery evidence, not live provider or Runner acceptance.
- DevelopmentRun contracts, phase control, persistence, task control, final-verification, authorization, protected-start, and model-admission scoped suites passed. The new persistence test verifies that the failure decision is stored in the existing `PHASE_FAILED` event and is stable when the reconciler reopens persisted state.
- `spec224RegisteredRunnerE2E.integration.test.ts` was skipped because its required isolated identity (`127.0.0.1:55493`, database `spec224_d385_test`, role `spec224_d385_runtime`) was not available. Read-only check `pg_isready -h 127.0.0.1 -p 55493` returned no response. The development PostgreSQL on port 5432 was not used.

## Recovery decision behavior

Repairable canonical worker-job failures now include a replayable decision in the existing `PHASE_FAILED` event: stable blocker ID, affected WorkUnit/run, classified root cause and evidence references, the already-authorized `DEBUG_REPAIR` path, selected strategy/reason, source/context/work-package binding, terminal-job resume condition, next action, attempt budget, fencing version, and `UNKNOWN` resource impact where no reliable estimate exists. Existing canonical event persistence and reconcile idempotency remain the durability mechanism. Unknown external outcomes continue to require owner review.

## Acceptance status and next action

**SPEC-224: PARTIAL.** No live protected Runner dispatch, genuine Codex subscription turn through the authorized Runner, independent final verification on that run, or final settlement evidence was available. The real Runner and hosted Mini-App paths remain separate. The Mini-App/Gateway/HTTPS Browser path has no new evidence in this report and must not use Codex Subscription as a fallback.

Next action: when the owner-authorized isolated Runner registration and disposable PostgreSQL identity are available, enable the existing Registered Runner E2E through its documented test profile; run crash/restart acceptance, then perform independent final verification and read back durable receipts. Preserve the existing protected dispatch, trust, lease, and fencing gates. Continue hosted Mini-App acceptance independently only on its Revision 24 authorized non-production target.
