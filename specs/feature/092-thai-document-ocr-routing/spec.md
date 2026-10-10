# 092 - Thai Document OCR Routing and Adaptive Processing

Version: 1.0  
Date: 2026-04-12  
Status: Proposed  
Depends-on: 091-shared-document-ocr-landingai-ade-python, 070-local-client-llm-mode, 240-Agent-Generated UI & Safe Interactive Surfaces, 253-Universal-Product-Command-and-Capability-Interoperability, 267-smartaihub-cloudflare-production-migration-durable-execution-control-plane-v2, 229-unified-rag-retrieval-intelligence-cloudflare-ai-search-vectorize, 266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric, 272-smartaihub-credential-vault-root-of-trust-secure-provider-broker
Audience: Product, Admin Settings, Web Control Plane, Python Backend, Library/RAG, Finance, Security, QA

---

## 1. Executive summary

SmartSpecPro should let admins choose which OCR provider is used for each document class:

- raster images such as `jpg`, `jpeg`, and `png`
- PDF documents

The preferred Thai OCR route is the existing Typhoon OCR integration, currently identified by the compatibility provider ID `typhoon_ocr_1_5` and hosted model name `typhoon-ocr`. These identifiers document the current integration; they do not pin future model versions. Provider model/version and capabilities are configurable. The product goal is to make Thai-heavy document extraction more reliable without forcing every document type through one provider.

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

The existing Typhoon OCR integration is a strong fit for this gap because current provider documentation describes Thai document parsing with image and PDF support. It is treated as a hosted API route in the existing integration; any model/version change remains configurable and subject to revalidation.

---

## 3. Goals

### 3.1 Functional goals

- Let admins configure a separate OCR provider for raster images and PDFs.
- Keep the existing Typhoon OCR integration available as a first-class provider choice.
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

1. Typhoon OCR is the preferred Thai document OCR provider for this feature, while the current provider ID remains backward-compatible.
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
- the current integration identifies its model as `typhoon-ocr`
- it accepts image and PDF inputs
- it is intended for structured, layout-aware document parsing

This is a versioned vendor/integration evidence snapshot, not a product-level model pin. Revalidate provider capabilities and model versions before changing the configured route. The stable `typhoon_ocr_1_5` provider ID remains a compatibility alias until an explicit migration is planned.

Operationally, Typhoon OCR is the preferred Thai OCR route for compatible images and PDF pages when tenant policy, provider availability, quota, and configured routing permit. Existing deployments retain their current settings and integration; this policy does not force a provider migration.

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

The provider dropdown should expose the documented server-side OCR providers that the platform can actually call. Provider IDs are compatibility keys; the provider's effective model/version is resolved from current configuration/capability metadata and is not inferred from an ID suffix.

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
- For new or freshly configured deployments, the UI may prefill the current Typhoon OCR integration as the recommended Thai route for both classes, but only when the key is configured and tenant policy allows outbound document OCR.
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
- Do not send unsupported image formats to the current Typhoon OCR route unless a later phase explicitly adds conversion or a compatible fallback path.

### 8.3 Default behavior

- If the image provider and PDF provider are both set to Typhoon OCR, the system should route both classes there.
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

### 9.5 Mini App reuse

Mini Apps MUST invoke the shared SmartAIHub document processing capability and its existing background-job result contract. They MUST reuse the same tenant policy, provider eligibility, quotas/cost metering, provenance, and cancellation behavior as core consumers. A Mini App MUST NOT carry a second OCR implementation, provider credential, queue, or index. Generated Mini App surfaces and cross-product capability handoffs remain within SPEC-240 and SPEC-253 boundaries.

---

## 10. Security and operational requirements

1. Typhoon OCR remains server-mediated.
2. Client code must never hold Typhoon OCR secrets.
3. Route selection must fail closed if file classification is uncertain.
4. Keep OCR jobs bounded by backend rate-limit handling and queueing.
5. Preserve audit metadata for provider choice and fallback reason.
6. Do not broaden OCR permissions by default when enabling Typhoon OCR.

