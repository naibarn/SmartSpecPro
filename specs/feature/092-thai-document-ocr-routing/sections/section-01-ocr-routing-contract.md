# section-01-ocr-routing-contract

## Purpose

Create the canonical OCR routing contract and settings-reading behavior that every other workstream will rely on.

## Files in scope

- `apps/web/shared/documentOcrRouting.ts` - new shared provider/file-class contract
- `apps/web/server/services/documentOcrSettings.ts` - extended settings reader and helper utilities
- `apps/web/server/routers/systemSettings.ts` - accepts and persists the new OCR keys

## Implementation notes

1. Define shared provider IDs and labels for:
   - `typhoon_ocr_1_5`
   - `landingai_ade`
2. Define file classes:
   - `image`
   - `pdf`
   - `legacy`
3. Define a helper that classifies uploads from normalized MIME type and file-sniffing results.
4. Extend the settings reader to load:
   - `image_ocr_provider`
   - `pdf_ocr_provider`
   - `typhoon_ocr_api_key`
   - the existing LandingAI and pricing keys
5. Keep the legacy OCR path as the default when routing keys are missing.
6. Make sure secret values remain encrypted at rest and masked on read.
7. Export a `clearDocumentOcrSettingsCache()` helper so `document_ocr` updates refresh values immediately after save.

## Acceptance criteria

- Shared provider/file-class contract exists and is used by backend and UI code.
- Missing routing keys do not break existing OCR behavior.
- Typhoon secret handling remains server-side only.
