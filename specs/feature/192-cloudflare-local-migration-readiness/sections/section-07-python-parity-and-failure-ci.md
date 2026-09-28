# Section 07 — Python Parity, Failure Tests, and Focused CI

## Goal

Prove local parity across Node, Worker, Python, and PostgreSQL boundaries and
make focused verification reproducible without external accounts.

## Owned paths

- Python `app/services/job_control_plane.py`,
  `app/workers/postgres_job_worker.py`, and focused tests.
- Python requirements/test setup only when needed to make the existing test
  command reproducible.
- Web test-loader/schema boundary causing ESM/CommonJS job-control imports to
  fail.
- Focused CI/verification script and package docs.

## Implementation

Repair the smallest module boundary or test loader configuration so focused web
tests can import the Drizzle schema without changing unrelated runtime module
semantics. Add Python dispatcher/reporter parity tests for canonical envelope,
attempt, lease/fencing, settlement, provider operation key, and redaction.

Under both `FEATURE_186_HARD_CUTOVER=true` and
`FEATURE_186_POSTGRES_PYTHON_WORKER=true`, tenant-bound Python work uses the
PostgreSQL-pull envelope/worker. Celery publishers, Beat execution, Docker,
Cloud Run, and copied business payload fallback are rejected. Provider media
tests cover persist-before-submit, waiting-external lease release, durable
polling, deadline, restart, and no blind resubmission.

Add failure injection for Queue duplicates/lost publish response, lease expiry,
callback replay, provider 429/5xx, settlement retry, serialization/deadlock,
Redis outage, and Hyperdrive failure. Add a focused command that runs relevant
web, Cloudflare, Python, inventory, migration, and readiness checks. Missing
pytest/database prerequisites are reported as explicit failures. Do not add
project-wide typecheck to the required path.

## Tests

All listed failure paths, flag combinations, Python envelope parity, module
loading, and prerequisite failures must be covered. Keep paid provider calls
mocked and local.

## Acceptance

Focused local tests and static verifiers pass where prerequisites exist, and
missing prerequisites cannot be mistaken for production readiness.

## Implemented

- Python PostgreSQL-pull worker/control-plane parity tests pass with both hard
  cutover flags and preserve canonical identity/fencing/redaction behavior.
- Added `verify:feature-192:focused`, which runs Cloudflare, web, local
  readiness, migration/inventory, and Python focused tests with `DEBUG=false`
  and disables the project-wide coverage threshold for the focused slice.
- The command reports missing prerequisites explicitly rather than turning them
  into production-readiness claims.
