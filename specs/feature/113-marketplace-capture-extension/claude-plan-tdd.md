# TDD Plan - Marketplace Capture Extension

## Test Strategy

Write tests alongside each section before implementation where possible. Use unit tests for parsers/contracts/state machines, route tests for REST security and persistence, component tests for preview behavior, and fixture-driven extension tests for Shopee scanners.

## Section 01 - Database And Contracts

Tests:

- Schema exports all marketplace capture tables.
- Shared Zod schemas accept valid capture/category/product payloads.
- Shared schemas reject unsupported platforms, page types, asset kinds, and oversized text fields.
- Index definitions or migration SQL include user/tenant/status and platform/external id lookup paths.
- State-machine schemas reject illegal status transitions and stale `stateVersion` updates.
- Variant/SKU schemas accept valid option/price records and reject malformed option arrays.
- Retention/minimization metadata records selected, redacted, cropped, and purge-eligible evidence.
- Field provenance schemas preserve source asset/block IDs, confidence, user edit metadata, and schema/parser/adapter versions.
- Migration verification checks indexes, constraints, and tenant/user isolation queries.

Commands:

- `npm --prefix apps/web run check`
- `npm --prefix apps/web test -- server/services/__tests__/marketplaceCaptureSchema.test.ts`

## Section 02 - Backend Foundation And Route Wiring

Tests:

- Feature-disabled REST routes return deterministic disabled error.
- Feature-disabled tRPC router procedures return deterministic disabled error.
- `appRouter` exposes `marketplaceCapture` without changing existing `marketplace`.
- REST route returns request ID in error response.
- Config validation fails closed when required env vars, extension origins, storage limits, retention windows, or LLM policy are missing in production.
- Analyze route can return an async status contract even if the first service implementation runs inline.

Commands:

- `npm --prefix apps/web test -- server/routes/__tests__/marketplaceCaptureRoutes.test.ts`
- `npm --prefix apps/web test -- server/routers/__tests__/marketplaceCapture.test.ts`

## Section 03 - Extension Auth, Pairing, CORS, Rate Limits

Tests:

- Pairing code can be created and exchanged once.
- Pairing code expires.
- Token includes required marketplace scopes and `jti`.
- Revoked token is rejected.
- Disallowed origin is rejected.
- Production missing-origin extension write is rejected.
- Cookie-authenticated extension write is rejected.
- Rate limit returns normalized retryable error and headers.
- Logout/revoke clears extension token store and pending local queue.
- Manifest/CSP tests reject remote script origins, eval-like settings, and unnecessary host permissions.
- Refresh tokens are stored hashed/protected and can be revoked without storing raw token material.
- Tokens are bound to extension id, environment, user, tenant, and pairing record.
- Paired extension management list can revoke a specific extension.

Commands:

- `npm --prefix apps/web test -- server/routes/__tests__/marketplaceCaptureAuth.test.ts`

## Section 04 - Capture Drafts, Assets, And Candidate Batches

Tests:

- Create draft persists user/tenant-scoped capture with idempotency.
- Duplicate idempotency key returns original capture.
- Cross-user asset upload to capture is rejected.
- Multipart upload accepts valid PNG/JPEG/WebP screenshot or image.
- Upload rejects wrong MIME, wrong magic bytes, active content, zero-byte file, oversized file, and too many files.
- Candidate batch upload persists only allowed fields and validates candidate limits.
- Status endpoint returns upload/analyze state for owner and rejects non-owner.
- Idempotency keys are scoped per user, endpoint, and action.
- Oversized selected-evidence summaries are rejected before storage writes.
- Failed DB insert after storage write triggers orphan cleanup or records cleanup debt.
- Upload checksum dedupes exact duplicate selected assets.
- Candidate/capture list endpoints paginate and enforce owner/tenant filters.

Commands:

- `npm --prefix apps/web test -- server/routes/__tests__/marketplaceCaptureRoutes.test.ts`
- `npm --prefix apps/web test -- server/services/__tests__/marketplaceAssetService.test.ts`

## Section 05 - LLM Extraction And Validation

Tests:

- Prompt builder marks DOM/HTML/OCR as untrusted data.
- Valid LLM JSON is normalized and stored.
- Invalid JSON triggers one repair attempt.
- Invalid after repair sets capture failed with retryable warning.
- DOM/LLM price mismatch produces warning.
- Prompt injection fixture cannot change requested schema or trigger tool/action.
- LLM-disabled fallback still extracts core DOM fields and marks extraction mode.
- Extraction ledger stores prompt/schema version and repair count without logging raw secrets.
- Variant extraction populates optional SKU fields when evidence exists.
- Analyze refuses when user/tenant quota or budget policy is exceeded.
- Model policy selects text, vision, and repair models from config.
- PII/minimization prefilter removes obvious account/contact noise before LLM input.

Commands:

- `npm --prefix apps/web test -- server/services/__tests__/marketplaceExtractionService.test.ts`

## Section 06 - Confirm Save, Retention, And Audit

Tests:

