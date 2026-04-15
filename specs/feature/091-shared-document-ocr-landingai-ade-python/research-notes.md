# Research Notes

## LandingAI ADE fit

LandingAI ADE is a document workflow, not a generic scene-vision system.

Key documented behaviors:
- Parse first, then extract.
- `api.parse` accepts publicly accessible URLs or staged files.
- Parse output includes markdown, chunks, splits, grounding, metadata, and errors.
- `api.extract` runs against parsed markdown or markdown URLs with a JSON schema.
- The docs explicitly recommend using the Python library for new projects.

This makes ADE a strong fit for:
- receipts
- invoices
- bank slips
- statements
- scanned PDFs / images

It is not a replacement for:
- image captioning of arbitrary scenes
- UI / screenshot understanding
- video frame analysis

## Repo scan

Relevant current code paths already exist:
- `python-backend/app/api/internal_library.py`
- `python-backend/app/services/onedrive_content_extractor.py`
- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/drizzle/schema.ts`

Current patterns that matter:
- upload pipeline already distinguishes `document_ocr`, `real_world_vision`, and `video_transcript`
- finance ingestion already expects OCR text plus provenance metadata
- library items, chunks, and document extractions already carry tenant / project / owner scope
- the system already has a storage abstraction that can expose public or temp URLs

## Security / privacy scan

This feature will process private finance and document content, so the integration must:
- preserve tenant / project / owner isolation
- avoid leaking local URLs or internal file paths to the provider
- use public or signed temp URLs only when policy allows
- fail closed when a tenant disallows external document processing
- retain audit logs for provider, model version, and source URL kind

## Practical conclusion

ADE is worth adopting as a shared document OCR / parse backbone if the product goal is:
- higher reliability on document uploads
- one common parsing layer for multiple features
- schema-driven extraction for finance and library use cases

It is not worth using as the only OCR layer for the whole platform unless we accept:
- an external service dependency
- compliance / residency review
- different handling for non-document vision workloads

