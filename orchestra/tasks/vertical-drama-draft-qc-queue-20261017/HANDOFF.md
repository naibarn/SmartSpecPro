# Vertical Drama Draft QC Queue Payload Fix

- Owner/worktree: Codex, `codex/fix-draft-qc-job-payload-20261017`
- Base: `origin/main` at `46bbd2f7202f89414628a1d9672225435b72329a`
- Root cause: the QC queue included the full draft record in `worker_jobs.payload`; canonical job input validation rejects payloads above 500 keys (`Job definition contains too many keys`). The router surfaced this as “Draft QC queue is unavailable”.
- Implemented: queue only `{ runId, seriesId }`; resolve tenant and user from trusted worker context; retain draft in the owner-scoped QC record. Added a regression test with a 520-key draft.
- Also aligned AI prompt expansion with the existing 12,000-character premise field limit (was 5,000), including shared client/API validation and credit estimation. Added coverage for a 7,498-character premise and the 12,000-character boundary.
- Focused verification: targeted Vitest — 19 passed across QC, prompt expansion validation and wizard UI (56 unrelated tests skipped by name filter). Esbuild syntax/transformation passed for both queue services and the queue test.
- Pending: protected PR checks, merge to canonical `origin/main`, verify resulting SHA, then development/browser verification of Draft QC enqueue.
- Last local commit: `257a2aee3165b8eacca9be5cc116de88fc6c09a7`; prompt expansion follow-up pending commit.
