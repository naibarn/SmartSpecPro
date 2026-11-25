# Marketplace Auto Review Facebook Photo Post Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Facebook Photo Post path to Auto Review using one of its three generated social images, existing caption/hashtags/affiliate information, and existing Meta/Page/job infrastructure.

**Architecture:** Keep the Reels publisher intact and add a distinct Photo Post intent, worker job, and source marker using the existing `social_posts`, `worker_jobs`, outbox, and Meta connection. Resolve the selected generated image from the run's private `socialCaption.postImages.variants` on the server, verify and stream it to a dedicated Python Meta Graph multipart endpoint, and expose both formats through the existing collapsible publishing card. Photo readiness depends on the completed image and connected Page, not final video/Library readiness.

**Tech Stack:** TypeScript, React, tRPC, Drizzle, canonical Worker Jobs/outbox, Python FastAPI, httpx, Meta Graph API v27.0, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-11-25-marketplace-auto-review-facebook-photo-post-design.md`

## Global Constraints

- Select exactly one completed generated image variant: `caption_source`, `character_reference`, or `product_reference`.
- Resolve image bytes and ownership server-side; do not accept a client-provided URL or expose private storage publicly.
- Use `/{page-id}/photos` multipart binary upload for a single image post; do not use the Reels endpoint or a public URL parameter.
- Reuse existing OAuth/Page checks, affiliate and commercial disclosure controls, `social_posts`, `worker_jobs`, and outbox.
- Do not trigger rendering or image generation from publishing; do not blindly retry ambiguous publish requests.
- Preserve existing Facebook Reel behavior and all pre-task dirty worktree changes.
- DEV release target is only `legacy-debian-dev`; no real public post without an explicitly authorized test Page.

## Review Focus

- Incomplete or changed variants: the service must reject anything except one completed variant still bound to this run; test status, missing storage key, and changed image hash.
- Oversized or malformed image: reject before the external publish request; test MIME sniffing, declared size, actual bytes, checksum, and Meta's 10 MiB limit.
- Ambiguous Meta timeout: persist `needs_user_action`/reconciliation and never submit a second post automatically; test timeout after request begins.
- Cross-tenant Page/run/image access: deny before token decryption or storage read; test user and tenant mismatches.
- Same Auto Review run publishing both formats: keep Reel and Photo Post histories/intents independent while duplicate Photo Post clicks for the same snapshot resolve to one intent; test both cases.

## Files and Responsibilities

- Modify `python-backend/app/services/social/meta_graph_client.py`: add one-photo upload using configured Graph version without changing `create_post` feed behavior or Reels behavior.
- Modify `python-backend/app/api/social_publish.py`: add internal raw-stream photo upload endpoint with strict size, content type, Page ID, and auth checks.
- Create/modify Python tests in `python-backend/tests/unit/services/test_meta_graph_client.py` and `python-backend/tests/unit/api/test_social_publish.py`.
- Create `apps/web/server/services/facebookPhotoPublishGateway.ts`: stream the authorized private image to the internal Python endpoint with token-safe headers and no automatic retry.
- Create `apps/web/server/services/marketplaceAutoReviewPhotoPostService.ts`: resolve/verify run, product, affiliate, generated image and Page; create idempotent social post intent; execute preflight, publish and uncertain-state handling.
- Create `apps/web/server/routers/marketplaceAutoReviewPhotoPosts.ts` and register it in `apps/web/server/routers.ts`.
- Modify `apps/web/server/services/jobExecutorRegistry.ts`: register the dedicated `social.facebook.photo.publish` executor.
- Add `apps/web/drizzle/0457_social_posts_marketplace_photo_intent_unique.sql` and register it in the existing migration journal if no later migration has claimed that sequence.
- Modify `apps/web/client/src/components/marketplaceCapture/FacebookReelsPublishCard.tsx`: format selector, one-of-three completed image selector/preview, shared draft fields, collapsed/expanded outer panel, and format-scoped history/actions.
- Extend the Photo Post readiness response with only the three server-resolved variant keys, safe labels, statuses, and authenticated preview URLs; the client submits only a variant key.
- Add/update focused Vitest files for Photo Post service and publishing card behavior.
- Track this work in this plan and close with the acceptance report after focused verification and DEV release.

## Task 1: Meta single-photo binary publishing adapter

**Interfaces:**
- Consumes: the existing MetaGraphClient access token, pinned Photo Graph API version, Page ID and bounded raw image bytes.
- Produces: `MetaGraphClient.publish_page_photo(message: str, content: bytes, filename: str, content_type: str) -> dict[str, Any]` using the Page `photos` edge; validates a real returned photo identifier.

- [ ] Add a mocked transport test for multipart `POST /{page-id}/photos`, including message, binary bytes, auth, API version, response IDs, permission error, and ambiguous timeout behavior.
- [ ] Run the focused Python tests and confirm they fail for the missing operation.
- [ ] Implement the adapter using multipart `source` bytes, `published=true`, no public URL parameter, and `retry_transient=False` for the external side effect.
- [ ] Add the internal FastAPI stream endpoint; reject malformed IDs/content types, missing internal authorization, empty/oversized body, and mismatched declared size; do not log tokens or body data.
- [ ] Run `cd python-backend && DEBUG=false .venv/bin/python -m pytest --no-cov -q tests/unit/services/test_meta_graph_client.py tests/unit/api/test_social_publish.py`.

## Task 2: Auto Review Photo Post intent and worker

**Interfaces:**
- Consumes: Task 1 internal endpoint, `storageStreamFile`, existing social Page access and worker job gateway.
- Produces: protected readiness/history/publish/reconcile routes; `executeMarketplaceAutoReviewPhotoPostPublish({tenantId,userId,postId,runId,intentHash,reportProgress})`; dedicated executor for `social.facebook.photo.publish`.

- [ ] Write service tests proving one completed server-resolved variant is required, tenant/user/page scope is enforced, affiliate snapshot is canonical, and no client URL is trusted.
- [ ] Write idempotency tests proving repeated same-format/snapshot clicks reuse one intent, Photo and Reel remain independent, and concurrent insertion is unique.
- [ ] Write worker tests proving storage bytes/MIME/dimensions/checksum/size preflight, state progression, persisted external IDs, safe error redaction, and timeout transitions to uncertain/reconcile without auto-republish.
- [ ] Run the focused tests and confirm failures before implementation.
- [ ] Implement the service, router, executor registration, and migration/journal entry. Preserve current Reel query/index semantics.
- [ ] Run focused TypeScript tests for new service/router and existing Reel service tests.

## Task 3: Publishing format selector and image interaction

**Interfaces:**
- Consumes: readiness/history/publish results from Task 2, including the server-projected three variants and authenticated preview URLs.
- Produces: the provided mockup's Reel/Photo Post selector, exactly one selected generated image for Photo Post, and format-separated histories/actions within the same collapsible card.

- [ ] Add UI tests for selector defaults, switching modes, each of the three variants, pending/failed/missing images, collapse/expand draft preservation, disabled readiness, and unchanged Reel flows.
- [ ] Run focused UI tests and confirm they fail before implementation.
- [ ] Implement the mode selector and photo preview without new generation or arbitrary URL inputs; share Page/caption/hashtag/affiliate/disclosure controls while keeping histories and statuses type-safe and separated.
- [ ] Run focused `FacebookReelsPublishCard` and Auto Review panel tests.

## Task 4: Integrated verification and DEV release

- [ ] Review the final diff and confirm only task-owned paths are staged; run `git diff --check` and focused regression suites from Tasks 1-3.
- [ ] Apply and verify the DEV migration if required; do not mutate production.
- [ ] Verify the deployment target manifest selects `legacy-debian-dev`; build and release the integrated SHA to `smartaihub.app` only.
- [ ] Verify web/worker health, public route health, and protected API behavior. Do not create a live Facebook post without a configured and explicitly authorized test Page.
- [ ] Update the Phase A implementation report with Photo Post scope, test evidence, deployment evidence, and any Meta blockers; commit/push and verify local `main == origin/main`.
