- Activated Orchestra for a bug report affecting storyboard-review upload replacement persistence.
- Brainstorming prelude used in bounded form; design: make uploaded replacement canonical and prevent stale async saves from overwriting it.

[COMPLETE] marketplace-capture-plan-completeness-review - Reviewed Marketplace Capture Extension deep-plan and patched planning gaps in markdown artifacts.

Verification:
- SocratiCode status: green.
- Deep Plan section checker: complete, `11/11`, manifest valid.

[COMPLETE] marketplace-capture-plan-completeness-review-round-2 - Added operational readiness, field provenance, async boundary, extension packaging, quota/cost, accessibility, diagnostics, and legal/product release gates.

Verification:
- SocratiCode status: green.
- Official Chrome/OWASP references checked for remote hosted code, upload validation, SSRF, and LLM prompt-injection guidance.

[COMPLETE] marketplace-capture-deep-implement-mvp - Implemented Marketplace Capture MVP across shared contracts, DB schema/migration, backend REST/tRPC services, web preview/product pages, and Chrome extension side panel with pre-upload review/edit/image selection.

Verification:
- `npm --prefix apps/extension run build`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web run check`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web test -- shared/marketplaceCapture.test.ts`

[COMPLETE] marketplace-capture-migration-hardening - Completed the Marketplace Capture migration contract with Postgres enum types, tenant/user FKs, check constraints, partial unique dedupe indexes, and migration contract tests.

Verification:
- SocratiCode status: green.
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web run check`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web test -- drizzle/__tests__/marketplaceCaptureMigration.test.ts shared/marketplaceCapture.test.ts`

[COMPLETE] marketplace-capture-env-configuration - Added Marketplace Capture env values to web runtime env files, env examples, and Docker Compose web service passthrough.

Verification:
- SocratiCode status: green.
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web run check`
- `docker compose -f docker-compose.dev.yml config --quiet`
- `SESSION_SECRET=dev_session_secret_32_chars_minimum_123456 docker compose -f docker-compose.full.yml config --quiet`
- `docker compose -f docker-compose.nginx.yml config --quiet`

[COMPLETE] marketplace-capture-ui-extension-completeness-wave - Filled major gaps from spec: SmartSpecPro preview form, evidence viewer, image picker, saved product images, extension filters/sort/scroll scan/queue/ignore/evidence selection/edit fields, optional LLM gateway hook, TikTok Shop basic adapter, and extension README.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/extension run build`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web run check`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web test -- drizzle/__tests__/marketplaceCaptureMigration.test.ts shared/marketplaceCapture.test.ts`

[COMPLETE] marketplace-capture-finish-pass - Closed the latest completion pass by hardening adapter selection, category source URL handling, DOM-only review uploads, and LLM JSON parsing/normalization.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/extension run build`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web run check`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web test -- drizzle/__tests__/marketplaceCaptureMigration.test.ts shared/marketplaceCapture.test.ts`
- `docker compose -f docker-compose.dev.yml config --quiet`
- `SESSION_SECRET=dev_session_secret_32_chars_minimum_123456 docker compose -f docker-compose.full.yml config --quiet`
- `docker compose -f docker-compose.nginx.yml config --quiet`

[COMPLETE] marketplace-capture-full-spec-gap-pass - Filled the requested remaining SmartSpecPro UI and Chrome Extension gaps: candidate batch preview/read APIs, product/capture list filters, save draft/discard actions, image preview/reorder, field provenance display, extension connect shortcut, progress steps, privacy summary, queue cleanup, Shopee scanner thumbnail/description hardening, sponsored/free-shipping/rating/original-price signals, and forbidden marketplace page guards.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/extension run build`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web run check`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web test -- drizzle/__tests__/marketplaceCaptureMigration.test.ts shared/marketplaceCapture.test.ts`
- `docker compose -f docker-compose.dev.yml config --quiet`
- `SESSION_SECRET=dev_session_secret_32_chars_minimum_123456 docker compose -f docker-compose.full.yml config --quiet`
- `docker compose -f docker-compose.nginx.yml config --quiet`

