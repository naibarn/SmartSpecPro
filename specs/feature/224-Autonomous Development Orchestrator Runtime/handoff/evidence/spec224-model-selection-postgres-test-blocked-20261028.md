# PostgreSQL model-selection dispatch test — environment blocked

Source: `2fa582001e5d409768a492960d0f3fed0ac93b7e` on `origin/main`.

The existing `spec224PostgresIntegration.integration.test.ts` fixture now asserts that the pinned model selection survives canonical job construction and reaches the external-agent Runner command payload. The requested connected test was attempted against local `smartspec_test`; the configured Compose hostname `postgres` did not resolve from this checkout, and retrying with loopback reached the database but failed before dispatch because `worker_jobs.activeDedupeKey` is missing. A read-only check found `drizzle.__drizzle_migrations` has no applied rows. The integration suite therefore did not verify persistence or dispatch.

No migration was run: this task changes no schema, and the test database has no applied migration head, so the canonical migration runner could replay a broad historical migration set. Do not use `db:push` or manually apply one DDL statement. Prepare/verify an isolated test DB through the repo's migration lifecycle, then rerun the exact integration suite. Test cleanup owns only the unique rows created by the fixture.
