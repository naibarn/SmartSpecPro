# Section 01 review input

The repository is dirty, so this review input intentionally does not contain a
broad staged diff. Review these exact owned changes against
`sections/section-01-server-contract.md`:

- New `apps/web/server/services/verticalDramaDraftCleanup.ts`
- New `apps/web/server/services/__tests__/verticalDramaDraftCleanup.test.ts`
- Only the `verticalDramaDraftCleanup` import, `listDraftJobs` cleanup summary,
  and `archiveStaleDraftJobs` procedure hunks in
  `apps/web/server/routers/verticalDramaSeries.ts`

Verification before review: focused service and existing ledger suites passed
2 files / 6 tests; scoped whitespace check passed.
