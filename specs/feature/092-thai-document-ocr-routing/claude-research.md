# Research Notes - 092 Thai Document OCR Routing with Typhoon OCR 1.5

## Codebase research

### Existing document OCR boundary

The repo already has a shared document OCR path for finance and library flows.

Key files and signals:

- `apps/web/server/services/documentOcrSettings.ts`
  - stores legacy OCR settings in `system_settings` category `document_ocr`
  - currently tracks `landingai_ade_api_key` and `ocr_credits_per_page`
  - exposes OCR helper utilities such as page counting and provider resolution
- `apps/web/server/services/libraryUploadPipeline.ts`
  - determines document analysis profile
  - blocks `document_ocr` when `documentOcrExternalProcessing` is disabled
  - already handles file signatures and complex document routing
- `apps/web/server/services/financeDocumentExtractionService.ts`
  - reuses the same external-processing gate
  - only allows external OCR when tenant policy permits it
  - emits `document_ocr_policy_blocked` / OCR lineage metadata
- `apps/web/server/routers/systemSettings.ts`
  - generic admin setting router with `getSettingsByCategory` and `updateSetting`
  - accepts `document_ocr` as a category already
- `apps/web/client/src/pages/AdminSettings.tsx`
  - admin settings page already has a Document OCR tab
  - currently renders LandingAI key + credits-per-page controls

### Existing policy gate

The current product already has a tenant feature flag named `documentOcrExternalProcessing`.

Relevant pattern:

- admin UI exposes the flag in `TenantFeatureFlagsPanel`
- backend consumers check `featureFlags.documentOcrExternalProcessing`
- when disabled, OCR paths fail closed instead of trying an external provider

### Existing file-type coverage

The finance document path currently allows more than PDF/JPEG/PNG:

- `application/pdf`
- `image/jpeg`
- `image/png`
- `image/webp`
- `image/gif`
- `image/heic`
- `image/heif`

That means the new routing spec must explicitly decide what happens to non-Typhoon-supported image classes instead of leaving them implicit.

## Web research

Official Typhoon OCR documentation confirms:

- model ID: `typhoon-ocr`
- product name: Typhoon OCR 1.5
- default/recommended endpoint for new integrations
- supported input types: PNG, JPEG, PDF
- output is layout-aware Markdown / structured document parsing
- page-specific PDF processing is supported
- rate limits: 2 req/s and 20 req/min

Sources:

- https://docs.opentyphoon.ai/en/ocr/
- https://opentyphoon.ai/model/typhoon-ocr

## Testing research

The repo uses:

- `vitest` for TypeScript/React tests in `apps/web`
- `pytest` for Python backend tests
- `@testing-library/react` + `jsdom` for UI coverage where needed
- heavy mocking via `vi.mock`, `vi.hoisted`, and DB/service stubs

Relevant patterns:

- server tests live alongside the service/router being tested
- UI tests frequently mock `trpc`, auth context, translations, and child components
- backend tests usually assert routing/policy behavior with mocked DB and feature flags

## Planning implications

1. The new feature should extend the existing `document_ocr` admin category rather than inventing a new admin surface.
2. Tenant policy must remain the authoritative gate for outbound external OCR.
3. Typhoon OCR should be treated as a new routing option, not a replacement for the existing legacy document OCR path.
4. Non-Typhoon image classes need an explicit legacy/default path because the current codebase already accepts them.
5. Test coverage should mirror repo conventions: Vitest UI tests, Vitest server tests, and a small number of targeted backend policy assertions.
