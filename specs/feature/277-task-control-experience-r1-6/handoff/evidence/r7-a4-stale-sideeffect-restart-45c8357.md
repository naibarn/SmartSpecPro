# R7-A4 stale-worker side-effect and restart acceptance

- Canonical source: `origin/main` at `45c8357329f033d9e9aca8559f3e5c8fd2258b28`.
- Command: `JWT_SECRET='r7-local-test-secret-not-for-any-environment-0001' pnpm exec vitest run server/services/__tests__/autoTeamRunMutationFence.integration.test.ts` from `apps/web`.
- Result: 1 integration test passed. The test repeats the stale-worker/reclaim race three times against an owner-marked disposable PostgreSQL cluster on loopback, with separate OS worker processes.
- Assertions: generation N+1 progress commits; stale generation N is rejected for terminal stop, room message, activity event, and snapshot; the reclaimed process is SIGKILLed after progress; a later generation recovers and completes the run; terminal state remains generation 3 and exactly one accepted `run_completed` event is stored per run.
- Scope: direct PostgreSQL state and transaction/concurrency evidence for the selected recovery-worker mutation boundaries.
- Limits: this does not close every worker-owned `runEngine` mutation, provider callback/outbox/cancellation race, TeamRun-to-Task-Control identity binding, SPEC-271/302 durable receipts, SPEC-224 authorization, or full SPEC-277 acceptance. No shared or production database was used.