[COMPLETE] marketplace-capture-shopee-url-dedupe-pass - Replaced the basic Shopee id parser with canonical SEO/product URL parsing, persisted original/clean/canonical URL metadata, normalized Shopee product source URLs to `/product/{shopId}/{itemId}`, and added shopId+itemId dedupe indexes/checks for captures/products.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/extension run build`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web run check`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web test -- drizzle/__tests__/marketplaceCaptureMigration.test.ts shared/marketplaceCapture.test.ts`

[COMPLETE] marketplace-capture-platform-menu-scraper-gap-pass - Added dashboard sidebar navigation for Marketplace Capture, platform/dedupe badges, CSV/JSON export controls, and best-effort Shopee/TikTok product fields for category, stock, variants, and seller location after comparing to the older SeleniumBase scraper reference.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/extension run build`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web run check`
- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --prefix apps/web test -- shared/marketplaceCapture.test.ts drizzle/__tests__/marketplaceCaptureMigration.test.ts`

[IN_PROGRESS] marketplace-capture-review-image-merge-hardening - Improve Shopee/TikTok review image classification and add manual merge button for current visible images.

[COMPLETE] marketplace-capture-review-image-merge-hardening - Hardened TikTok/Shopee visible image classification, added a content-script image merge scan for product pages, added panel buttons to merge visible images without replacing edited product fields, and published extension 0.1.9 release zips for dashboard download.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/extension run build`
- `npm --prefix apps/web run check`
- Verified both 0.1.9 release zips contain manifest version 0.1.9 and the new merge message.

[IN_PROGRESS] marketplace-capture-responsive-image-grid - Improve extension image picker into responsive multi-column grid with larger thumbnails.

[COMPLETE] marketplace-capture-responsive-image-grid - Changed the extension image picker from single-row 52px thumbnails to a responsive multi-column grid with larger contain-fit previews, selected-state highlighting, lazy image loading, and extension version 0.1.10 release zips for dashboard download.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/extension run build`
- `npm --prefix apps/web run check`
- Verified both 0.1.10 release zips contain manifest version 0.1.10, responsive image grid CSS, and build label 2026-05-18 21:53 +07.

[IN_PROGRESS] marketplace-capture-variant-label-hardening - Fix variant parser so option names such as รสพีช are not treated as separate variant labels.

[COMPLETE] marketplace-capture-variant-label-hardening - Tightened Shopee/TikTok variant label parsing so prefixed options such as รสพีช/รสองุ่น are grouped under one รส variant instead of split into duplicate labels, and published extension 0.1.11 release zips.

Verification:
- SocratiCode status: green.
- Quick regex check: `รสพีช` is not a label and is a prefixed option.
- `npm --prefix apps/extension run build`
- `npm --prefix apps/web run check`
- Verified both 0.1.11 release zips contain manifest version 0.1.11, the prefix fallback parser, and build label 2026-05-18 22:04 +07.

[IN_PROGRESS] marketplace-capture-tiktok-variant-review-merge-pass - Fix TikTok variant grouping, review pagination image updates, and make image merge controls easier to reach near image picker.

[COMPLETE] marketplace-capture-tiktok-variant-review-merge-pass - Fixed TikTok variant group formatting/dedupe so color/capacity options do not repeat as separate labels, made product snapshots include image URLs so review pagination with the same image count still merges new images, added click-triggered settled snapshots for review page navigation, made the image picker merge toolbar sticky near the image grid, and published extension 0.1.12 release zips.

Verification:
- SocratiCode status: green.
- Quick regex check: `สีสัน`/`สีขาว` are options, not labels; `สี`/`ความจุ` are labels.
- `npm --prefix apps/extension run build`
- `npm --prefix apps/web run check`
- Verified both 0.1.12 release zips contain manifest version 0.1.12, image URL snapshot key, click observer, sticky image toolbar CSS, and build label 2026-05-18 22:11 +07.

