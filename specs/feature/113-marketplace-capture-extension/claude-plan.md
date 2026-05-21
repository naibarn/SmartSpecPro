# Implementation Plan - Marketplace Capture Extension

## Guiding Principles

- Keep changes additive and feature-scoped.
- Use `/marketplace-capture` and `marketplaceCapture`, not the existing skill marketplace namespace.
- Reuse existing auth, storage, LLM, Drizzle, and UI patterns.
- Treat extension-collected data as untrusted until validated and user-confirmed.
- Build Shopee MVP end-to-end before TikTok Shop.

## Section 01 - Database And Contracts

Create the data model and shared contracts first.

Files likely changed:

- `apps/web/drizzle/schema.ts`
- new migration in `apps/web/drizzle/0176_marketplace_capture.sql`
- `apps/web/shared/marketplaceCapture.ts`
- `apps/web/server/services/__tests__/marketplaceCaptureSchema.test.ts`

Tasks:

- Add additive tables for extension pairings/tokens, capture sessions, capture assets, candidate batches/items, marketplace products, product images, price snapshots, and audit/retention metadata.
- Add indexes for user/tenant/status/createdAt, platform/external IDs, capture/product relationships, and token revocation lookup.
- Define shared Zod schemas and constants for platform, page type, asset kind, statuses, parser limits, score payloads, extraction result, and confirm payload.
- Prefer varchar + Zod validation for statuses likely to evolve; use PostgreSQL enum only when stable enough.
- Add explicit state-machine fields for async operations: `status`, `analysisStatus`, `assetUploadStatus`, `lastTransitionAt`, `stateVersion`, and `errorCode`.
- Add product variant/SKU storage shape for marketplace options such as size, color, volume, bundle, selected variant price, and stock text.
- Add consent/minimization metadata: what evidence groups were selected, what was redacted/cropped, and whether raw evidence is eligible for retention cleanup.
- Add field-level provenance and user-edit tracking: original value, normalized value, user-corrected value, source asset/block IDs, confidence, and edit timestamp.
- Add schema versioning for capture payload, LLM output schema, adapter version, and parser heuristic version so old captures remain interpretable after Shopee DOM changes.
- Add migration rollback notes and a dry-run verification query set for indexes, constraints, and tenant/user isolation.

Acceptance:

- Schema compiles.
- Migration is additive and rollback-safe.
- Shared schemas reject malformed platform/page/asset/status payloads.

## Section 02 - Backend Foundation And Route Wiring

Create feature-local backend scaffolding behind a deny-by-default feature flag.

Files likely changed:

- `apps/web/server/routes/marketplaceCapture.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/routers.ts`
- `apps/web/server/_core/index.ts`
- `apps/web/server/services/marketplaceCaptureConfig.ts`
- `apps/web/server/services/marketplaceCaptureErrors.ts`

Tasks:

- Add `MARKETPLACE_CAPTURE_ENABLED` feature flag.
- Register REST route under `/api/marketplace-capture`.
- Register tRPC router as `marketplaceCapture`.
- Add normalized error envelope with `code`, `message`, `retryable`, `requestId`.
- Add request ID propagation if missing.
- Return disabled errors when feature flag is off.
- Add async job boundary for analyze/mirroring/cleanup work. The initial implementation can run inline behind the same service interface, but routes should expose status as if the work can be queued later.
- Add configuration validation for required env vars, extension origins, retention windows, storage limits, LLM model policy, and remote image allowlists.

Acceptance:

- Disabled feature rejects all feature routes safely.
- No collision with existing `/marketplace`.
- Existing web tests still compile.

## Section 03 - Extension Auth, Pairing, CORS, Rate Limits

Implement one-time extension pairing and scoped token validation without broad auth refactors.

Files likely changed:

- `apps/web/server/services/marketplaceExtensionAuthService.ts`
- `apps/web/server/services/marketplaceCaptureCors.ts`
- `apps/web/server/routes/marketplaceCapture.ts`
- `apps/web/server/routes/__tests__/marketplaceCaptureAuth.test.ts`
- `apps/web/client/src/pages/MarketplaceCaptureConnect.tsx`

Tasks:

- Add pairing start/complete/poll endpoints.
- Issue short-lived access tokens and rotating refresh tokens with scopes:
  - `marketplace:capture`
  - `marketplace:read`
  - `marketplace:write`
