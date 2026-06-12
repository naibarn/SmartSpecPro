<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-creative-contracts-and-registry
section-02-storyboard-review-persistence-and-provenance
section-03-runtime-api-feature-access-and-credit-gates
section-04-preview-and-editable-ux
section-05-composition-builder-timeline-and-fallback
section-06-render-worker-and-output-projection
section-07-library-history-video-editor-handoff
section-08-observability-cleanup-retention-operator
section-09-fixtures-e2e-rollout-gates
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-shared-creative-contracts-and-registry | - | 02, 03, 04, 05, 06, 07, 08, 09 | Yes |
| section-02-storyboard-review-persistence-and-provenance | 01 | 03, 04, 06, 09 | No |
| section-03-runtime-api-feature-access-and-credit-gates | 01, 02 | 04, 06, 07, 09 | No |
| section-04-preview-and-editable-ux | 01, 02, 03 | 09 | Yes after 03 |
| section-05-composition-builder-timeline-and-fallback | 01, 02 | 06, 09 | Yes after 02 |
| section-06-render-worker-and-output-projection | 01, 02, 03, 05 | 07, 08, 09 | No |
| section-07-library-history-video-editor-handoff | 01, 03, 06 | 09 | Yes after 06 |
| section-08-observability-cleanup-retention-operator | 01, 02, 06 | 09 | Yes after 06 |
| section-09-fixtures-e2e-rollout-gates | 04, 06, 07, 08 | - | No |

## Execution Order

1. section-01-shared-creative-contracts-and-registry
2. section-02-storyboard-review-persistence-and-provenance
3. section-03-runtime-api-feature-access-and-credit-gates
4. section-04-preview-and-editable-ux and section-05-composition-builder-timeline-and-fallback
5. section-06-render-worker-and-output-projection
6. section-07-library-history-video-editor-handoff and section-08-observability-cleanup-retention-operator
7. section-09-fixtures-e2e-rollout-gates

## Section Summaries

### section-01-shared-creative-contracts-and-registry

Create the versioned creative preset registry, schemas, aliases, prompt metadata,
capability metadata, Thai font policy, creative plan, timeline, audio event map,
manifest, and copy/evidence contracts.

### section-02-storyboard-review-persistence-and-provenance

Persist final composite state in server-owned Storyboard Review storage with
hard product/run/storyboard identity, revision conflicts, shot MP4 assignment
persistence, and legacy cleanup audit.

### section-03-runtime-api-feature-access-and-credit-gates

Expose creative preset listing, scoped state mutations, final render creation
guards, additive feature access, tenant/env gates, credit metadata, and router
tests.

### section-04-preview-and-editable-ux

Build collapsed-by-default Storyboard Review controls for independent overlay,
subtitle, audio, and text editing with true CSS/GSAP preview and audio event
preview.

### section-05-composition-builder-timeline-and-fallback

Normalize timeline and generate deterministic composition HTML/CSS/GSAP plus
explicit FFmpeg fallback capability reports.

### section-06-render-worker-and-output-projection

Harden final render worker behavior, audio preservation/mix, playable output
probe, final_video output refs, refresh/resume, and safe status projection.

### section-07-library-history-video-editor-handoff

Save creative final composites through the existing HyperFrames source with
creative metadata, idempotency, Media History download/open links, and Video
Editor handoff.

### section-08-observability-cleanup-retention-operator

Add creative-aware metrics, diagnostics, cleanup audit, retention, and operator
controls for corrupt rows, preset rollout, and replay/cancel.

### section-09-fixtures-e2e-rollout-gates

Extend fixture renders, snapshots, Playwright evidence, dependency doctor, and
production rollout gates for creative overlays, subtitles, audio, and outputs.
