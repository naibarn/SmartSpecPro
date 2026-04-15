# Claude Plan TDD - 092 Thai Document OCR Routing with Typhoon OCR 1.5

## 1. Summary

The test plan mirrors the implementation plan and follows the repo's existing test style:

- Vitest for TypeScript backend and frontend coverage
- Testing Library with jsdom for admin UI behavior
- focused service tests for backend routing and policy gates

The key test objective is not just "does Typhoon work", but "does routing remain correct, safe, and backward-compatible across the legacy and new paths".

## 2. Workstream 1 - Shared OCR routing contract and settings reader

### Tests to write before implementation

- Verify the canonical OCR provider catalog exposes `typhoon_ocr_1_5` and `landingai_ade`.
- Verify file-class mapping treats `image/jpeg` and `image/png` as image class.
- Verify `application/pdf` maps to pdf class.
- Verify `image/webp`, `image/gif`, `image/heic`, and `image/heif` map to the legacy class for now.
- Verify missing routing keys resolve to the legacy path rather than throwing.
- Verify Typhoon secret reads are masked or redacted in the settings read path.
- Verify document OCR cache invalidation causes updated keys to become visible immediately after save.
- Verify `clearDocumentOcrSettingsCache()` is invoked after a successful `document_ocr` save.

## 3. Workstream 2 - Backend routing and policy gate

### Tests to write before implementation

- Verify library upload routing sends JPEG and PNG to the image provider key.
- Verify library upload routing sends PDF to the PDF provider key.
- Verify unsupported image classes still use the legacy OCR path.
- Verify MIME/content mismatch is rejected before OCR dispatch.
- Verify finance OCR uses the same routing decision as library uploads.
- Verify `documentOcrExternalProcessing = false` blocks all external OCR calls.
- Verify missing new routing keys fall back to the legacy OCR path.
- Verify fallback and error messages do not leak provider secrets.
- Verify `document_ocr` setting updates invalidate cached routing state instead of waiting for TTL expiry.
- Verify the cache-clearing helper is wired into the `systemSettings.updateSetting` path.

## 4. Workstream 3 - Admin settings UI

### Tests to write before implementation

- Verify the Document OCR section renders image and PDF provider selectors.
- Verify the Typhoon API key field renders and masks configured values.
- Verify the legacy LandingAI API key control is still visible in the OCR section.
- Verify the page still renders the existing OCR credits control.
- Verify the save flow updates image routing without overwriting PDF routing.
- Verify the save flow updates PDF routing without overwriting image routing.
- Verify the OCR settings page exposes the full config matrix: image provider, PDF provider, Typhoon key, LandingAI key, and pricing control.
- Verify the UI shows a disabled/unavailable state when tenant policy blocks external OCR.
- Verify the UI explains when Typhoon is selected but the Typhoon key is missing.
- Verify the UI uses the tenant feature flag state to explain when external OCR is blocked.

## 5. Workstream 4 - Observability, legacy fallback, and rollout safety

### Tests to write before implementation

- Verify OCR audit metadata records provider, file class, and fallback reason.
- Verify no log or audit path contains raw Typhoon secret material.
- Verify legacy deployments keep the legacy OCR path until the new keys are set.
- Verify unsupported image classes continue to be traceable through the legacy path.
- Verify the implementation does not require a DB migration or schema rewrite.
- Verify cache invalidation prevents stale routing after admin saves.

## 6. Workstream 5 - Tests and validation

### End-to-end style checks

- library upload flow preserves old behavior until new settings exist
- finance OCR and library OCR agree on file-class provider selection
- outbound OCR remains blocked under the tenant feature flag
- Typhoon OCR routing works for image and PDF documents when configured

### Regression coverage expectations

- no regression in the existing document OCR crediting behavior
- no regression in `systemSettings.updateSetting`
- no regression in the admin settings page when only LandingAI is configured
- no stale routing values after settings are updated
