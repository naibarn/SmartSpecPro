# section-06-security-tests

## Objective

Close the privacy gaps with RLS, audit, retention, rollout gating, and the final regression suite.

## Scope

This section owns the security backstops and the tests that keep the feature safe after integration.

## Files to Change

- any request-context helper used to stamp tenant, user, and project into DB transactions
- `apps/web/server/services/financeDbContext.ts` if a dedicated helper is needed
- `apps/web/server/jobs/*` for purge or recurring finance maintenance
- `apps/web/server/services/auditLogger.ts` call sites for finance events
- follow-up RLS policy or backfill scripts only if they cannot live in the initial schema migration section
- `apps/web/server/__tests__/...` and `apps/web/server/routers/...test.ts`

## Implementation Notes

- Add RLS or an equivalent database backstop to finance tables and retrieval tables.
- Use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` where owner bypass would weaken personal privacy.
- Stamp request context explicitly so finance operations always run with the current tenant, user, and project scope.
- Audit upload, OCR start and completion, extraction success and failure, draft creation, draft confirmation, voiding, and purge actions.
- Apply retention to drafts, OCR artifacts, linked documents, and transactions as a single data family.
- Ensure retention and purge also clear any library-backed finance evidence from search indexes and vector artifacts.
- Keep personal data owner-only by default, including against tenant admins unless a separate policy says otherwise.
- Gate hard personal retrieval until the legacy backfill is verified.
- Roll out in phases: text drafts, personal locking, OCR, retrieval isolation, then hardening.

## Security Rules

- Prompt injection defense relies on structured outputs, validation, least privilege, and human-in-the-loop handling for ambiguous actions.
- File-upload defense relies on allowlists, signature checks, sandboxing, and bounded processing.
- RLS must be a backstop, not the only guard.

## Validation

- RLS regression tests should prove wrong tenant, wrong user, or wrong project cannot read personal finance rows.
- Retention tests should prove drafts, OCR artifacts, links, and transactions delete or purge together as intended.
- Audit tests should cover upload, extraction, confirmation, voiding, and purge.
- Cleanup tests should prove purged personal evidence disappears from library search, chunk search, and vector search.
- Rollout-gate tests should prove hard personal retrieval does not activate before backfill verification passes.
