# Section 04: Preview and Editable UX

## Goal

Give users a compact, scroll-safe Storyboard Review surface where they can
choose presets, inspect copy, edit every render-facing text field, preview
animation/audio behavior, and only then start final render.

## In Scope

- collapsed-by-default HyperFrames Final Composite panel;
- overlay preset and subtitle preset as independent controls;
- audio pack, music, SFX, and burn-in subtitle controls;
- editable hook, supporting text, per-shot overlay text, subtitle/voiceover
  text, and preset variables;
- editable safe preset variables such as registry-provided `styleBrief` defaults
  when the preset exposes them for user review;
- true CSS/GSAP preview for visual preset differences;
- audio event map preview;
- deterministic preview based on the same staged assets, variables, QA results,
  and output artifact assumptions as final render;
- custom React preview remains inside the same sandbox/trusted-player boundary
  as Feature 119 preview evidence;
- output status with open video, download MP4, Library/media links, and job id;
- accessibility evidence, keyboard reachability, reduced-motion support,
  responsive viewport evidence, and copy coverage.

## Out of Scope

- Worker render internals.
- Arbitrary custom HTML editor.
- Prompt-only rendering.

## Existing Files To Review

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/components/media/StoryboardBatchReviewDialog.tsx`
- `apps/web/client/src/components/marketplaceCapture/HyperframesStoryboardReviewPanel.tsx`
- `apps/web/client/src/locales/en/media.json`
- `apps/web/client/src/locales/th/media.json`
- `apps/web/client/src/pages/__tests__/StoryboardReviewPage.hyperframes.test.tsx`

## Test First

Add failing tests for:

- panel is collapsed by default and can be expanded/collapsed;
- page remains scrollable after drag/drop and while textareas are focused;
- shot MP4 assignment save failures keep render disabled;
- overlay and subtitle presets are independent;
- preview changes visibly for at least the first preset set;
- text preview shows truncation and safe-area warnings;
- edited text persists through server state and refresh;
- completed output shows open/download/Library actions;
- all new copy has Thai and English coverage;
- mobile layout has no text overlap or horizontal overflow.
- accessibility tests cover accessible names, keyboard focus order, live-region
  progress/completion announcements where supported, and reduced-motion preview
  fallback;
- responsive tests cover 360x800, 390x844, 768x1024, 1024x768, and 1440x900
  collapsed, expanded, running, completed, conflict, and blocked states.
- UI snapshots prove no raw enum, status, lifecycle, capability, fallback, or
  unsupported preset values leak instead of centralized Thai/English copy.
- UI snapshots explicitly block raw `fallback_quality`, `producer_ready`, and
  `smoke_only` strings from normal user copy.
- UI copy uses safe labels for output actions, repair actions, blocked states,
  and capability fallbacks.
- UI and preview snapshots must not expose raw signed URLs or private URLs.

## Implementation Notes

Prefer dense, operational UI. Do not use a marketing hero or large decorative
cards. Keep controls compact and grouped around the review task. The preview
should use the same preset ids and variables that final render will use.

The first preview can be browser-side for review confidence, but final render
must still use server-validated creative plans.

## Acceptance Criteria

- User can inspect and edit all text before final render.
- Four or more overlay presets no longer preview identically.
- Subtitle style can be previewed independently from overlay style.
- Burn-in subtitle state is clear.
- Render status survives refresh through server projection.

## Rollback Notes

Hide the creative editor panel and fall back to existing Storyboard Review
manual controls.