Provider quotas and concurrency are configurable provider-capacity inputs. The implementation must observe provider responses such as `Retry-After` when present and defer work through the durable scheduler; values in vendor documentation or current code are evidence snapshots, not hard-coded product limits. Rate-limit policy must not lose jobs or retry an entire document when only a page or provider attempt needs recovery.

### 10.1 Adaptive inspection and route selection

Before extraction, inspect MIME type, file signature, document structure, language hints, and page characteristics using existing parsers and routing services:

- Native-text PDF: use direct text extraction when it preserves the requested content adequately; do not OCR those pages unnecessarily.
- Scanned PDF: OCR only pages requiring recognition.
- Mixed PDF: classify and route pages independently, retaining one document-level manifest and page-level outcomes.
- Complex layout or tables: use a validated structure-aware document parser or OCR-VL route and preserve headers, rows, reading order, and source locations.
- Images: use OCR for transcription/extraction; use a document-specific or general VLM only when the requested task requires visual interpretation beyond transcription.

OCR extraction and LLM reasoning MUST remain distinct stages. Preserve the immutable original, page references, reading order, text blocks, table structure, source coordinates where available, confidence/uncertainty, warnings, extraction version, and original-to-output mapping. Uncertain values remain explicitly uncertain; the system MUST NOT invent text, amounts, or table relationships.

### 10.2 Durable job and quota handling

All asynchronous and batch OCR uses the existing SPEC-267 `worker_jobs` plus outbox/control-plane infrastructure. The OCR feature MUST NOT introduce a separate queue engine, provider registry, or execution authority.

- Schedule with provider quota/capacity awareness and tenant-level weighted fairness; keep limits and provider capability data configurable.
- Honor provider `Retry-After`; otherwise use bounded exponential backoff with jitter and a provider/job retry budget.
- Persist durable page checkpoints and idempotency keys so worker restarts resume unfinished pages without repeating accepted/completed work.
- Represent partial document completion, batch progress, cancellation, and recovery explicitly. Cancellation prevents new page assignments and follows the existing execution cancellation/settlement contract.
- Meter attempts, accepted pages, provider usage, and cost against tenant budgets. A rate-limited job waits durably or uses an explicitly approved eligible route; it is never silently dropped.
- Use the existing provider circuit-breaker and degraded-mode behavior. Do not reroute across tenant, provider, residency, or user-intent boundaries.

### 10.3 Execution routes and fallback policy

The routing policy may select among these existing or optional paths, only when the route is enabled and validated for this document and tenant:

1. Typhoon Hosted API (preferred Thai OCR route).
2. Typhoon Self-host / Local Runner (optional; requires capability negotiation, compatible runtime/model, resource limits, and quality validation).
3. A validated alternative OCR provider for the document class and language.
4. A document-specific VLM for layout-aware extraction where OCR alone is insufficient.
5. A general VLM only for a user-requested task that needs visual understanding or interpretation.

Fallback eligibility evaluates availability, Thai-language accuracy baseline, quota, cost, latency, data residency / PDPA, tenant policy, and user intent. A provider that lacks quality, rights, or compatibility evidence remains unavailable as an automatic fallback. Self-host is never mandatory; hosted Typhoon remains usable under existing policy when no eligible Runner or GPU is available. OCR work must not require a vision model to remain resident on the Debian server.

Provider credential ownership follows SPEC-272. Job dispatch, resource limits, Runner capability, receipts, and settlement follow SPEC-267 and the existing Runner contracts.

### 10.4 Quality benchmark and completion policy

Maintain a versioned, consented Thai-English benchmark with representative native PDFs, scanned PDFs, mixed PDFs, images, tables, receipts, invoices, and general document layouts. Compare the existing Typhoon Hosted baseline with Typhoon Self-host candidates and optional PaddleOCR, document OCR-VL, and hosted alternatives only when legally and technically eligible. Keep upstream/vendor results separate from SmartAIHub measurements.

Report Character Error Rate, Word Error Rate with documented Thai segmentation, Thai diacritic accuracy, field and numeric/amount accuracy, table structure accuracy, reading order, latency, throughput, retry rate, manual correction time, and cost per accepted document. Record dataset/version, provider/model/runtime configuration, sample counts, and uncertainty. Do not infer that a newer model is better. A self-host route requires compatibility and non-inferior agreed quality evidence before production enablement.

