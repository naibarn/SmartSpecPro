# Vertical Drama Draft QC Queue Payload Fix

- Owner/worktree: Codex, `codex/fix-draft-qc-job-payload-20261017`
- Base: `origin/main` at `46bbd2f7202f89414628a1d9672225435b72329a`
- Root cause: the QC queue included the full draft record in `worker_jobs.payload`; canonical job input validation rejects payloads above 500 keys (`Job definition contains too many keys`). The router surfaced this as “Draft QC queue is unavailable”.
- Implemented: queue only `{ runId, seriesId }`; resolve tenant and user from trusted worker context; retain draft in the owner-scoped QC record. Added a regression test with a 520-key draft.
- Focused verification: `pnpm exec vitest run server/services/__tests__/verticalDramaDraftQualityQcJobs.test.ts --reporter=dot` — 9 passed. Esbuild syntax/transformation passed for both changed services and the test.
- Pending: protected PR checks, merge to canonical `origin/main`, verify resulting SHA, then development/browser verification of Draft QC enqueue.
- Last local commit: pending.
