<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-db-migration
section-02-pptx-importer
section-03-gslides-importer
section-04-celery-fastapi
section-05-trpc-router
section-06-service-callback
section-07-import-dialog
section-08-editor-integration
section-09-tests
section-10-security-qa
END_MANIFEST -->

# Implementation Sections Index — Feature 024: Import Presentations

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-db-migration | — | 05, 06 | Yes (first) |
| section-02-pptx-importer | — | 04 | Yes (parallel with 03) |
| section-03-gslides-importer | — | 04 | Yes (parallel with 02) |
| section-04-celery-fastapi | 02, 03 | 05, 06 | No |
| section-05-trpc-router | 01, 04 | 06, 07 | No |
| section-06-service-callback | 01, 05 | 07 | No |
| section-07-import-dialog | 05, 06 | 08 | No |
| section-08-editor-integration | 07 | 09 | No |
| section-09-tests | 02, 03, 04, 05, 06, 07, 08 | 10 | No |
| section-10-security-qa | 09 | — | No |

## Execution Order

1. **Batch 1 (parallel):** section-01-db-migration, section-02-pptx-importer, section-03-gslides-importer
2. **Batch 2 (sequential):** section-04-celery-fastapi (needs 02 + 03)
3. **Batch 3 (sequential):** section-05-trpc-router (needs 01 + 04)
4. **Batch 4 (sequential):** section-06-service-callback (needs 01 + 05)
5. **Batch 5 (sequential):** section-07-import-dialog (needs 05 + 06)
6. **Batch 6 (sequential):** section-08-editor-integration (needs 07)
7. **Batch 7 (sequential):** section-09-tests (needs 02–08)
8. **Batch 8 (sequential):** section-10-security-qa (needs 09)

## Section Summaries

### section-01-db-migration
Drizzle schema changes to `presentationConversionRecords`: add `status`, `progress`, `userId`, `slidesUrl` columns; make `sourceItemId`, `deckLibraryItemId`, `deckId` nullable; fix unique index. Update `sourceFormat` constants in contracts.ts. Run `pnpm db:push` and verify migration. **Test command:** `cd apps/web && pnpm check` (TypeScript type check).

### section-02-pptx-importer
New `python-backend/app/services/pptx_importer.py` with `PptxImporter` class. Parses PPTX shapes (text, image, rect, line, group) into `PresentationSlideContent` dicts. Handles coordinate conversion (EMU→px), uploads images via `R2StorageService.upload_bytes`, emits fidelityWarnings for unsupported shapes. Add `python-pptx>=1.0.2` to requirements.txt. Add `upload_bytes` method to `R2StorageService`. Define `ImportResult` dataclass in `presentation_importer.py`. **Test command:** `cd python-backend && uv run pytest tests/test_pptx_importer.py -v --cov=app`.

### section-03-gslides-importer
New `python-backend/app/services/gslides_importer.py` with `GSlidesImporter` class. Calls Google Slides REST API, front-loads all image downloads (contentUrl is short-lived), parses pageElements into slide content dicts. Handles AffineTransform coordinates (EMU), float RGB colors, themeColor fallback, non-uniform transform detection. **Test command:** `cd python-backend && uv run pytest tests/test_gslides_importer.py -v --cov=app`.

### section-04-celery-fastapi
New Celery task `import_presentation_task` in `presentation_import_tasks.py` following `_run_async()` pattern. New FastAPI router `presentation_import.py` with `POST /api/v1/presentation-import/start` and `GET /api/v1/presentation-import/status/{conversion_id}`. Register router in `app/main.py`. Task retrieves Google token via `GoogleTokenService.get_valid_access_token()` (not passed from Node.js). Updates DB progress per slide. Calls `_notify_nodejs` on completion. **Test command:** `cd python-backend && uv run pytest tests/ -v -k "import_api" --cov=app`.

### section-05-trpc-router
New `apps/web/server/routers/presentationImport.ts` with `startImport`, `getImportStatus`, `cancelImport` procedures. Register in `routers/index.ts`. `startImport` creates conversion record, calls Python start endpoint. `getImportStatus` reads DB (tenant-scoped). `cancelImport` sets status "cancelled" + notifies Python. **Test command:** `cd apps/web && pnpm test`.

### section-06-service-callback
New `apps/web/server/services/presentationImportService.ts` with `createDeckFromImportResult`. Internal Express route `POST /api/internal/presentation-import/callback` authenticated via `SMARTSPEC_WEB_GATEWAY_TOKEN`. Idempotency check prevents duplicate deck creation. Creates libraryItem + deck + slides + sourceAttachments on "done" callback. **Test command:** `cd apps/web && pnpm test`.

### section-07-import-dialog
New `apps/web/client/src/components/presentation/ImportPresentationDialog.tsx`. Radix Dialog with 5-step state machine (select → uploading → processing → result → error). PPTX upload via XHR with progress events. Google Slides URL tab with OAuth connection check. TanStack Query v5 polling with conditional `refetchInterval`. Cancel support for both upload and processing phases. **Test command:** `cd apps/web && pnpm test`.

### section-08-editor-integration
Modify `apps/web/client/src/pages/PresentationEditor.tsx`. Add "Import" button (secondary, Upload icon) in header toolbar. Add `isImportDialogOpen` state. Render `<ImportPresentationDialog>` conditionally. **Test command:** `cd apps/web && pnpm test`.

### section-09-tests
Complete test coverage for all sections. Python: `test_pptx_importer.py` and `test_gslides_importer.py` with all test stubs from claude-plan-tdd.md implemented. TypeScript: dialog state machine tests, callback route tests, service tests. Verify `pytest --cov-fail-under=80` passes. **Test command:** `cd python-backend && uv run pytest --cov=app --cov-fail-under=80`.

### section-10-security-qa
Security validation pass: review SSRF protection, callback auth, tenant isolation, file size checks, token handling. Run full QA checklist from claude-plan.md Section 10. Verify all manual test cases. Final `pnpm check` and `pnpm test` pass. **Test command:** `cd apps/web && pnpm check && pnpm test && cd ../../python-backend && uv run pytest --cov=app --cov-fail-under=80`.
