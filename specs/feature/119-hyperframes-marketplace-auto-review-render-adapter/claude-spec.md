# Synthesized Specification: Feature 119 HyperFrames Marketplace Auto Review Render Adapter

## Objective

Add a HyperFrames-based deterministic HTML-to-video composition and render adapter to SmartSpecPro Marketplace Auto Review. The adapter should turn approved Marketplace Auto Review artifacts into motion storyboard previews, product card explainers, captioned final composites, platform variants, snapshots, and Library-ready MP4 outputs.

The implementation must preserve existing Marketplace Auto Review Standard Order behavior and add Auto Storyboard Review as an auto-first companion path.

## Core Product Requirements

### Dual Launch Mode

Product Detail must support:

- Auto Storyboard Review:
  - one primary CTA;
  - backend-selected defaults;
  - auto plan summary;
  - auto queueing of eligible HyperFrames preview after storyboard readiness;
  - reset-to-auto when advanced overrides are active.
- Standard Order / Custom:
  - existing explicit controls remain usable;
  - `storyboard_images` and `full_video` still work;
  - current frame/audio/image/shot/overlay/anchor semantics remain intact;
  - HyperFrames can be selected only when explicitly allowed or chosen.

Auto mode must not replace, hide to the point of unusability, or mutate Standard Order choices.

### Backend Contracts

Add shared HyperFrames contracts for:

- runtime API schemas;
- launch mode;
- auto storyboard review plan;
- feature access projection;
- status projection;
- Thai/English status copy;
- template registry and platform presets;
- composition input envelope;
- provenance envelope;
- Library finalize metadata;
- idempotency and deterministic hash inputs.

### Runtime APIs

Add tRPC procedures under `marketplaceCapture` or a focused router:

- `getAutoStoryboardReviewPlan`
- `startAutoStoryboardReview`
- `createHyperframesPreview`
- `getHyperframesRenderJob`
- `listHyperframesTemplates`
- `cancelHyperframesRenderJob`
- `saveHyperframesRenderToLibrary`

All procedures must enforce tenant/user/product/run permissions, return sanitized projections, and preserve query invalidation behavior.

### Worker and Render

Add a separate HyperFrames render worker path for:

- asset staging;
- composition lint;
- snapshot;
- inspect;
- render;
- final QA;
- upload of MP4, thumbnail, subtitle, transcript, manifest;
- retry/dead-letter/replay;
- cancellation.

MVP should use existing Marketplace Auto Review outbox/artifact tables unless durable HyperFrames tables are promoted by the spec criteria.

### UI Surfaces

Adapt existing surfaces:

- `MarketplaceCaptureProductDetail.tsx`
- `StoryboardReviewPage.tsx`
- `MediaStudio.tsx`
- Video Editor handoff
- Media Panel
- Media History
- Library search/detail/card components
- operator/admin surfaces when implemented

Do not create a parallel HyperFrames-only workspace for MVP.

### Security and Compliance

The implementation must:

- never execute arbitrary marketplace HTML;
- accept only built-in templates in V1;
- escape all product/user text;
- stage assets through safe URL/storage controls;
- block SSRF/private URLs;
- enforce tenant isolation for render jobs, artifacts, templates, and Library save;
- redact raw HTML, signed URLs, worker logs, private storage keys, and raw evidence from normal-user UI;
- preserve compliance/disclosure gates before final Library save.

### Testing and Release Gates

The plan must use tests-first section work. Gates must include:

- contracts and runtime API tests;
- auto plan and launch mode tests;
- feature access and status copy tests;
- service and worker tests;
- router/API tests;
- Product Detail dual-mode UI tests;
- Storyboard Review/MediaStudio handoff tests;
- Library finalize tests;
- security tests for XSS, SSRF, tenant isolation, and shared product/group/credit payer rules;
- mandatory Playwright/browser evidence on desktop and mobile.

## Non-Goals

- Do not implement code during this planning pass.
- Do not replace provider video generation.
- Do not replace Storyboard Review, Video Editor, or Library.
- Do not add new npm dependencies until the dependency/supply-chain gate passes.
- Do not introduce tenant custom templates in V1.
