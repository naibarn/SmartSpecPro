# R6 Test Design Matrix

| Requirement | Observable behavior | Level and intended test | RED evidence | Residual boundary |
|---|---|---|---|---|
| persisted schedule occurrence + coalescing | two separate scheduler processes converge on one canonical occurrence/job/outbox row | `server/jobs/__tests__/autoTeamRecoverySchedulePersistence.integration.test.ts` with owner-marked loopback-only PostgreSQL | R5 did not execute AutoTeam scheduler | Does not execute scan/evaluation workers or Team run selection |
| scan/evaluation worker execution | persisted scan job is claimed and queues per-run evaluation | worker process harness on the same disposable current-schema database | not tested in the scheduled-occurrence slice | next acceptance step; no production scheduler claim |
| eligibility and wait classification | eligible run evaluated; provider/dependency/resource waits are not stalled | DB integration with persisted Team/run state and recovery policy | prior scan tests are mocked | external provider behavior deterministic/synthetic |
| hard worker interruption | SIGKILL after checkpoint leaves one recoverable logical run | child process acceptance runner | R5 only retried across separate worker processes | no production process |
| active lease reclaim | new process obtains newer fence only after canonical lease expiry/recovery | concurrent PostgreSQL test around worker control plane | PR #543 focused native SQL suite did not prove AutoTeam boundary | proof must include business side-effect write |
| stale completion denial | prior worker cannot persist accepted progress/event/completion after reclaim | adversarial process/DB integration test | not covered by generic claim-only fencing | no stale external-provider side effect unless simulator supports cancellation race |
| idempotent recovery | repeated scans/outbox delivery do not duplicate evaluation, events, artifacts, terminal completion | PostgreSQL integration and event ledger assertions | previous generic retry test is narrower | durable evidence receipt remains owner-gated |
| useful-work completion | persisted work advances, then final verifier consumes evidence before COMPLETED | runEngine/service integration with Task Control projection | scheduler enqueue alone is not completion | SPEC-224 protected dispatch remains DENY |
| R5 regression | project/App memory isolation and ingress remain unchanged | existing exact-SHA focused suites | none expected | no durable Project writes |
| SPEC-271/302 contracts | forged/stale receipt and changed-scope replay deny; Phase 2 write remains closed | pure/DB contract test only where existing schema permits | no owner-authorized durable receipt | do not mark authoritative acceptance |