- Confirm creates product, product images, and price snapshot transactionally.
- Confirm is idempotent for the same capture.
- Confirm rejects cross-tenant/user access.
- Confirm rejects un-analyzed or failed capture unless policy allows manual confirm.
- Retention service deletes stale unconfirmed assets and marks rows.
- Audit events contain safe metadata and no raw bearer tokens or full DOM.
- Delete draft removes or tombstones raw evidence assets.
- Confirmed product rescan creates a new capture/price snapshot rather than overwriting historical capture evidence.
- Retention expiry can purge raw screenshots/DOM while product rows remain readable.
- Product export returns confirmed product JSON plus evidence manifest.
- Field provenance read API identifies DOM, LLM, and user-edited values.

Commands:

- `npm --prefix apps/web test -- server/services/__tests__/marketplaceProductService.test.ts`
- `npm --prefix apps/web test -- server/services/__tests__/marketplaceCaptureRetentionService.test.ts`

## Section 07 - Web Preview And Product UI

Tests:

- Preview page loads capture via tRPC for owner.
- Raw DOM/HTML/LLM content renders as text, not executable HTML.
- Low-confidence fields show warnings.
- Image picker can move/reorder/remove/set cover.
- Confirm submits user-edited product payload.
- Variant/SKU editor preserves option labels and selected price context.
- Preview displays retention/purge status for raw evidence.
- Upload/analyze progress recovers from refreshed page polling.
- Product/capture lists paginate, search, and filter without unbounded queries.
- UI covers loading, empty, error, retry, disabled, stale-capture, and partial-upload states.
- Image picker and edit form pass keyboard/focus/accessible-name checks.

Commands:

- `npm --prefix apps/web test -- client/src/pages/__tests__/MarketplaceCapturePreview.test.tsx`

## Section 08 - Extension Workspace And Shared Runtime

Tests:

- Extension manifest contains MV3, sidePanel, narrow permissions, and explicit host permissions.
- Message schemas validate content script/service worker/panel messages.
- API client attaches bearer token and handles normalized errors.
- Token store clears tokens on revoke/logout.
- Service worker recovery resumes or safely cancels an interrupted upload.
- Message validators reject forged page-origin messages and unknown message types.
- Extension CSP/manifest snapshot rejects remote code and broad host permissions.
- Built extension bundle scan fails on remote hosted code patterns, unexpected secrets, or broad permissions.
- Dev/staging/prod base URL modes are explicit and cannot silently mix environments.

Commands:

- `npm --prefix apps/extension run check`
- `npm --prefix apps/extension test`

## Section 09 - Shopee Category Scanner And Scoring

Tests:

- Shopee listing page detection positive/negative fixtures.
- Product card extraction from static fixture captures title, URL, price, sold, discount, image, badges.
- Thai/English sold parser handles `100+`, `1k+`, `พัน`, `หมื่น`, `ล้าน`.
- Candidate scoring returns bounded score and reasons.
- Filters remove candidates below min sold/price/discount/keyword rules.
- Adapter diagnostics record heuristic version, skipped card counts, and parse failure reasons without full page dumps.
- Queue cancellation and duplicate suppression work across repeated scans.

Commands:

- `npm --prefix apps/extension test -- shopeeCategoryScanner`

## Section 10 - Shopee Product Scanner And Local Review Panel

Tests:

- Shopee product page detection positive/negative fixtures.
- Product scanner captures header fields, description text, and image candidates.
- Thumbnail collector dedupes and avoids related/sidebar images by bounding box heuristics.
- Pre-upload review edits fields without mutating raw evidence.
- Upload payload includes selected images/screenshots only.
- Blocked pages like checkout/cart/account/chat are rejected.
- Screenshot crop/redaction metadata is included for selected screenshots.
- Full viewport screenshots require explicit warning/confirmation state.
- User can remove DOM/HTML blocks from upload payload.
- Variant fixture captures visible option labels and selected variant price context.
- Capture cancellation stops scroll/thumbnail work and clears local temporary evidence.
- Diagnostics are produced for missing description, lazy-load failure, and thumbnail click failure.

Commands:

- `npm --prefix apps/extension test -- shopeeProductScanner`
- `npm --prefix apps/extension test -- PreUploadReviewPanel`

## Section 11 - Security, QA, Docs, And Release Gates

Tests:

- CORS and auth negative matrix.
- SSRF matrix for private IP, localhost, metadata IP, non-HTTPS, redirect-to-private.
- Preview XSS payloads render inert.
- Upload active-content denial matrix.
- Rate limit and storage limit matrix.
- Manual QA checklist completed for Shopee category/search/product and blocked pages.
- Data retention/deletion tests cover stale captures, user deletion, and token/local queue clearing.
- Chrome Web Store checklist covers single purpose, permissions justification, user data disclosure, and no remote code.
- Threat model review has no unresolved critical risks.
- Operations tests or smoke checks cover metrics/log events for capture, upload, analyze, storage growth, LLM spend, rate-limit, origin rejection, and validation failure.
- Legal/product checklist covers marketplace terms copy, copyright/IP handling, privacy policy, export, and deletion expectations.
- Playwright extension E2E loads the built extension and verifies pre-upload review prevents unwanted evidence upload.

Commands:

- `npm --prefix apps/web run check`
- `npm --prefix apps/web test -- marketplaceCapture`
- `npm --prefix apps/extension run check`
- `npm --prefix apps/extension test`
