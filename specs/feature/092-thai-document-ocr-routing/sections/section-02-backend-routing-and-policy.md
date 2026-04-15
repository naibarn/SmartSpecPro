# section-02-backend-routing-and-policy

## Purpose

Teach the backend OCR consumers to use the shared routing contract while respecting tenant policy gates and legacy fallback behavior.

## Files in scope

- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `apps/web/server/services/documentOcrSettings.ts`

## Implementation notes

1. Route JPEG and PNG through the configured image OCR provider.
2. Route PDF through the configured PDF OCR provider.
3. Keep WebP, GIF, HEIC, and HEIF on the legacy OCR path for now.
4. Reject MIME/content mismatches before dispatching OCR.
5. Treat missing routing keys as a compatibility case, not a hard failure.
6. Obey `documentOcrExternalProcessing` for all external OCR calls.
7. Preserve the OCR trace and add the chosen provider and file class to the recorded metadata.

## Acceptance criteria

- Backend chooses the correct provider for each supported file class.
- Tenant policy blocks all external OCR when disabled.
- Legacy deployments continue to work without new routing keys.

