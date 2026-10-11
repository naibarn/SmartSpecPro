# R9 Test Design and Results

| Requirement | Observable | Test level/location | RED evidence | GREEN evidence | Residual boundary |
|---|---|---|---|---|---|
| Canonical provider poll result is durably settled once | `worker_jobs`, `worker_job_events`, reservation/capacity | Native disposable PostgreSQL: `autoTeamProviderPollPersistence.integration.test.ts` | Existing test has direct duplicate/reclaim/race checks | 1/1 passed at source `ee217380…`; relevant paths unchanged in current `b6ca0541…` | Synthetic observation, no live provider API submit/poll |
| Callback is evidence-only and replay-safe | Job/TeamRun unchanged; callback rows preserve accepted/rejected/conflict/replay | Native disposable PostgreSQL: `autoTeamProviderCallback.integration.test.ts` | Direct negative tests for missing/stale attempt, cross-tenant, conflicting duplicate | 1/1 passed | No in-repo production producer identified; classified audit-only compatibility (C) |
| Process interruption preserves Task Control identity | SIGKILL, expired lease recovery, retry and task group reconstructed | Native disposable PostgreSQL: `taskControlLeaseContinuity.integration.test.ts` | Existing child-process test | 1/1 passed with repo-required test JWT | TeamRun identity, synthetic finalVerification field; not SPEC-224 Final Verify |
| DevelopmentRun completion/phase projection | canonical worker job, service projection, phase continuation | `spec224DevelopmentRunIntegration.test.ts`, `spec224DevelopmentRunPersistence.test.ts`, `jobControlPlane.test.ts` | Service-level suite | Included in 100/100 focused pass | In-memory seam; not joined to native Postgres Task Control |
| Persisted closure gates and Final Verify | open requirements/blockers remain blocked; eligible closure completes | `spec224FinalVerify.test.ts`, `spec224RequirementClosurePersistence.test.ts`, bounded real-Spec test | Tests include negative and positive gate cases | Included in 100/100 and 33/33 passes | Separate tests, synthetic evidence fixture, no cross-process PG Final Verify |
| SPEC-277 ledger closure | Acceptance clauses fully evidenced | Canonical requirement ledger | 431 rows remain open/unassessed | No status was changed | Do not close UI/deploy/E2E clauses based only on service tests |

## Commands

```bash
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run server/services/__tests__/autoTeamProviderPollPersistence.integration.test.ts server/services/__tests__/autoTeamProviderCallback.integration.test.ts server/services/__tests__/taskControlLeaseContinuity.integration.test.ts
npx vitest run server/services/__tests__/spec224FinalVerify.test.ts server/services/__tests__/spec224DevelopmentRunIntegration.test.ts server/services/__tests__/spec224DevelopmentRunPersistence.test.ts server/services/__tests__/jobControlPlane.test.ts
npx vitest run server/services/__tests__/spec224BoundedRealSpecFinalVerify.test.ts server/services/__tests__/spec224PhaseController.test.ts server/services/__tests__/spec224RequirementClosurePersistence.test.ts server/services/__tests__/spec224DevelopmentRunPersistence.test.ts
```

See `specs/feature/224-Autonomous Development Orchestrator Runtime/handoff/evidence/r9-synthetic-provider-poll-and-scope-20261011.json` for exact revision, environment, proof boundaries and results.

| Outbox reclaim/settlement is fenced to current owner | One dispatch and one terminal result; stale workers cannot duplicate retry outbox | Native disposable PostgreSQL: `autoTeamOutboxPublisherReclaim.integration.test.ts`, `autoTeamStaleOutbox.integration.test.ts` | Existing concurrent/child-process tests | 2/2 passed at exact canonical source `b6ca0541…` | Synthetic transport adapter; not provider API or economic settlement |
