# Claude Spec - Marketplace Capture Extension

## Goal

Add a SmartSpecPro Chrome MV3 extension and web/API backend that lets a logged-in SmartSpecPro user capture product data from marketplace pages they open themselves, starting with Shopee Thailand.

The extension scans visible category/search product cards, recommends candidates, lets the user open a product, captures product evidence, lets the user review/edit/select locally before upload, creates a SmartSpecPro capture draft, runs server-side LLM extraction, and saves a final product only after web preview confirmation.

## In Scope

- New `apps/extension` workspace for Chrome MV3 extension.
- Shopee category/search scanner with candidate scoring and filters.
- Shopee product page scanner with DOM text, HTML blocks, screenshots, image candidates, and local review/edit/select panel.
- Backend REST routes under `/api/marketplace-capture` for extension pairing, draft creation, asset upload, analysis trigger, and candidate batch upload.
- Backend tRPC router `marketplaceCapture` for authenticated web preview/list/detail workflows.
- Drizzle schema and migration for extension tokens/pairing, captures, assets, candidate batches, products, images, price snapshots, audit/retention metadata.
- LLM extraction service using existing server-side LLM infrastructure.
- Web pages under `/marketplace-capture`.
- Security controls: scoped tokens, origin allowlist, upload validation, SSRF-safe remote image handling, prompt-injection hardening, tenant isolation, retention/deletion, observability, rate limits.
- Test plan covering parsers/scoring, backend auth/upload/analysis/confirm, preview XSS, SSRF, and extension scanner fixtures.

## Out Of Scope For MVP

- TikTok Shop implementation beyond adapter-ready contracts.
- CAPTCHA bypass, hidden crawling, marketplace cookie/session storage, login automation, checkout/cart/account page capture.
- Fully automatic batch capture without per-product review.
- Permanent extension API key.
- Direct LLM provider calls from extension.

## Required User Flow

1. User installs dev extension.
2. User pairs extension with SmartSpecPro through one-time code/link.
3. User opens Shopee category/search page and opens side panel.
4. User scans visible products or explicitly scroll-scans more.
5. Extension shows recommended candidates with reasons and filters.
6. User opens one product.
7. Extension detects product page and scans selected sections.
8. Extension shows local pre-upload review:
   - fields editable
   - image candidates grouped and selectable
   - screenshots selectable
   - estimated upload bytes and excluded summary visible
9. User clicks upload/analyze.
10. Backend creates capture draft, stores selected assets, runs extraction, opens web preview.
11. User reviews/edits final web preview and confirms.
12. Backend creates product, images, and price snapshot, and marks capture confirmed.

## Core Architecture

- Content script reads page DOM and marketplace-specific adapters.
- Service worker handles screenshot capture, API calls, token storage, retries, and opening preview.
- Side panel is the user control plane and local review surface.
- REST API receives extension traffic because multipart uploads are easier and safer there.
- tRPC API powers authenticated SmartSpecPro web UI.
- Storage layer stores selected uploaded evidence.
- LLM service consumes condensed evidence and returns validated JSON.
- Drizzle persists drafts, assets, candidate batches, confirmed products, price snapshots, token metadata, retention status, and audit metadata.

## Security Requirements

- Extension routes require scoped bearer tokens except pairing start/poll.
- Tokens are short-lived, revocable by `jti`, tenant/user scoped, and cannot access unrelated APIs.
- Extension POST requests require exact allowed `Origin` values in production.
- CORS never uses `*` for authenticated extension routes.
- Cookie-authenticated extension writes are rejected.
- Uploads use multipart, not base64 JSON.
- Uploads validate file count, size, extension/type allowlist, magic bytes, decoded dimensions, and active-content denial.
- Remote image mirroring is disabled or allowlisted with SSRF controls.
- LLM prompts separate instructions from untrusted marketplace data and validate/repair output once.
- Preview renders raw data safely as text or sandboxed evidence.
- Confirm is idempotent and cannot be triggered by analyze.
- Retention deletes stale raw evidence and assets.
- Audit logs capture safe metadata, not bearer tokens or full sensitive payloads.

## Acceptance Summary

- Extension scans Shopee category/search fixture and captures at least 80% of visible cards.
- Extension product capture gets name, price/sold text where visible, description, selected screenshots, and selected images.
- Local pre-upload review prevents unwanted images/screenshots from being uploaded.
- Backend persists capture drafts and assets through existing storage.
- LLM extraction returns schema-valid JSON and warnings/confidence.
- Web preview supports edit/re-run/save/confirm.
- Confirm creates product, image rows, and price snapshot.
- Security and regression tests pass before production release.

