# Implementation Plan: Feature 120 HyperFrames Creative Systems Overlay, Subtitle, Audio, And SFX Presets

## 1. Objective

Turn the existing Feature 119 HyperFrames adapter into a durable creative
system for commercial product videos and final product-video composites. Users must be able to choose,
preview, inspect, edit, and render overlay text, subtitle styles, Thai fonts,
audio beds, SFX, and audio event maps without losing product/run/storyboard
identity or producing unplayable Media History outputs.

This feature is additive. It must not replace Marketplace Capture, Marketplace
Auto Review, Storyboard Review, MediaStudio, Media History, Video Editor,
Library, or Feature 119 runtime APIs.

## 2. Baseline To Preserve

Preserve these current behaviors:

- Feature 119 contract version `hyperframes_marketplace_auto_review_v1`.
- `marketplaceCapture.createHyperframesFinalComposite`.
- `marketplaceCapture.getHyperframesRenderJob`.
- `marketplaceCapture.saveHyperframesRenderToLibrary`.
- existing HyperFrames status projection and `outputRefs`.
- Storyboard Review manual clip review and compound render tools.
- MediaStudio HyperFrames render-to-library session support.
- Media History filtering for `marketplace_auto_review_hyperframes_render`.
- Standard Order and existing Marketplace Auto Review flows.
- tenant feature flags, env gates, credit/quota, and operator permission model.

## 3. Target Architecture

Target flow:

```text
Storyboard Review
  -> load server-owned HyperFrames final composite state
  -> persist shot MP4 assignments and text edits with revision checks
  -> select overlay/subtitle/audio presets from backend registry projection
  -> preview resolved text, CSS/GSAP layout, timeline, and audio events
  -> create final render with creativePlanHash and timelineHash
  -> worker stages assets, renders, probes playable MP4, stores manifest
  -> status projection exposes final_video URL, download, Library action
  -> Media History, Library, and Video Editor reuse existing source metadata
```

Core boundaries:

- shared contracts and preset registry under `apps/web/shared/hyperframes/`;
- server state mutation and render API under existing routers/services;
- Storyboard Review UI as the first creative editing surface;
- composition builder generates deterministic HTML/CSS/GSAP and fallback data;
- worker owns render/probe/output status;
- Library and Media History receive creative metadata through existing source.

## 4. Hard Rules

Feature 120 must enforce these rules from the first implementation section:

- product id, run id, storyboard review id, tenant id, user id, and revision are
  required for every state mutation and render creation;
- no project-title, latest-project, thumbnail, or visual-similarity fallback;
- dragged/imported/replaced shot MP4 assignments must persist server-side before
  render can be enabled;
- render creation uses persisted state or explicitly saved draft state, not
  transient React arrays;
- the system must not treat HyperFrames as a prompt-only renderer;
- fallbacks should be explicit adapter choices, not hidden data-guessing paths;
- arbitrary tenant-authored HTML must not become executable production HTML;
- presets are selected by id, version, and variables;
- prompt packs are metadata and future integration hints, not the only runtime
  render input;
- completed render status requires a playable `final_video` output URL and
  content hash;
- Library save reuses `marketplace_auto_review_hyperframes_render`;
- FFmpeg fallback must be capability-marked as partial when it cannot represent
  a selected CSS/GSAP/audio preset.
- overlay, spec, price, review, CTA, subtitle, and voiceover copy must remain
  evidence-bound to product truth, Marketplace Capture fields, AI insight
  evidence, user edits, policy disclosure, or derived summaries;
- render-time workers must not call an LLM or web search to repair unsupported
  claims; enrichment must happen earlier and persist evidence refs first;
- unsupported user edits, stale volatile marketplace facts, and instruction-like
  marketplace text must block final render or be omitted with recorded safe
  reasons;
- audio, SFX, font, and media refs must include source/license/checksum metadata
  before final render can use them.
- Feature 120 remains a long-term adapter for future HyperFrames Studio/player,
  catalog, producer API, and audio tooling upgrades.

## 5. Implementation Sections

Use the section files in `sections/` as the implementation backlog:

