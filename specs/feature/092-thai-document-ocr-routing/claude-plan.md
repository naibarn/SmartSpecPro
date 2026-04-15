# Claude Plan - 092 Thai Document OCR Routing with Typhoon OCR 1.5

## 1. Summary

This feature adds an admin-controlled OCR routing layer on top of the existing shared document OCR backbone.

The product decision is straightforward:

- use Typhoon OCR 1.5 (`typhoon-ocr`) as the recommended Thai document OCR engine via remote API
- route raster images and PDFs independently
- keep the legacy document OCR path working for existing deployments and unsupported image classes
- keep outbound OCR blocked when tenant policy disables external document processing

The repo already has the right primitives:

- `system_settings` stores admin-managed keys
- the Document OCR tab already exists in `AdminSettings.tsx`
- `documentOcrExternalProcessing` already gates outbound OCR in the backend
- `libraryUploadPipeline.ts` and `financeDocumentExtractionService.ts` already own document OCR consumption

The plan below keeps the change additive and low-risk.

## 2. Implementation strategy

The implementation should be split into five workstreams:

1. define a canonical OCR routing contract and settings reader
2. update backend consumers to resolve OCR provider by file class
3. update the admin settings UI to manage the new provider keys and Typhoon secret
4. preserve observability, fallback behavior, and compatibility with the existing legacy path
5. add tests for the routing matrix, policy gate, and admin UX

The plan assumes no database migration is needed because `system_settings` already supports arbitrary keys and the feature is deliberately backward-compatible. Existing installations keep their current behavior until an admin saves the new routing settings.

## 3. Workstream 1 - Shared OCR routing contract and settings reader

### Goal

Create a canonical contract for OCR provider IDs, file classes, and settings keys so the backend and admin UI do not drift apart.

### Recommended files

- `apps/web/shared/documentOcrRouting.ts` - new shared contract for provider IDs, labels, supported file classes, and helpers
- `apps/web/server/services/documentOcrSettings.ts` - extend the settings reader to load and cache the new routing keys
- `apps/web/server/routers/systemSettings.ts` - keep the generic key writer, but ensure the new keys are accepted and masked the same way as the existing secret keys

### What this workstream should do

- Define canonical provider IDs:
  - `typhoon_ocr_1_5`
  - `landingai_ade`
- Define file-class buckets:
  - `image`
  - `pdf`
  - `legacy`
- Define a helper that maps normalized MIME types and content sniffing results to a file class.
- Add settings accessors for:
  - `image_ocr_provider`
  - `pdf_ocr_provider`
- `typhoon_ocr_api_key`
  - the existing `landingai_ade_api_key`
  - `ocr_credits_per_page`
- Preserve the legacy behavior when the new routing keys are missing.
- Add an explicit cache invalidation hook so `document_ocr` writes refresh routing state immediately instead of waiting for the TTL to expire.
- Expose a `clearDocumentOcrSettingsCache()` helper and call it from the `document_ocr` save path.

### Key design rules

- Deployment-wide admin settings, not tenant-scoped settings.
- Existing data stays valid.
- Missing new keys mean "use legacy path", not "fail closed".
- Typhoon secret storage must remain encrypted and never leak in a read path.
- Cache invalidation should happen on every `document_ocr` update so backend consumers do not see stale routing values.
- `systemSettings.updateSetting` should clear the document OCR cache after successful writes to the `document_ocr` category.

## 4. Workstream 2 - Backend routing and policy gate

### Goal

Make the OCR-consuming backend services ask the shared contract which provider to use for each document class, while obeying the tenant policy gate.

### Recommended files

- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `apps/web/server/services/documentOcrSettings.ts`
- any small helper module introduced by workstream 1

### What this workstream should do

- Route `image/jpeg` and `image/png` through `image_ocr_provider`.
- Route `application/pdf` through `pdf_ocr_provider`.
- Keep `image/webp`, `image/gif`, `image/heic`, and `image/heif` on the legacy OCR path for now.
- Reject MIME/content mismatches before any OCR provider call.
- If routing keys are missing, fall back to the legacy OCR path.
- If the tenant feature flag `documentOcrExternalProcessing` is disabled, do not call any external OCR provider.
- Do not silently switch from one external provider to another when the policy gate is off.