[IN_PROGRESS] marketplace-capture-upload-confirm-origin-fix - Add pre-upload confirmation in extension and fix invalid origin rejection for extension uploads.

[COMPLETE] marketplace-capture-upload-confirm-origin-fix - Added extension upload confirmation showing product name, source URL, and selected image count; allowed Chrome extension marketplace-capture origins through global CORS/CSRF only for `/api/marketplace-captures/*` bearer-token requests with marketplace auth still enforcing token/device/origin binding; published extension 0.1.13 zips and restarted smartspec-web.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/extension run build`
- `npm --prefix apps/web run check`
- Verified both 0.1.13 release zips contain manifest version 0.1.13, confirmation text, and build label 2026-05-19 06:34 +07.
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- Local sandbox curl to localhost:3000 could not connect despite systemd health passing, likely namespace/network isolation in the tool environment.

[IN_PROGRESS] marketplace-capture-analyze-next-url-fix - Fix capture draft next.analyze URL returned to extension so upload flow reaches analyze route.

[COMPLETE] marketplace-capture-analyze-next-url-fix - Fixed marketplace capture draft `next.uploadAssets` and `next.analyze` URLs to include `/captures/`, added backwards-compatible alias routes for previously emitted `/api/marketplace-captures/:captureId/assets|analyze` paths, ran web type check, and restarted smartspec-web.

Verification:
- SocratiCode status: green.
- `npm --prefix apps/web run check`
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.

[COMPLETE] marketplace-capture-r2-rehost-vector-index - Rehosted selected marketplace image candidates through backend storage/R2 with product-name-based filenames and safe metadata, added SSRF-aware remote image fetch validation, made capture analysis use stored asset IDs instead of original URLs, indexed mirrored images as `marketplace_image`, added marketplace/library/all image search scope filters, and changed confirm save to skip missing capture assets instead of falling back to original marketplace URLs.

Verification:
- SocratiCode search used to narrow capture/storage/vector files.
- `npm --prefix apps/web run check`
- Re-ran `npm --prefix apps/web run check` after Unicode-safe product filename adjustment.
- `npm --prefix apps/web test -- server/__tests__/vectorize-indexing.test.ts server/__tests__/vectorize-search.test.ts`
- `npm --prefix apps/web test -- shared/marketplaceCapture.test.ts`
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- `curl -sS --max-time 5 http://localhost:3000/healthz` returned `{"status":"ok"}`.

[COMPLETE] media-studio-marketplace-vector-pagination - Updated Media Studio marketplace images to default to the latest 30 uploaded marketplace product images, load additional pages with an IntersectionObserver when the user scrolls to the bottom, and use marketplace-only vector search when a search query is provided while preserving DB access checks and platform filters.

Verification:
- SocratiCode search used to locate Media Studio marketplace image flow.
- `npm --prefix apps/web run check`
- `npm --prefix apps/web test -- server/__tests__/vectorize-search.test.ts`
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- `curl -sS --max-time 5 http://localhost:3000/healthz` returned `{"status":"ok"}`.

[COMPLETE] marketplace-capture-duplicate-upload-fix - Fixed Chrome extension upload failure when capturing the same marketplace product again. Capture draft creation now reuses an existing user/platform/product capture instead of inserting a duplicate row that violates marketplace capture unique indexes, refreshes the draft payload, clears old unconfirmed capture assets before remirroring selected images, and preserves confirmed capture assets.

Verification:
- SocratiCode status/search/impact used to narrow the duplicate insert path.
- `npm --prefix apps/web run check`
- `npm --prefix apps/web test -- shared/marketplaceCapture.test.ts`
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- `curl -sS --max-time 5 http://localhost:3000/healthz` returned `{"status":"ok"}`.
- `curl -sS --max-time 5 http://localhost:3000/api/marketplace-captures/health` returned `{"ok":true,"enabled":true}`.

[COMPLETE] marketplace-capture-preview-background-tab - Updated extension upload/analyze completion to open the SmartAIHub capture preview in a new background tab so the marketplace product tab remains visible for comparison, bumped extension to 0.1.14 with build label 2026-05-19 08:18 +07, rebuilt the extension, and published the 0.1.14 release zip into dashboard release directories.

