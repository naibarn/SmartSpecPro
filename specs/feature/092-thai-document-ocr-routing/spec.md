# 092 - Thai Document OCR Routing with Typhoon OCR 1.5

Version: 1.0  
Date: 2026-04-12  
Status: Proposed  
Depends-on: 091-shared-document-ocr-landingai-ade-python, 070-local-client-llm-mode  
Audience: Product, Admin Settings, Web Control Plane, Python Backend, Library/RAG, Finance, Security, QA

---

## 1. Executive summary

SmartSpecPro should let admins choose which OCR provider is used for each document class:

- raster images such as `jpg`, `jpeg`, and `png`
- PDF documents

The primary Thai OCR engine for this feature is Typhoon OCR 1.5 (`typhoon-ocr`) consumed through a remote API. The product goal is to make Thai-heavy document understanding more reliable without forcing every document type through one shared provider.

This feature does not replace the shared document OCR backbone. It adds a routing layer and admin settings so the platform can choose the best OCR backend per file class.

---

## 2. Problem statement

The current document OCR setup is too coarse for real-world document workflows:

- the admin surface only exposes generic document OCR settings
- provider selection is not clearly separated by file type
- image documents and PDFs may have different best-fit backends
- Thai receipts, slips, and scanned PDFs need a clearer default path

That creates three problems:

1. admins cannot say "use provider A for images and provider B for PDFs"
2. the system cannot express a Thai-first default for document OCR
3. future provider swaps become risky because routing is hidden inside backend logic

Typhoon OCR 1.5 is a strong fit for this gap because the official Typhoon docs describe it as a document parsing model with Thai understanding and support for image and PDF input. In this feature it is treated as a remote API integration, not a local install.

---

## 3. Goals

### 3.1 Functional goals

- Let admins configure a separate OCR provider for raster images and PDFs.
- Make Typhoon OCR 1.5 available as a first-class provider choice.
- Keep the admin experience inside `/admin/settings` under the existing Document OCR section.
- Route uploads server-side based on normalized MIME type and file signature.
- Preserve the current document OCR crediting and audit trail behavior.

### 3.2 Product goals

- Improve OCR quality for Thai documents.
- Avoid forcing PDFs and images through the same provider when they have different strengths.
- Keep document OCR behavior deterministic and explainable.
- Keep provider credentials server-side only.

### 3.3 Non-functional goals

- Fail closed on ambiguous or mismatched file types.
- Keep rate-limit handling and queueing inside the backend.
- Preserve tenant and user scoping already used by downstream document workflows.

---

## 4. Non-goals

- Do not replace the shared document OCR backbone introduced by feature 091.
- Do not expose Typhoon OCR credentials to client code.
- Do not make local/browser OCR the document-grade path.
- Do not add automatic OCR fallback across file classes unless explicitly configured.
- Do not change the existing credit model in this feature.
- Do not build a general image vision product surface here.

---

## 5. Locked product decisions

1. Typhoon OCR 1.5 is the recommended Thai document OCR provider for this feature.
2. OCR routing must be configurable separately for images and PDFs.
3. Routing decisions are made on the server using MIME type plus file signature checks.
4. Admin settings live in the existing `document_ocr` settings category.
5. Provider secrets remain encrypted and server-side only.
6. PDF and image routing may point to the same provider or different providers.
7. If a file cannot be classified safely, the system must fail closed or send the document to manual review.

---

## 6. Typhoon OCR basis

Official Typhoon documentation for OCR indicates:

- the model name is `typhoon-ocr`
- the model is Typhoon OCR 1.5
- it is the latest recommended OCR model in the Typhoon product line
- it accepts image and PDF inputs
- it is intended for structured, layout-aware document parsing

Operationally, this means Typhoon OCR can serve as the default Thai document OCR backend for both image and PDF uploads when admins choose it.

References:

- https://docs.opentyphoon.ai/en/ocr/
- https://opentyphoon.ai/model/typhoon-ocr

