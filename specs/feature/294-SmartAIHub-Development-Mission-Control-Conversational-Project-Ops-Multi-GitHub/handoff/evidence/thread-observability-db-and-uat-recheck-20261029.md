# Thread observability database and UAT recheck — 2026-10-29

Source: `731ac46ebb62f9775b98947edcf9d5f248662b83` (`origin/main`).

## Verified

- PostgreSQL integration coverage for `conversation_threads`, message thread cursors, and worker-job observability passes: 2 files, 12/12 tests. The test setup now supplies a test-only JWT signing key so cursor and snapshot signatures can be exercised; runtime secret validation is unchanged.
- Authenticated local development UAT for Mission Control's account-wide Project and Thread overview passes: 1/1 Playwright test.
- Read-only inspection of the currently running development (`smartspec_dev`) and production (`smartspec`) service databases confirmed `conversation_threads`, `messages.thread_id`, `worker_jobs.thread_id`, `approval_requests`, and worker-job attempt/event tables exist in both schemas.
- The current service log window contains no missing `conversation_threads` or `thread_id` relation errors. Production's observed 403s were unauthenticated/unauthorized calls to the operator-only SPEC-224 diagnostics query and correctly failed closed.

## Not verified / remaining

- The local computer/browser sidecar failed to start, so authenticated hosted-browser acceptance could not be performed.
- This does not verify that the hosted browser is serving this source revision, nor close the remaining SPEC-294 cross-host session/event replay and multi-agent acceptance requirements.
- No production database mutation, release, or traffic change was performed.
