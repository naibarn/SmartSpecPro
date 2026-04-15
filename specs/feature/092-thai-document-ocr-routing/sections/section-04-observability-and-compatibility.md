# section-04-observability-and-compatibility

## Purpose

Keep the rollout safe by preserving compatibility, traceability, and clear fallback semantics.

## Files in scope

- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- any audit/log helper touched by those services

## Implementation notes

1. Preserve provider/file-class metadata in OCR trace output.
2. Record fallback reasons when the legacy path is used.
3. Ensure logs and audit data never contain raw Typhoon secrets.
4. Leave the current legacy OCR path intact for existing installations.
5. Document the fact that no database migration is required.
6. Keep unsupported image classes traceable through the legacy path.
7. Invalidate cached OCR settings immediately after any `document_ocr` save.

## Acceptance criteria

- Audit metadata explains why a given provider was chosen.
- No secret leakage occurs in logs or traces.
- Existing deployments remain stable until admins opt into the new routing settings.