---

## 7. Admin settings design

### 7.1 Settings section

Add a dedicated routing subsection to the existing Document OCR tab in `/admin/settings`.

The subsection should make it obvious that routing is separated by file type:

- image OCR provider for `jpg`, `jpeg`, `png`
- PDF OCR provider for `pdf`

Suggested copy:

- "Choose the OCR provider used for image uploads"
- "Choose the OCR provider used for PDF documents"

### 7.2 New settings keys

Store the routing configuration in the existing `system_settings` table under category `document_ocr`.

These settings are deployment-wide admin settings, not tenant-scoped settings. They control the default OCR routing for the whole deployment, while tenant policy still decides whether external document OCR is allowed at all.

Required keys:

- `image_ocr_provider`
- `pdf_ocr_provider`

Recommended additional key:

- `typhoon_ocr_api_key`

Existing keys remain valid:

- `landingai_ade_api_key`
- `ocr_credits_per_page`

### 7.3 Provider options

The provider dropdown should expose the documented server-side OCR providers that the platform can actually call.

Minimum expected options:

- `typhoon_ocr_1_5`
- `landingai_ade`

If the platform later adds more OCR providers, they can be added to the same catalog without changing the contract.

### 7.4 Credential handling

If Typhoon OCR is selected for either route, the admin surface must provide a secure API key field for Typhoon OCR.

Rules:

- store the key encrypted
- mask the value in the UI after save
- never send the secret to the browser after initial submission
- never log the raw secret

### 7.5 Compatibility and defaults

The new routing keys must be backward-compatible with the current single-provider OCR setup.

- If `image_ocr_provider` and `pdf_ocr_provider` are missing, the backend must continue to use the legacy document OCR provider path instead of failing.
- The legacy path is the current provider configured through `landingai_ade_api_key`.
- Existing installations that have only the legacy LandingAI key must keep their current OCR behavior until an admin explicitly saves the new routing settings.
- For new or freshly configured deployments, the UI may prefill Typhoon OCR 1.5 as the recommended default for both routes, but only when the Typhoon API key is configured and the tenant policy allows outbound document OCR.
- If Typhoon is selected but the Typhoon key is missing, the save must fail closed and the UI must explain that the provider is not configured.

---

## 8. Routing contract

### 8.1 File class routing

Use normalized MIME type plus signature sniffing to choose the OCR provider.

Routing matrix:

| File class | Example MIME types | Route key |
|---|---|---|
| Raster images | `image/jpeg`, `image/png` | `image_ocr_provider` |
| PDF documents | `application/pdf` | `pdf_ocr_provider` |
| Other supported document-style images | `image/webp`, `image/gif`, `image/heic`, `image/heif` | legacy OCR path |

The implementation should also treat `.jpg` and `.jpeg` as image inputs even if the upload path provides only filename extension hints.

### 8.2 Classification rules

- Prefer MIME type if it is reliable.
- Use file signature sniffing when MIME type is missing or ambiguous.
- Reject mismatches where the declared type does not match the file contents.
- Do not infer PDF routing from file name alone.
- Do not send unsupported image formats to Typhoon OCR 1.5 unless a later phase explicitly adds conversion or a Typhoon-compatible fallback path.

### 8.3 Default behavior

- If the image provider and PDF provider are both set to Typhoon OCR 1.5, the system should route both classes there.
- If the selected provider is unavailable, the backend should retry within its normal policy and then fail explicitly or fall back only if an explicit fallback provider is configured.
- The system must not silently reroute a PDF to an image-only path or vice versa.
- Unsupported image formats such as WebP, GIF, HEIC, and HEIF must keep using the legacy OCR path unless the admin explicitly changes the routing model in a later phase.

### 8.4 Backend ownership

The routing decision belongs in the backend services that already process document uploads:

- `apps/web/server/services/documentOcrSettings.ts`
- `apps/web/server/services/libraryUploadPipeline.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`