Extraction quality, retrieval usability, and action safety are evaluated independently. Partial extraction may be stored and indexed with uncertainty/provenance when useful; an OCR imperfection alone MUST NOT block the whole ordinary workflow. Apply stronger field validation only to values used for transactions or risk-sensitive decisions. Ordinary OCR does not require mandatory human approval.

### 10.5 Ownership boundaries

| Concern | Existing owner / contract | This Spec's boundary |
|---|---|---|
| OCR provider preference, document inspection, page routing, extraction quality | SPEC-091 and SPEC-092 | Specify Thai-first adaptive policy and page-level extraction contract. |
| Durable jobs, outbox, provider capacity/quota, fair scheduling, retry, circuit breaker, cancellation, recovery | SPEC-267 | Reuse the canonical job/control plane; add no OCR queue or scheduler. |
| Credentials and provider secret lifecycle | SPEC-272 | Use the existing credential broker and tenant policy. |
| RAG projections, indexing, retrieval and citations | SPEC-229 | Supply normalized, versioned Markdown/tables with source/page provenance; add no index. |
| Data/evidence identities, source lineage, rights and tenant semantics | SPEC-266 | Link extraction evidence to canonical source/document/page lineage; add no registry. |
| Model/reasoning routing | SPEC-231 | Invoke reasoning only as a separately requested/eligible stage; OCR remains extraction. |

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
- The existing Typhoon OCR integration is selectable and preferred for Thai OCR without pinning a model version
- JPEG and PNG files route through the image OCR setting
- PDFs route through the PDF OCR setting
- existing deployments without the new routing keys continue to use the current legacy OCR path
- unsupported document-style image formats continue to work through the legacy OCR path
- external OCR stays blocked when the tenant policy disables it
- credentials remain server-side only
- existing OCR consumers keep working without a second OCR subsystem

## 14. Outcome acceptance criteria and evidence state

The following criteria define the intended implementation and verification work. A Spec edit alone does not establish implementation or verification. Statuses below describe this Spec-only change at its base revision; implementation evidence must be recorded against the applicable integrated SHA in the owning lifecycle.

| ID | Acceptance criterion | Specified | Implemented | Verified | Blocked |
|---|---|---:|---:|---:|---:|
| AC-01 | Existing Typhoon OCR integration remains compatible. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-02 | The measured Thai OCR quality baseline is preserved. | Yes | Not assessed here | Not assessed here | Benchmark evidence is absent from the inspected Specs |
| AC-03 | Native-text PDFs avoid unnecessary OCR. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-04 | Provider rate limits cannot silently lose jobs. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-05 | Batch processing resumes from durable page checkpoints. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-06 | Self-host execution remains optional. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-07 | Fallback obeys tenant, security, provider, residency, and quality policy. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-08 | Partial extraction can remain usable for RAG with uncertainty and provenance. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-09 | Original document and extraction provenance remain available under existing retention rules. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-10 | No duplicate queue, registry, index, or execution engine is introduced. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-11 | Active implementation work remains untouched. | Yes | N/A to product implementation | Checked for this change only | None recorded |
| AC-12 | No production configuration changes are required by this Spec update. | Yes | N/A to product implementation | Checked for this change only | None recorded |
| AC-13 | Cost and quality metrics can be measured per accepted document. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-14 | Ordinary OCR has no mandatory human approval step. | Yes | Not assessed here | Not assessed here | None recorded |
| AC-15 | Existing Agents and Mini Apps can reuse the shared document capability. | Yes | Not assessed here | Not assessed here | None recorded |

## 15. Spec-only gap review

The canonical-baseline capability inventory, evidence paths, priorities, risks, and ten-dimension review are recorded in [`reviews/typhoon-first-adaptive-gap-review-2026-10-10.md`](reviews/typhoon-first-adaptive-gap-review-2026-10-10.md). This review is planning evidence only; it does not change implementation status or replace the generated handoff.
