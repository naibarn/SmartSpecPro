# Section 04: Preview and Editable UX

## Goal

Give users a compact, scroll-safe Storyboard Review surface where they can
choose presets, inspect copy, edit every render-facing text field, preview
animation/audio behavior, and only then start final render.

## In Scope

- collapsed-by-default HyperFrames Final Composite panel;
- clear blocked-source summary when no completed MP4/video shot is available:
  still images/storyboard frames may be present, but final render must remain
  disabled until at least one MP4 shot is created or imported;
- overlay preset and subtitle preset as independent controls, with overlay
  preset available globally as a default and per shot as an override;
- audio pack, music, SFX, and burn-in subtitle controls;
- SFX timeline controls that avoid opaque trigger-only selection by exposing
  sound preset, target shot scope, visual trigger, offset, duration, volume,
  and role-backed event generation;
- editable hook, supporting text, per-shot overlay text, subtitle/voiceover
  text, and preset variables;
- a per-shot text map that separates global hook/supporting copy from shot-level
  overlay/subtitle/style. Users can choose first-shot hook only, per-shot
  overlay only, both, or no text, and each shot can override overlay preset,
  animation preset, transition, overlay copy, and subtitle/voiceover copy;
- compact shot rail preview so users can inspect every shot without expanding
  a noisy full editor. Selecting a shot updates the visual preview to that
  shot's copy/style and keeps empty or blocked states obvious;
- editable full HyperFrames render prompt generated from the same product,
  storyboard, overlay, subtitle, audio, and timing state used by final render;
- editable safe preset variables such as registry-provided `styleBrief` defaults
  only as prompt inputs, not as the entire prompt shown to the user;
- JSON payload preview that embeds the exact same prompt string shown in the
  editor so preview and render intent cannot drift;
- collapsible secondary sections for payload JSON, audio event map, and visual
  text preview so unavailable or diagnostic functions stay minimized by default
  and do not interrupt Storyboard Review work;
- optional `hyperframes-render-prompt` skill handoff when deterministic copy
  extraction cannot produce a strong hook, complete specs, and storytelling
  animation plan;
- render-facing option changes should update preview immediately but mark the
  full prompt as stale. The user should adjust all options first, then generate
  the prompt once through `hyperframes-render-prompt`;
- no silent fallback is allowed if the prompt skill fails. The UI must keep the
  stale prompt warning/render block and expose the skill failure reason so
  operators fix the real skill/config problem;
- true CSS/GSAP preview for visual preset differences;
- audio event map preview generated from the same SFX timeline drafts that
  final render sends to HyperFrames;
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
- UI snapshots explicitly block raw `fallback_quality`,
  `official_producer_ready`, `official_runtime_blocked`, and legacy
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
- User can configure text globally for the first hook and separately per shot,
  including shot-specific style, animation, transition, overlay copy, and
  subtitle/voiceover copy.
- User can configure SFX timing per target shot/trigger/offset/duration/volume
  without guessing what a multi-select will do.
- Four or more overlay presets no longer preview identically.
- Subtitle style can be previewed independently from overlay style.
- Burn-in subtitle state is clear.
- Render status survives refresh through server projection.

## Rollback Notes

Hide the creative editor panel and fall back to existing Storyboard Review
manual controls.
