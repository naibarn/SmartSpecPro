# Final convergence review

## Outcome

- Implementation matches the current 7/10-day stale Draft cleanup flow.
- Cleanup archives only caller-owned, tenant-owned inactive Draft ledger jobs.
- Active, already applied, already archived, and recently updated jobs remain
  untouched. Created series, versions, and storage assets are outside the path.
- Server and client section reviews passed after all actionable findings were
  addressed.
- Security review is a conditional pass with no open confirmed findings.

## Maintenance-policy amendment — 2026-08-22

- Threshold contract is now `7 | 10`; the former 5-day option was removed from
  the server, client, tests, and active usage contract.
- The index no longer interrupts the creator with an automatic modal. A
  non-blocking maintenance banner opens the dialog only after an explicit click.
- User-facing cleanup language now says “archive to history”; immutable Draft
  history remains recoverable.

## Focused proof

- Five Vitest files passed: 33 tests.
- New TypeScript/TSX files pass Prettier checks.
- Targeted diff check passes.
- Targeted TypeScript diagnostics found no errors in the new service, dialog,
  dialog tests, mutation tests, or shell integration.

## Deferred proof

- Repository-wide typecheck remains non-zero because of four pre-existing errors
  in `server/routers/verticalDramaSeries.ts` outside this feature's changed hunks.
- Authenticated browser behavior was not verified in this environment.
- Cross-tenant runtime behavior and production-sized PostgreSQL query plans were
  not exercised against a live database.

## Superseded by Feature 158

The 7/10-day bulk cleanup contract remains available only for compatibility with
older callers. The current UI no longer exposes it: Series-linked Drafts are
excluded from the inbox, legacy Drafts are migrated to Series IDs, and users
remove remaining unlinked rows one at a time with history retained.
