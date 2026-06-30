# section-05-storyboard-ui-overlay-audio

## Goal

Extend Storyboard Review UI so users can clearly inspect and edit Feature 127 metadata without confusing prompt, overlay, voiceover/audio, character references, and scene references.

## Depends On

- section-04-storyboard-handoff

## Files

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/components/media/StoryboardBatchReviewDialog.tsx`
- `apps/web/client/src/locales/en/media.json`
- `apps/web/client/src/locales/th/media.json`
- relevant UI tests

## Test First

Write tests for:

- separate sections render for Video prompt, Text on video, Voiceover/audio, Character references, Scene references
- overlay metadata loads and saves
- MVP overlay presets include lower third and center title; top caption requires safe-area evidence; side panel is deferred unless responsive evidence passes
- overlay style inherits tenant/brand theme when available and falls back to safe defaults
- editing overlay does not mutate `task.prompt`
- prompt-like overlay text triggers warning
- missing voice ID shows recoverable warning
- timing mismatch warning renders
- character references render separately from scene references
- keyboard path reaches all primary controls

## Implementation Tasks

1. Read Feature 127 metadata from task/draft `extraParams`.
2. Add UI summaries for model/audio strategy/voice mode.
3. Add overlay view/edit controls using CSS metadata.
4. Implement safe MVP overlay presets and tenant/brand theme fallback.
5. Add character reference display.
6. Add selected scene reference display.
7. Add voiceover/script display and missing voice ID remediation.
8. Add timing mismatch warning.
9. Add localization.

## UI/UX Contract

### Target User / JTBD

- Role: creator reviewing generated video shots.
- Goal: understand and repair prompt, text, audio, and reference issues before generating/rendering video.
- Entry point: Storyboard Review project created by Presentation Builder.
- Success outcome: user can safely edit overlay/voice/reference metadata without corrupting video prompt.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Storyboard Review page | `StoryboardReviewPage.tsx` | metadata restoration and action wiring |
| Batch review panel | `StoryboardBatchReviewDialog.tsx` | visible sections and edit controls |
| Media locale | `en/media.json`, `th/media.json` | labels/errors/help copy |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Storyboard page | `StoryboardReviewPage.tsx` | draft state and persistence | task metadata |
| Batch review panel | `StoryboardBatchReviewDialog.tsx` | per-task UI | prompt/overlay/audio/reference metadata |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | existing loading state remains | browser/manual |
| empty | no metadata shows neutral empty sections | UI test |
| error | malformed metadata shows recoverable warning | unit/UI test |
| success | sections display correctly | UI test |
| disabled/focus/hover | edit controls keyboard reachable | browser/manual |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | sections stack; reference thumbnails do not overflow | screenshot/manual |
| tablet 768x1024 | panel remains readable | screenshot/manual |
| desktop 1440x900 | dense sections visible without excessive scrolling | screenshot/manual |
| small-mobile 360x800 | no clipped buttons/text | screenshot/manual if risky |
| laptop 1024x768 | primary controls visible | screenshot/manual if risky |
| wide-desktop 1280x800 | content width constrained | screenshot/manual if risky |

### Accessibility Acceptance

- Section headings are semantic.
- Edit controls have labels.
- Warnings are readable and associated with affected controls.
- Reference thumbnails have meaningful alt/labels.
- Focus order follows visual order.

### Copy Contract

- Required labels: Video prompt, Text on video, Voiceover, Character references, Scene references.
- Error copy explains how to fix missing voice ID or stale prompt/reference state.
- Overlay copy explains lower-third/center-title presets first and avoids exposing deferred advanced typography as MVP controls.
- Thai and English copy must match conceptually.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`.

## Acceptance

- Overlay is editable and independent from prompt.
- Character references and scene references cannot be confused.
- Voice configuration can be inspected/restored.

## Verification

- focused UI tests
- `cd apps/web && pnpm check`
- browser evidence for mobile/tablet/desktop Storyboard Review

## Implementation Notes

- Added `reviewMetadata` shared helpers to read, normalize, warn on, and update `extraParams.articleStoryboardVideo` without mutating `task.prompt`.
- Added Storyboard Review task UI panel with separate sections for Video prompt context, Text on video, Voiceover/audio, Character references, and Scene references.
- Storyboard Review metadata normalization now preserves Builder-provided `imageReferencePrompt`, `videoPrompt`, `videoPromptOverride`, and `promptSource`.
- Prompt metadata normalization preserves line breaks for long prompt blocks while still trimming and bounding length.
- Storyboard Review task UI panel now displays the 3x3 image reference prompt and video prompt in a dedicated read-only Video prompt card, including a manual-edit badge when the prompt was customized in Builder.
- The Video prompt card now includes copy actions for each prompt block and warns if the editable current task prompt differs from the Builder handoff prompt.
- When final prompts differ from generated base prompts, the panel exposes the original generated prompt in an expandable reference block with its own copy action.
- Manual prompt edits made later in Storyboard Review now record `currentVideoPrompt`, `currentPromptSource`, `currentPromptUpdatedAt`, and manual-only `reviewPromptEditedAt` in Article Video metadata without overwriting the original Builder handoff prompt.
- Regenerated segment prompts and skill-generated prompt planning use the same current prompt metadata path with neutral `currentPromptUpdatedAt`, so the Article Video panel can distinguish Builder handoff prompts from the latest Review prompt regardless of how it changed.
- The prompt drift warning now surfaces current prompt source, update timestamp, and a current-prompt copy action so reviewers can compare handoff, generated, and current prompt states without leaving the panel.
- Duration changes that normalize prompt text now record `duration_adjusted` current prompt metadata and display that source in the prompt drift warning.
- Voiceover/audio metadata restore now includes the persisted TTS render strategy, so reviewers can see whether the selected provider should use one request, provider-native dialogue, or segment-then-merge.
- Voiceover/audio panel now allows metadata-only recovery edits for voice model and per-speaker voice IDs; updates mark TTS audio stale while preserving video prompt and overlay metadata.
- Voiceover/audio panel now displays requested vs resolved audio strategy and native/separate allowance flags so fallback or blocked native-audio state is clear after handoff.
- Overlay edit supports MVP-safe `lower_third` and `center_title` presets only; prompt-like overlay text is warned.
- `StoryboardReviewPage` now persists overlay metadata edits back to `storyboardContext.extraParams`.
- Focused verification: `npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts` passed.