The client should only render settings and display status, not make routing decisions.

### 8.5 Policy gate

Typhoon OCR and the legacy external document OCR path must both obey the existing outbound document OCR policy gate.

- If `documentOcrExternalProcessing` is disabled for a tenant, the backend must not call any external OCR provider.
- The admin UI should show the routing choices as unavailable or disabled in that tenant context.
- The backend must fail closed rather than silently switching to another external provider when the policy gate is off.

---

## 9. Integration points

### 9.1 Admin settings page

Update `apps/web/client/src/pages/AdminSettings.tsx` to:

- load the new OCR routing keys
- show provider selectors for image and PDF OCR
- show a secure Typhoon OCR API key field
- clearly indicate when external OCR is blocked by tenant policy
- keep the existing OCR credits setting visible
- save each setting independently with clear success/error feedback

### 9.2 System settings router

Update `apps/web/server/routers/systemSettings.ts` to accept the new `document_ocr` keys.

The router should continue using the existing encrypted `system_settings` storage pattern.

### 9.3 Document OCR settings service

Update `apps/web/server/services/documentOcrSettings.ts` so it returns:

- current image OCR provider
- current PDF OCR provider
- Typhoon OCR API key state
- existing credit-per-page setting

### 9.4 OCR consumers

Update document OCR consumers so they resolve provider choice from file class:

- library uploads
- finance document extraction
- any other document OCR entry points that use the shared document OCR service

---

## 10. Security and operational requirements

1. Typhoon OCR remains server-mediated.
2. Client code must never hold Typhoon OCR secrets.
3. Route selection must fail closed if file classification is uncertain.
4. Keep OCR jobs bounded by backend rate-limit handling and queueing.
5. Preserve audit metadata for provider choice and fallback reason.
6. Do not broaden OCR permissions by default when enabling Typhoon OCR.

Typhoon OCR rate limits should be respected by the backend scheduler and retry policy. The official Typhoon documentation lists `typhoon-ocr` at 2 requests per second and 20 requests per minute.

---

## 11. Data and audit expectations

When an OCR job runs, the platform should record:

- tenant ID
- user ID or owner scope where applicable
- file class used for routing
- chosen provider
- input MIME type
- detected file signature class
- page count when applicable
- OCR status
- fallback reason if any
- trace ID

This lineage makes it possible to answer:

- why a document used a particular provider
- whether the document was treated as image or PDF
- whether Typhoon OCR or another provider handled the job

---

## 12. Testing strategy

### 12.1 Backend tests

- image files route to `image_ocr_provider`
- PDF files route to `pdf_ocr_provider`
- WebP, GIF, HEIC, and HEIF continue to use the legacy OCR path
- mismatched MIME and signature is rejected
- missing routing keys fall back to the legacy OCR path
- Typhoon OCR API key is stored encrypted and masked in reads
- Typhoon selection is rejected when the key is missing
- outbound OCR is blocked when tenant policy disables external document processing
- provider choice is preserved in audit metadata
- rate-limit and retry behavior does not leak secrets

### 12.2 Admin UI tests

- Document OCR settings panel renders both provider selectors
- Typhoon OCR key field saves and masks correctly
- image and PDF selections persist independently
- the page still shows existing OCR pricing controls

### 12.3 Integration tests

- library upload path resolves the correct provider by file class
- finance document extraction uses the same routing rules
- OCR results keep their existing downstream storage and billing behavior

---

## 13. Acceptance criteria

This feature is complete when:

- admins can configure image OCR and PDF OCR separately
- Typhoon OCR 1.5 is selectable and can be the default Thai OCR backend
- JPEG and PNG files route through the image OCR setting
- PDFs route through the PDF OCR setting
- existing deployments without the new routing keys continue to use the current legacy OCR path
- unsupported document-style image formats continue to work through the legacy OCR path
- external OCR stays blocked when the tenant policy disables it
- credentials remain server-side only
- existing OCR consumers keep working without a second OCR subsystem
