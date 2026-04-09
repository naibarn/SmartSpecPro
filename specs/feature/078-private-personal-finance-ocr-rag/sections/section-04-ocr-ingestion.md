# section-04-ocr-ingestion

## Objective

Let users upload finance documents safely and convert them into draft records through OCR and extraction.

## Scope

This section owns the finance-safe upload path, OCR worker integration, extraction traceability, and draft creation from documents.

## Files to Change

- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/financeOcrService.ts` or the repo’s chosen OCR worker/service file
- `apps/web/server/services/financeDocumentExtractionService.ts` if OCR and extraction are separated

## Implementation Notes

- Reuse the existing library upload pipeline for storage, checksuming, and sandbox dispatch.
- Narrow the finance path to finance-approved file types only.
- Accept receipt photos, screenshots, and PDFs for finance uploads.
- Reject archives, office docs, password-protected PDFs, and any MIME/signature mismatch.
- Enforce size, page, and batch caps before OCR starts.
- Add a request-side abuse gate so OCR intake is rate-limited or quota-limited before uploads ever reach the worker queue.
- Keep OCR text separate from prompts so document text cannot alter instructions or scope.
- Run OCR and parsing in bounded workers with memory and wall-clock limits.
- Persist OCR traces in `document_extractions`.
- Create or update a draft after OCR completes.
- Ask a targeted clarification question when confidence is too low instead of inventing missing values.
- Link the original library item to the draft and then to the transaction after the user confirms.
- Fail closed or route to a locally approved path if tenant policy blocks outbound document processing.

## Security Rules

- Never log raw full-document text by default.
- Use the same signature-validation discipline already used by the library upload stack.
- Keep OCR workers isolated and minimize the data sent to any external provider.

## Validation

- Upload tests should reject spoofed content types, invalid signatures, oversized uploads, and disallowed MIME types.
- Worker tests should cover missing ownership, missing tenant context, and missing project context.
- Extraction tests should prove the low-confidence path generates clarification metadata.