Verification:
- SocratiCode search used to locate extension upload preview flow.
- `npm --prefix apps/extension run build`
- Verified release zip contains manifest version 0.1.14, build label 2026-05-19 08:18 +07, and inactive preview tab open behavior.
- `curl -sS --max-time 5 http://localhost:3000/api/desktop-releases/marketplace-extension/latest` returned release version `0.1.14`.

[COMPLETE] marketplace-capture-normalized-count-display - Fixed marketplace product numeric count handling so new Chrome extension imports save sold/review counts as normalized comma-formatted numbers instead of compact text, and product list/detail pages render normalized counts for both new and previously saved rows.

Verification:
- SocratiCode search used to locate product confirm/save and product detail display paths.
- `npm --prefix apps/web run check`
- `npm --prefix apps/web test -- shared/marketplaceCapture.test.ts`
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- `curl -sS --max-time 5 http://localhost:3000/healthz` returned `{"status":"ok"}`.

[COMPLETE] marketplace-capture-product-side-panel - Changed Marketplace Capture product cards so they no longer navigate away by default. Clicking a card or the new side-panel action opens product details in a right-hand drawer, while a separate new-tab action opens the full product detail page without replacing the current list.

Verification:
- SocratiCode search used to locate Marketplace Capture product card flow.
- `npm --prefix apps/web run check`
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- `curl -sS --max-time 5 http://localhost:3000/healthz` returned `{"status":"ok"}`.

[COMPLETE] marketplace-capture-product-delete - Added owner-only Marketplace Capture product deletion from the product list and right-side product panel, with a confirmation prompt before deleting. Deleting the product removes related product images, price snapshots, and group shares through DB cascades while preserving the original capture evidence/history.

Verification:
- SocratiCode search used to locate Marketplace Capture product service/router/UI paths.
- `npm --prefix apps/web run check`
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- `curl -sS --max-time 5 http://localhost:3000/healthz` returned `{"status":"ok"}`.

[COMPLETE] marketplace-capture-category-review-image-order - Fixed Shopee product category extraction to prefer real breadcrumb/category DOM over generic marketplace labels, guarded backend LLM normalization from replacing real categories with generic Shopee/TikTok labels, changed extension image merging to append newly detected review/page images to the end without default-selecting them, and made upload payload/raw payload include only the images currently checked by the user. Published extension 0.1.15 release zip for dashboard download.

Verification:
- SocratiCode search used to locate Shopee product category extraction and extension image merge/upload flow.
- `npm --prefix apps/extension run build`
- `npm --prefix apps/web run check`
- Verified dashboard latest extension API returns version `0.1.15`.
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- `curl -sS --max-time 5 http://localhost:3000/healthz` returned `{"status":"ok"}`.

[COMPLETE] media-studio-marketplace-product-picker - Added a Marketplace Media Studio mode that lets users switch between vector/text image search and product-list browsing. Product-list mode searches captured Marketplace Capture products, lets the user choose one product, then loads only images linked to that product while preserving existing marketplace access rules and image reference actions.

Verification:
- SocratiCode search used to locate Marketplace Capture image APIs and Media Studio marketplace tab.
- `npm --prefix apps/web run check`
- `sudo systemctl restart smartspec-web`
- `systemctl status smartspec-web --no-pager` active/running.
- `curl -sS --max-time 5 http://localhost:3000/healthz` returned `{"status":"ok"}`.

[COMPLETE] gemini-omni-suite-deep-plan - Created the deep-plan package for `specs/feature/114-gemini-omni-suite-media-assets`, turning the expanded Gemini Omni Suite spec into research notes, interview/decision log, synthesized spec, implementation plan, TDD plan, self-review, and 8 implementation sections.

Verification:
- SocratiCode status/search used before targeted file reads.
- `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/114-gemini-omni-suite-media-assets`
- `git diff --check -- specs/feature/114-gemini-omni-suite-media-assets`
