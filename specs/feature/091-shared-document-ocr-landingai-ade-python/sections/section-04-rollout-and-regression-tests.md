# Section 04 - Rollout and Regression Tests

## Ownership

Own rollout safety, monitoring, and the regression matrix that proves the shared document OCR path works without breaking other media flows.

## Target files / modules

- `python-backend/tests/unit/api/test_internal_library_extract.py`
- `python-backend/tests/unit/services/<new-ade-adapter>.py`
- `apps/web/server/services/__tests__/financeDocumentExtractionService.test.ts`
- `apps/web/server/services/libraryUploadPipeline.test.ts`
- `apps/web/server/services/libraryService.test.ts`
- `apps/web/server/routers/__tests__/finance.test.ts`

## Work items

1. Add regression tests for the shared document OCR path.
2. Add rollout flags or config gates if needed.
3. Add observability that makes provider selection visible in logs.
4. Verify legacy fallback behavior only triggers when policy or provider availability requires it.
5. Add coverage for unsupported MIME types, encrypted PDFs, and oversized documents.
6. Add coverage for provider outage, malformed output, and URL-expiry fallback.
7. Confirm non-document vision and video transcript behavior does not change.

## TDD expectations

- Start with the failing regressions that currently bypass ADE or use the wrong provider.
- Add one test that proves document parsing works through the new path.
- Add one test that proves non-document vision paths stay unchanged.
- Add one test that proves policy-disabled tenants never call ADE.
- Add one test that proves lineage metadata is available for debugging.
- Add one test that proves the fallback path is user-safe and logged.

## Acceptance checks

- The new feature can be rolled out safely behind a flag.
- Test coverage demonstrates no regression in finance or library ingestion.
- Logs are enough to diagnose provider selection and URL resolution.
- The regression matrix covers the main supported input classes and failure modes.
