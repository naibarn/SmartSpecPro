# Feature 192 Interview Transcript

No additional business interview was required. The user provided the required
scope and sequencing directly: complete the deep plan, implement every section,
then perform at least ten spec-to-code review rounds and fix local gaps
immediately.

## Q1 — What runtime migration boundary must implementation preserve?

**Answer:** Cloudflare is the only runtime migration target. Do not route work
back to Google Cloud Tasks, Cloud Run, OIDC task routes, or other Google runtime
components. Google OAuth and Google Drive APIs remain product integrations.

## Q2 — May local implementation use target-account access or deploy?

**Answer:** No. The repository must produce local contract/readiness evidence
only. It must not provision, deploy, activate traffic, copy credentials, mutate
`.env`, or claim target-account/production proof.

## Q3 — What completeness bar applies?

**Answer:** Implement all sections/waves in Feature 192, then compare the
implementation to the spec in at least ten review rounds. Any concrete local
gap should be fixed during the same run. External gates must remain explicitly
blocked rather than being faked by local tests.

## Auto-decisions

- Use the existing Vitest and pytest conventions; do not add a new test
  framework or dependency unless a focused prerequisite is genuinely missing.
- Keep `worker_jobs` and `worker_job_events` as the only canonical ledger and
  reuse Feature 186 ports/services where possible.
- Implement local Cloudflare behavior through dependency injection and
  deterministic fakes; do not couple tests to credentials or native bindings.
- Treat browser/SSE `setInterval` calls as non-job presentation timers after
  classification; route only business schedulers through canonical job intent.
- Use the official Drizzle journal and explicit database configuration as
  migration authority; do not change production data.
- Record local contract completion separately from target-account and production
  proof, with activation disabled throughout.
