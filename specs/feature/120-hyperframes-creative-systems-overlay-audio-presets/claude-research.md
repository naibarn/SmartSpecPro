# Research: Feature 120 HyperFrames Creative Systems Overlay, Subtitle, Audio, And SFX Presets

Date: 2026-06-12
Mode: existing codebase, SocratiCode-first, planning only
Initial spec: `specs/feature/120-hyperframes-creative-systems-overlay-audio-presets/spec.md`

## Research Decision

Codebase research is required because Feature 120 extends existing HyperFrames
contracts, Storyboard Review, MediaStudio, Media History, render worker,
runtime API, tenant access, credit, storage, and e2e gates.

Web research is represented by the Feature 120 spec and attached local research
packs. This planning pass did not fetch new external docs because the user asked
to continue planning from the current spec. External HyperFrames references stay
primary-source anchored in the spec and Feature 119 research.

SocratiCode status was green for `/home/dev/projects/SmartSpecPro` with 92586
indexed chunks and an active watcher. Discovery used SocratiCode first, then
targeted `rg` and line-range reads.

## Spec Source Anchors

Depends-on coverage: Feature 120 depends on Feature 113, Feature 117, Feature
118, Feature 119, and the existing Storyboard Review, Video Editor, Media
Library, media job, storage, tenant access, and Marketplace product evidence
systems.

The spec's external references and local research remain authoritative for
runtime details:

- HyperFrames README, Prompt Guide, Data Attributes, Variables, GSAP Animation,
  and Pipeline references
- Local research for HyperFrames Text Overlay Preset Library
- Local research for HyperFrames Audio + SFX Preset Library

## Current SmartSpecPro Baseline

Feature 119 is already partially implemented in the codebase. Relevant current
files include:

- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- `apps/web/shared/hyperframes/featureAccess.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/hyperframesCompositionService.ts`
- `apps/web/server/workers/hyperframesRenderWorker.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/pages/MediaHistory.tsx`

Existing runtime API support includes:

- `marketplaceCapture.createHyperframesFinalComposite`
- `marketplaceCapture.getHyperframesRenderJob`
- `marketplaceCapture.saveHyperframesRenderToLibrary`
- `marketplaceCapture.repairHyperframesRenderJob`
- HyperFrames render status projections with `outputRefs`
- Media History and Library discovery using
  `marketplace_auto_review_hyperframes_render`

## Contract Baseline

The current shared contract version is:

```text
hyperframes_marketplace_auto_review_v1
```

Feature 120 should not bump this version unless a formal migration adds
dual-parse, adapters, rollback tests, and compatibility evidence. The safer
first path is additive schemas plus explicit alias mapping from existing final
composite ids.

Current final composite schema has legacy flat fields:

- `fontFamily`
- `textMode`
- `overlayPreset`
- `subtitlePreset`
- `burnInSubtitles`
- `hookText`
- `supportingText`
- `shots[].onScreenText`
- `shots[].subtitleCues`

These are useful as a compatibility bridge, but they are not rich enough to be
the long-term source of truth for creative presets, audio event maps, manifest
hashes, and platform capability gating.

## Storyboard Review Storage Baseline

Storyboard Review rows are stored in:

```text
media_studio_storyboard_reviews.reviewData
```

The `videoEditorProjects` router currently reads and writes whole review data
and includes helpers for marketplace canonical links. It already rejects some
mixed product/run cases. Feature 120 must build on this and add scoped
HyperFrames state updates or a companion table. Final composite state must not
depend on transient React state.

Critical persisted state gaps:

- dragged or imported shot MP4 assignment must persist before render;
- product id, run id, storyboard review id, and revision must be hard
  constraints;
- stale saves must produce a conflict instead of last-write-wins;
- corrupted legacy projects must be auditable and safe to delete or archive.

## Render Worker Baseline

`hyperframesRenderWorker.ts` already has an FFmpeg/ASS final composite path. It
can generate burn-in text and subtitles, but this path is limited compared with
CSS/GSAP:

- no rich DOM layout;
- limited typography and animation;
- limited per-word timing;
- no full GSAP preview parity;
- audio preservation or mixing must be explicitly verified;
- ASS text wrapping can truncate Thai copy or create inconsistent sizing.

Feature 120 needs a capability model. Some presets can render through FFmpeg
fallback with partial quality; richer presets require producer/browser runtime.

## Feature Access Baseline

Current tenant and env gates already exist:

- `marketplaceHyperframesEnabled`
- `marketplaceHyperframesWorkerEnabled`
- `marketplaceHyperframesLibrarySaveEnabled`
- `marketplaceHyperframesOperatorEnabled`
- `MARKETPLACE_HYPERFRAMES_ENABLED`
- `MARKETPLACE_HYPERFRAMES_DISABLED`
- `MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED`
- `MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE`
- `MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED`
- `MARKETPLACE_HYPERFRAMES_TEMPLATE_ALLOWLIST`

Feature 120 should extend the backend-derived projection additively. UI pages
must not re-implement flag, worker, credit, template, or operator logic.

## Media History And Library Baseline

Current tests and routes already know the HyperFrames source:

```text
marketplace_auto_review_hyperframes_render
```

Feature 120 must reuse this source and add creative metadata. Completed status
without a safe playable `final_video` output URL and content hash must not be
treated as complete.

## Testing Baseline

Available package scripts include:

```bash
npm --prefix apps/web run test
npm --prefix apps/web run e2e:marketplace-hyperframes
npm --prefix apps/web run hyperframes:dependency-audit
npm --prefix apps/web run hyperframes:doctor
npm --prefix apps/web run hyperframes:fixture-render
npm --prefix apps/web run hyperframes:snapshot-test
npm --prefix apps/web run hyperframes:production-rollout-gate
```

Feature 120 should extend these gates rather than inventing a parallel release
path.

## Planning Constraints

- Do not add new render dependencies in early contract and UX sections.
- Preserve Feature 119 behavior and Standard Order fallbacks.
- Preserve the current contract version unless migration gates pass.
- Store creative source of truth in typed server-owned state, not UI-only state.
- Make text editable and previewable before final render.
- Do not allow prompt-only rendering at runtime.
- Do not use product title, latest project, thumbnail, or visual similarity as
  identity fallback.
- Do not mark a job completed until playable output is available.
- Keep normal user diagnostics sanitized.
