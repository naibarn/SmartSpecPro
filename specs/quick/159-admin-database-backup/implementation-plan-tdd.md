# TDD Plan

## Tests first

1. Contract tests for `safe/full` parsing and artifact/status enums.
2. Service tests for path containment, expiry, cleanup, checksum and partial-file cleanup.
3. Export tests with mocked `pg_dump` and catalog rows proving both ZIPs are non-empty and manifests are present.
4. Redaction tests proving sensitive field names are replaced in safe mode and preserved in full mode.
5. Router tests proving unauthenticated/non-admin denial, create/list behavior, and rate/concurrency guard.
6. Express route tests proving artifact allowlist, expiry, realpath containment, content headers and admin auth.
7. Admin page tests covering mode selection, create disabled/loading, empty/running/completed/failed/expired states,
   and correct download URLs.

## Expected initial failures

- Missing table/schema exports and router procedures.
- Missing worker and route registration.
- Missing menu/translation/page imports.

## Regression checks

- Existing admin route guard remains `user.role === "admin"`.
- Existing migration ordering tests remain green or any baseline mismatch is reported separately.
- `git diff --check` and targeted TypeScript/lint checks pass.
- Browser proof is attempted for mobile/tablet/desktop; if unavailable, record skipped evidence with blocker.