### Key design rules

- File classification happens server-side.
- No file-name-only inference for routing.
- Typhoon OCR is an external provider and must obey the same outbound OCR policy gate as the existing external OCR path.
- The consumers should preserve existing audit metadata and add the selected provider and file class to the trace.
- Invalidate the document OCR settings cache when any `document_ocr` key changes.

## 5. Workstream 3 - Admin settings UI

### Goal

Expose the new routing choices in the existing Document OCR section of `/admin/settings` without bloating the page or leaking secrets.

### Recommended files

- `apps/web/client/src/pages/AdminSettings.tsx`
- optionally `apps/web/client/src/components/admin/DocumentOcrSettingsPanel.tsx` if the page should be split for maintainability

### What this workstream should do

- Load the new document OCR keys alongside the existing LandingAI and credit settings.
- Render two provider selectors:
  - image OCR provider
  - PDF OCR provider
- Render a secure Typhoon API key field for the remote Typhoon API.
- Show the existing OCR pricing control unchanged.
- Mask configured secrets after save.
- Make it obvious when tenant policy blocks external OCR.
- Keep the save actions independent so admins can change routing without accidentally overwriting unrelated OCR settings.

### OCR config matrix

The admin OCR section should surface the config keys explicitly so implementers know which controls must appear on the page:

| Setting key | Control type | Purpose | Secret? |
|---|---|---|---|
| `image_ocr_provider` | provider dropdown | OCR provider for raster images | No |
| `pdf_ocr_provider` | provider dropdown | OCR provider for PDFs | No |
| `typhoon_ocr_api_key` | password/input field | Typhoon OCR credential | Yes |
| `landingai_ade_api_key` | password/input field | Legacy document OCR credential | Yes |
| `ocr_credits_per_page` | number input | OCR pricing control | No |

The compatibility fallback key `landingai_ade_api_key` must remain visible in the admin OCR section so admins can understand both the new routing and the legacy fallback path in one place.

### Key design rules

- Use the repo's existing Vitest and Testing Library patterns.
- Keep the page behavior backward-compatible for users who only know the legacy LandingAI setup.
- If Typhoon is selected but no Typhoon key is configured, the UI should explain that the provider is not ready.

## 6. Workstream 4 - Observability, legacy fallback, and rollout safety

### Goal

Keep the feature operationally safe by preserving traceability and avoiding hidden behavior changes.

### Recommended files

- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- any audit/logger helper touched by the routing update

### What this workstream should do

- Preserve the existing OCR lineage fields and add provider/file-class metadata where missing.
- Record fallback reasons when legacy routing is used.
- Ensure logs and audit records never include the raw Typhoon secret.
- Keep the current legacy OCR path as the default for old deployments.
- Document the fact that no DB migration is required for this feature.
- Use the existing tenant feature flag hook/query in the admin UI to surface the blocked state instead of inventing a new policy source.

### Key design rules

- The routing change should be observable in logs and traces, but not noisy.
- Existing deployments should behave the same until an admin explicitly enables the new routing keys.
- Unsupported image classes should still work via the legacy path rather than becoming a surprise regression.

## 7. Workstream 5 - Tests and validation

### Goal

Prove the routing matrix, policy gate, admin UX, and compatibility behavior before shipping.

### Recommended test areas

- backend tests for routing resolution and fallback behavior
- backend tests for tenant policy blocking external OCR
- admin UI tests for provider selectors and secret masking
- integration tests for library upload and finance OCR flows

### Acceptance summary

This feature is ready when:

- admins can configure image and PDF OCR separately
- Typhoon OCR 1.5 is selectable and can be the recommended Thai provider
- legacy deployments continue to behave as before until the new settings are saved
- unsupported image classes continue to work through the legacy path
- tenant policy still blocks outbound OCR when required
- tests cover both the new routing path and the compatibility path
- cache invalidation immediately reflects updated OCR routing keys