- Store token metadata and revocation state.
- Validate `jti`, user, tenant, token type, extension id, origin, and scopes.
- Add exact `MARKETPLACE_EXTENSION_ALLOWED_ORIGINS` allowlist.
- Reject wildcard CORS, cookie-authenticated writes, and production writes with missing origin.
- Add per-user and per-token rate limits.
- Define token/local draft hygiene:
  - access token kept in service worker memory when possible
  - refresh token stored only if needed and rotated
  - local capture queue excludes screenshots/raw DOM unless user explicitly keeps a retry draft
  - logout/revoke clears tokens, queue, and pending local evidence
- Define extension CSP and remote-code policy: no remote JavaScript, no dynamic code evaluation, no marketplace DOM HTML injection into panel.
- Hash or otherwise protect refresh tokens at rest. Store only token metadata needed for revoke/audit.
- Bind tokens to extension id, user, tenant, issued environment, and pairing record to reduce replay across environments.
- Add device/session management in SmartSpecPro so users can see and revoke paired extensions.

Acceptance:

- Extension token cannot call unrelated APIs.
- Disallowed origin and missing origin are rejected in production.
- Revoked/expired token is rejected.

## Section 04 - Capture Drafts, Assets, And Candidate Batches

Build REST endpoints used by the extension.

Files likely changed:

- `apps/web/server/routes/marketplaceCapture.ts`
- `apps/web/server/services/marketplaceCaptureService.ts`
- `apps/web/server/services/marketplaceAssetService.ts`
- `apps/web/server/services/marketplaceUrlSafety.ts`
- `apps/web/server/routes/__tests__/marketplaceCaptureRoutes.test.ts`

Tasks:

- Implement `POST /api/marketplace-capture/captures`.
- Implement multipart `POST /api/marketplace-capture/captures/:captureId/assets`.
- Implement `POST /api/marketplace-capture/category-candidates`.
- Support idempotency keys for draft create and asset upload.
- Validate payload size limits, max DOM chars, max HTML block chars, max selected images/screenshots.
- Validate source URLs against supported marketplace page policy.
- Validate upload file count, max size, extension/type/magic bytes, dimensions, and active-content denial.
- Store selected assets with `storagePut` and capture asset rows.
- Add status endpoint or tRPC polling contract for long-running upload/analyze flows so the extension and web preview can recover after service worker suspension.
- Persist idempotency at endpoint/action granularity: create draft, upload asset, analyze, confirm, candidate batch upload.
- Validate evidence minimization metadata from the extension and reject payloads that exceed configured selected-evidence limits.
- Add upload checksums and orphan cleanup for partial uploads or failed DB writes.
- Add optional malware/content scanning hook for uploaded evidence, even if MVP only logs `not_configured`.
- Add pagination and retention-safe retrieval contracts for candidate batches and captures.

Acceptance:

- Draft create persists user/tenant-scoped capture.
- Asset upload stores only selected evidence.
- Candidate batch persists and links preview URL.
- Bad file types, oversized files, cross-user capture IDs, and invalid origins fail.

## Section 05 - LLM Extraction And Validation

Add server-side extraction pipeline using existing LLM infrastructure.

Files likely changed:

- `apps/web/server/services/marketplaceExtractionService.ts`
- `apps/web/server/services/marketplacePromptService.ts`
- `apps/web/server/services/marketplaceValidationService.ts`
- `apps/web/server/services/__tests__/marketplaceExtractionService.test.ts`
- `apps/web/server/routes/marketplaceCapture.ts`

Tasks:

- Implement `POST /api/marketplace-capture/captures/:captureId/analyze`.
- Build prompt with strict separation of system instructions and untrusted evidence.
- Send condensed DOM/HTML plus selected evidence URLs.
- Validate JSON schema, repair once if invalid, and store `llmResultJson`, `normalizedResultJson`, confidence, evidence, warnings.
- Cross-check DOM parser fields against LLM output.
- Ensure analyze can update capture draft only, never product records.
- Include variants/SKU extraction in schema as optional structured data.
- Add extraction run ledger fields: provider/model, prompt version, schema version, input evidence asset IDs, token/cost metadata where existing LLM accounting exposes it, and repair attempt count.
- Add deterministic fallback extraction path for core fields when LLM is disabled or rate-limited.
- Enforce per-user/tenant LLM budget and quota policy before analyze starts.
- Add model policy config that separates text-only extraction, vision extraction, and repair model choices.
- Add PII/minimization prefilter before sending DOM text to the LLM.

Acceptance:

- Valid extraction result stored.
- Invalid JSON gets one repair attempt.
- Prompt injection fixtures cannot make the service mutate data or leak secrets.

## Section 06 - Confirm Save, Retention, And Audit

Persist final products only after user confirmation and manage evidence lifecycle.

Files likely changed:

