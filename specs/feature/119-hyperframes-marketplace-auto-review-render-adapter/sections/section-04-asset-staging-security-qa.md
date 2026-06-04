# Section 04: Asset Staging, Security, and QA

## Goal

Add the safety layer that prepares assets for HyperFrames render jobs and rejects unsafe inputs before any runtime process touches them.

This section protects against SSRF, XSS, tenant leakage, malformed media, and low-quality render outputs.

## In Scope

- Asset staging service and manifest generation.
- URL and ownership validation.
- Temporary workspace policy.
- Worker/browser isolation and preview sandbox requirements.
- Pre-render QA and post-render QA service.
- Security tests for URL, text, tenant, and diagnostics handling.

## Files To Create

- `apps/web/server/services/hyperframesAssetStagingService.ts`
- `apps/web/server/services/hyperframesQaService.ts`
- `apps/web/server/services/__tests__/hyperframesAssetStagingService.test.ts`
- `apps/web/server/services/__tests__/hyperframesQaService.test.ts`
- `apps/web/server/services/__tests__/hyperframesSecurity.test.ts`

## Existing Files To Review

- `apps/web/server/services/mediaLibraryService.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/shared/hyperframes/contracts.ts`
- existing upload/storage helpers in `apps/web/server/services/`

## Test First

Add failing tests for:

- allowed product image, storyboard frame, generated clip, audio, subtitle, font, and thumbnail refs stage into a manifest;
- tenant/user/product ownership mismatch is rejected;
- `javascript:`, `file:`, localhost/private IP, metadata service, malformed, and unsupported protocol URLs are rejected;
- raw signed URLs are redacted from logs and diagnostics;
- content type, extension, size, duration, and resolution limits are enforced;
- temporary workspace cleanup runs on success and failure;
- pre-render QA blocks stale composition hashes, missing assets, missing disclosure, and invalid subtitle safe area;
- post-render QA blocks blank frames, unplayable MP4, wrong duration/resolution/fps, missing audio where required, and failed disclosure/CTA checks.
- worker temp dirs are tenant/run scoped, broad filesystem paths are not mounted, and cleanup runs after completion/failure;
- browser preview is sandboxed, applies strict CSP, cannot read cookies/localStorage, and cannot call SmartSpecPro APIs.

## Asset Staging Rules

Staging must accept only trusted refs from the composition input and storage layer. It should not blindly download arbitrary product text URLs.

Allowed asset classes:

- product images;
- storyboard frame images;
- generated video clips;
- voiceover/music/audio;
- subtitle files;
- approved fonts;
- generated thumbnails;
- fixture assets for tests.

Rejected asset classes:

- raw marketplace HTML;
- browser extension page URLs;
- private network targets;
- metadata-service URLs;
- unsupported schemes;
- unowned tenant/user assets;
- over-limit media.

## Worker and Browser Isolation

Render workers must:

- run in a dedicated container/job, not the main web request thread;
- use tenant-scoped temporary directories;
- write only under controlled work/output directories;
- avoid mounting broad application filesystem paths;
- deny network access after asset staging when possible;
- cap CPU, memory, duration, frame count, and output size;
- redact logs before exposing diagnostics to users;
- support graceful cancellation where possible.

Composition preview in the web app must:

- use a sandboxed iframe or trusted player boundary;
- apply strict CSP;
- avoid same-origin execution of generated composition HTML;
- use signed, short-lived URLs for preview assets;
- prevent composition HTML from reading cookies/localStorage;
- prevent composition HTML from calling SmartSpecPro APIs.

## Manifest Requirements

The staged manifest must include:

- stable asset IDs;
- original safe ref;
- staged path or storage ref;
- content hash;
- media kind;
- MIME type;
- size;
- dimensions or duration where applicable;
- tenant/product/run/render refs;
- created time;
- cleanup policy;
- redacted diagnostic context.

## QA Pipeline

Pre-render QA:

- validate composition schema;
- validate product truth and compliance plan;
- validate staged asset manifest;
- validate subtitle and overlay safe areas;
- validate template requirements;
- validate stale input/template hashes.

Post-render QA:

- inspect output container;
- check playable video;
- sample frames for blank/black/transparent output;
- validate duration, fps, resolution, audio presence;
- validate captions/disclosures are present;
- validate output checksum;
- mark Library save readiness.

## Acceptance Criteria

- Unsafe URLs and unowned assets fail before staging.
- QA services return typed issues consumable by status projections and UI.
- Diagnostics are safe for user display and logs.
- Worker/browser isolation rules are represented by tests or explicit implementation checks.
- Temporary files are cleaned reliably.
- Tests cover SSRF, XSS, tenant isolation, stale hashes, and QA blockers.

## Rollback Notes

If staging or QA causes false positives, disable HyperFrames Auto and keep Standard Order active. Do not bypass security checks in production.

## UI/UX Contract

### Target User / JTBD

Users need clear, safe explanations when an asset or QA issue blocks automatic preview/render, without seeing unsafe diagnostics.

### Surface Inventory

| Surface | Impact |
|---|---|
| Product Detail | shows asset/QA blockers and next actions |
| Storyboard Review | shows snapshot, caption, disclosure, and output QA state |
| MediaStudio | blocks save when final QA is not ready |
| Library | only receives QA-passed final outputs |

### Component Map

| Component | Service output |
|---|---|
| Auto plan summary | asset readiness blockers |
| Render panel | QA progress and safe failure diagnostics |
| Snapshot comparison | snapshot QA refs |
| Library save controls | final QA readiness |

### State Matrix

| State | Expected UI behavior |
|---|---|
| staging | progress state with polling |
| asset rejected | safe blocker and Standard fallback |
| pre-render QA failed | next action or retry disabled |
| post-render QA failed | output not saveable to Library |
| QA passed | save/output actions enabled |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | QA messages fit in compact panels |
| tablet | issue lists stack without clipped actions |
| desktop | detailed diagnostics remain in secondary UI |

### Accessibility Acceptance

QA failures must be announced as status text and actionable controls must have accessible names.

### Copy Contract

Use safe issue categories and copy IDs. Never display raw URLs, signed query strings, file paths, stack traces, or private IP diagnostics.

### Browser Evidence Required

E2E/browser evidence must cover asset rejected, QA failed, and QA passed states on Product Detail and Storyboard Review.