1. Shared creative contracts and registry.
2. Storyboard Review persistence and provenance.
3. Runtime API, feature access, and credit gates.
4. Preview and editable UX.
5. Composition builder, timeline, and fallback adapter.
6. Render worker and output projection.
7. Library, Media History, and Video Editor handoff.
8. Observability, cleanup, retention, and operator tools.
9. Fixtures, e2e, and rollout gates.

## 6. Migration Strategy

Phase 1 keeps the existing final composite schema working. Current ids such as
`kinetic_bold_hook`, `price_impact`, and `karaoke_word` map through explicit
aliases to the new registry. Unknown ids fail validation.

Phase 2 stores Feature 120 state under a scoped
`reviewData.hyperframesFinalComposite` subdocument unless the companion-table
gate is approved. This subdocument includes schema version, canonical product
id, auto review run id, storyboard review id, revision, shot media assignments,
text variables, preset refs, creative plan hash, latest render refs, and
updated timestamps.

Phase 3 may promote to a companion table only after a dry-run audit, backfill,
dual-read, dual-write, cutover, rollback SQL, and drift tests exist.

## 7. Release Strategy

Ship incrementally:

1. contracts and registry behind tests;
2. persisted state and identity validation with no render behavior change;
3. backend preset listing and scoped mutations;
4. collapsed-by-default Storyboard Review controls and preview;
5. composition builder and fallback QA;
6. worker output hardening and playable output links;
7. Library/media handoff metadata;
8. artifact/output compatibility and retention proof;
9. operator cleanup and rollout gates.

Production enablement requires passing dependency audit, doctor, fixture render,
snapshot test, e2e, and production rollout gate.

Rollout must use canary tenants before broad enablement, and candidate presets
must be promoted to active only after fixture, snapshot, QA, accessibility,
audio, and production rollout evidence passes.

## 8. Open Decision Gates

Before implementation chooses runtime behavior, record decisions for the spec's
open questions in
`specs/feature/120-hyperframes-creative-systems-overlay-audio-presets/reviews/open-question-decision-log.md`:

- SFX source: bundled licensed starter pack vs tenant-uploaded/Library-selected
  assets.
- SFX starter pack: whether SmartSpecPro ships a licensed pack or requires
  tenant-uploaded/Library-selected assets first.
- Music generation: existing media providers vs asset-library based V1.
- Karaoke timing: transcript generation, TTS output, or manual cue editing.
- Producer path: HyperFrames CLI vs `@hyperframes/producer` in worker image.
- Preview surface: custom React/CSS preview vs HyperFrames Studio/player as the
  long-term surface, with the current custom React preview kept inside the same
  sandbox/trusted-player boundary as Feature 119 preview evidence.
- Social variant package: whether `social_variant_package` is contract-only in
  V1 or enabled after vertical final composite evidence.

Any capability that depends on an unresolved decision log row must remain hidden,
disabled, or candidate-only. Decision updates must include owner, evidence,
affected flags/preset lifecycle states, and rollback behavior.

## 9. Artifact, Runtime, And Compatibility Gates

Implementation must keep Feature 119 outbox, artifact, output, polling, repair,
and Library schemas readable. New creative sidecars map to existing artifact
kinds first, especially `hyperframes_manifest`, unless a migration ships with
retention, operator, Library, Media History, fixture, and backward-compatibility
tests.

Runtime manifests must record runtime profile hash and tested runtime versions:

- Chrome/Playwright;
- FFmpeg/FFprobe;
- libass/fontconfig;
- Node;
- HyperFrames packages or CLI.

Composition output must preserve HyperFrames data-attribute expectations:

- `data-composition-id`;
- `data-width` and `data-height`;
- timed `class="clip"` elements;
- media timing and `data-volume`;
- registered `window.__timelines[compositionId]`;
- deterministic timeline setup with no async/fetch behavior in render setup.
- no manual play/pause/seek audio with JavaScript inside the composition;
- no SmartSpecPro API calls, cookies, or localStorage access from composition or
  preview HTML;
- no raw signed URLs or private URLs in normal UI output.

## 10. Rollback

Rollback is flag-first:

- disable Feature 120 creative presets while preserving Feature 119 renders;
- keep historical Library media playable;
- keep Standard Order available;
- block new final composite renders when worker/runtime is degraded;
- retain manifests and sanitized diagnostics for already completed outputs;
- use cleanup audit for corrupted Storyboard Review projects instead of hidden
  fallback repair.
