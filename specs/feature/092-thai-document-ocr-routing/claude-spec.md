# Claude Spec - 092 Thai Document OCR Routing with Typhoon OCR 1.5

## Product goal

Add an admin-configurable OCR routing layer so SmartSpecPro can choose different OCR providers for raster images and PDFs, with Typhoon OCR 1.5 (`typhoon-ocr`) as the recommended Thai document OCR option consumed via remote API.

## Scope

- Extend the existing `document_ocr` admin settings area.
- Add separate provider controls for:
  - image files such as `jpg`, `jpeg`, `png`
  - PDF documents
- Keep the current legacy document OCR behavior as the fallback/default for existing deployments.
- Preserve the tenant feature-flag gate for outbound external OCR.
- Keep provider secrets server-side only.

## Locked requirements

1. Settings are deployment-wide admin settings stored in `system_settings`.
2. `image_ocr_provider` and `pdf_ocr_provider` are the new routing keys.
3. `typhoon_ocr_api_key` is the new secret key for Typhoon OCR API access.
4. Missing routing keys must preserve the legacy OCR path.
5. Typhoon OCR must obey `documentOcrExternalProcessing`.
6. Typhoon OCR supports only image and PDF inputs; unsupported image classes must stay on the legacy path unless a later phase adds conversion.
7. Existing consumers (`libraryUploadPipeline`, `financeDocumentExtractionService`) must keep working without a second OCR subsystem.

## Out of scope

- No client-side OCR secrets.
- No redesign of the shared document OCR backbone.
- No change to the current credit model.
- No new general image-vision feature surface.

## Implementation model

- `AdminSettings.tsx` renders the routing controls and secret key field.
- `systemSettings.ts` persists the new keys in `document_ocr`.
- `documentOcrSettings.ts` reads, masks, and resolves routing defaults.
- document OCR consumers ask the backend which provider to use for a given file class.

## Testing model

- Vitest for web/admin settings and server routing logic.
- Backend policy tests for fallback, missing-key handling, and tenant gating.
- Integration tests to ensure file-class routing matches the expected provider and legacy fallback behavior.