- `apps/web/server/services/marketplaceProductService.ts`
- `apps/web/server/services/marketplaceCaptureRetentionService.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/services/__tests__/marketplaceProductService.test.ts`

Tasks:

- Implement confirm mutation/endpoint from web preview.
- Create product, product images, and price snapshot in a transaction.
- Dedupe by user/tenant/platform/external product id/source URL.
- Mark capture `confirmed`.
- Add stale draft cleanup for raw evidence/assets.
- Add audit events for create/upload/analyze/confirm/delete with safe metadata.
- Add product/evidence deletion and export behavior:
  - delete product can optionally retain audit metadata while deleting raw evidence
  - user can delete a capture draft before confirm
  - confirmed product can show which evidence was retained or purged
- Add update/rescan behavior for an already confirmed product: create a new capture and price snapshot rather than mutating historical evidence in place.
- Add product export contract for confirmed product JSON and evidence manifest.
- Add field provenance display/read API so future audits can answer whether a value came from DOM, LLM, or user edit.

Acceptance:

- Confirm is idempotent.
- Cross-tenant confirm is impossible.
- Stale unconfirmed raw evidence can be deleted.

## Section 07 - Web Preview And Product UI

Create authenticated web UI for preview/edit/confirm and saved products.

Files likely changed:

- `apps/web/client/src/App.tsx`
- `apps/web/client/src/pages/MarketplaceCapturePreview.tsx`
- `apps/web/client/src/pages/MarketplaceCaptureProducts.tsx`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/client/src/components/marketplaceCapture/*`

Tasks:

- Add protected routes under `/marketplace-capture`.
- Build evidence viewer with tabs for screenshots, DOM text, raw JSON, and image candidates.
- Build extracted product form with confidence/evidence warnings.
- Build image picker for main/description/excluded/cover/reorder.
- Add re-run LLM, save draft, confirm save actions.
- Render all raw evidence safely as text or sandboxed preview.
- Add variant/SKU editor when variants are detected.
- Add evidence retention/deletion indicators so users know whether raw screenshots/DOM will be retained.
- Add async status/progress polling for analyze and upload recovery.
- Add list pagination/search/filter for captures and saved products from the first implementation to avoid unbounded queries.
- Cover loading, empty, error, retry, disabled, low-confidence, partial-upload, and stale-capture states.
- Add accessibility requirements for image picker, icon buttons, keyboard reordering, focus management, and screen-reader labels.

Acceptance:

- Preview loads for capture owner only.
- User can edit extracted fields and selected images before confirm.
- Product list/detail shows saved records and images.

## Section 08 - Extension Workspace And Shared Runtime

Create the MV3 extension foundation.

Files likely changed:

- `apps/extension/package.json`
- `apps/extension/tsconfig.json`
- `apps/extension/vite.config.ts`
- `apps/extension/src/manifest.ts`
- `apps/extension/src/shared/*`
- `apps/extension/src/background/*`
- `apps/extension/src/content/*`
- `apps/extension/src/panel/*`

Tasks:

- Configure Vite build for MV3.
- Define manifest with narrow permissions and explicit host permissions.
- Implement service worker token store, API client, screenshot capture, and preview opener.
- Implement content script adapter registry and message validation.
- Implement side panel shell with connection and page-state detection.
- Add strict message validation between page/content script/service worker/panel. Never trust `window.postMessage` payloads without source/type/schema checks.
- Add service worker recovery for suspended background runtime: persisted lightweight operation state, resumable uploads, and clear retry UX.
- Add extension CSP tests and manifest checks for no remote code/eval.
- Add extension release packaging checks that scan compiled output for remote hosted code patterns, broad host permissions, source-map leakage, and unexpected secrets.
- Define dev, staging, and production base URL modes with explicit environment labels in the panel to avoid uploading production captures to localhost or vice versa.
- Prefer optional host permissions where practical, while keeping MVP host permissions explicit and understandable.

Acceptance:

- Dev extension builds.
- Side panel opens by user gesture.
- Content script and service worker communicate with typed messages.

## Section 09 - Shopee Category Scanner And Scoring

Implement Shopee listing/category/search scanner.

Files likely changed:

- `apps/extension/src/content/adapters/shopee.ts`
- `apps/extension/src/content/capture/categoryScanner.ts`
- `apps/extension/src/content/utils/number.ts`
- `apps/extension/src/panel/components/CategoryScanPanel.tsx`
- `apps/extension/src/content/__tests__/*`

Tasks:

- Detect Shopee listing pages by hostname, URL/cards, and sort/filter heuristics.
- Extract visible cards: title, URL, IDs, price, sold count, discount, image, badges, position, bounding box.
- Parse Thai/English price, sold count, discount.
- Score candidates and produce reasons.
- Add visible scan, explicit scroll-scan, sorting, filtering, open, queue, ignore, and candidate batch upload.
- Track adapter/heuristic version and scan diagnostics so DOM breakage can be debugged from user reports without storing full page dumps.
- Add queue cancellation, duplicate suppression, and backoff for repeated scan/open actions.

Acceptance:

- Static Shopee-like fixtures capture at least 80% visible cards.
- Score reasons are stable and understandable.

## Section 10 - Shopee Product Scanner And Local Review Panel

Implement product capture with pre-upload editing and selection.

Files likely changed:

- `apps/extension/src/content/adapters/shopee.ts`
- `apps/extension/src/content/capture/productPageScanner.ts`
- `apps/extension/src/content/capture/collectImages.ts`
- `apps/extension/src/content/capture/scrollCapture.ts`
- `apps/extension/src/panel/components/ProductScanPanel.tsx`
- `apps/extension/src/panel/components/PreUploadReviewPanel.tsx`
- `apps/extension/src/panel/components/ProductImagePicker.tsx`

Tasks:

- Detect product pages and extract external IDs.
- Collect product header, gallery, shipping/promotion, description, rating summary, and raw DOM text.
- Click thumbnails with throttle and dedupe main images.
- Capture selected screenshots through service worker.
- Build local review state:
  - editable core fields
  - image selection/grouping/reorder/cover
  - screenshot selection
  - upload byte estimate
  - warnings for checkout/account pages and suspicious sections
- Upload only selected/edited data.
- Crop screenshots to intended evidence regions where feasible before upload, and mark uncropped full viewport screenshots with stronger user confirmation.
- Redact obvious account/header/user-personal regions from screenshots and DOM text where heuristics can do so safely.
- Capture variants/SKUs when visible and let user choose which variant context the price belongs to.
- Ensure the review panel can remove raw DOM/HTML blocks from upload when the user wants image-only or minimal evidence capture.
- Add capture diagnostics for missing sections, blocked lazy-loaded images, variant capture failures, and thumbnail click failures.
- Add explicit cancellation path that stops scrolling/capture/upload and cleans local temporary evidence.

Acceptance:

- User can discard unwanted images/screenshots before upload.
- Product capture uploads no unselected evidence.
- Product page fixtures capture expected fields/images.

## Section 11 - Security, QA, Docs, And Release Gates

Complete release readiness.

Files likely changed:

- `apps/web/server/routes/__tests__/marketplaceCaptureSecurity.test.ts`
- `apps/web/client/src/pages/__tests__/MarketplaceCapturePreview.test.tsx`
- `apps/extension/fixtures/*`
- `apps/extension/README.md`
- `specs/feature/113-marketplace-capture-extension/release-checklist.md`

Tasks:

- Add security tests for auth, CORS, CSRF bypass attempts, upload validation, SSRF, preview XSS, prompt injection, tenant isolation, rate limits, idempotency, retention.
- Add extension integration tests with Shopee-like fixtures.
- Add manual QA checklist for supported and blocked page types.
- Add dev install guide and privacy/data handling notes.
- Add rollback switch and ops dashboard/log event list.
- Add data-subject/privacy tests for evidence deletion, retention expiry, and token/local queue clearing.
- Add extension policy checklist for Chrome Web Store single-purpose disclosure, permissions justification, user data disclosure, and remote-code prohibition.
- Add threat-model document covering malicious marketplace DOM, malicious image URLs, compromised extension token, cross-tenant capture IDs, LLM prompt injection, preview XSS, and service worker replay/retry behavior.
- Add operations readiness:
  - metrics and alerts for capture volume, upload failures, analyze failures, storage growth, LLM spend, rate-limit events, rejected origins, and security validation failures
  - dashboards or log queries for incident triage
  - runbook for disabling capture with `MARKETPLACE_CAPTURE_ENABLED=false`
  - cleanup runbook for orphan assets and stale captures
- Add legal/product review checklist for marketplace terms, user responsibility copy, copyright/IP handling for saved images, privacy policy updates, and data deletion/export expectations.
- Add Playwright/Chrome extension E2E plan that loads the built extension, exercises side panel flows against fixtures, and verifies local pre-upload review blocks unwanted evidence.

Acceptance:

- `npm --prefix apps/web run check` passes.
- Focused Vitest suites pass.
- Extension build/tests pass.
- Production release gates are documented and satisfied or explicitly marked blocked.
