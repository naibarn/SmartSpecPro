# section-04-storyboard-handoff

## Goal

Create a Storyboard Review project/draft from article video shot plans and persist enough metadata to regenerate prompts, overlay, voiceover, references, and timing later.

## Depends On

- section-01-contracts-flags
- section-02-builder-preview
- section-03-references-prompts-scripts

## Files

- `apps/web/shared/articleStoryboardVideo/handoff.ts`
- `apps/web/client/src/lib/storyboardReviewWorkspace.ts`
- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
- relevant create/open Storyboard Review integration points in `PresentationArticleGeneratorDialog.tsx` or existing app routing

## Test First

Write tests for:

- 5-page article creates 5 ordered video tasks
- each task stores video model and duration
- `task.prompt` excludes overlay text
- native audio prompt includes speech only when allowed
- per-shot manual video prompt overrides become that shot's `task.prompt`
- per-shot image reference prompt and final video prompt are persisted in `extraParams.articleStoryboardVideo`
- selected scene references go to `storyboardContext.referenceImages`
- character references stay separate in `extraParams`
- static slide image fallback metadata is preserved only as fallback/reference data, not primary video output
- `extraParams` stores source, page, shot, overlay, prompt skill, script skill, audio strategy, voice config, selected reference IDs, timing
- optional Presentation Note writes remain secondary and never become canonical video state
- `videoSegmentState.videoSegmentPlan` restores selected video model and audio strategy
- existing `companionAudio`, `companionAudioUpdatedAt`, and `voiceoverFullScript` conventions are preserved
- duplicate source draft/mode does not silently create duplicate projects
- handoff can create the project with estimated timing before TTS exists and later recompute timing from measured audio
- successful handoff opens Storyboard Review immediately and provides a return/backlink path
- old Storyboard Review projects without Feature 127 metadata load with defaults and recoverable warnings
- old separate-TTS drafts with missing voice IDs remain viewable and keep existing generated audio, but block new TTS generation
- migration/normalization does not rewrite generated video or audio assets unless the user explicitly regenerates them

## Implementation Tasks

1. Map `ArticleStoryboardVideoHandoff` into `StoryboardReviewDraft` conventions.
2. Create one `StoryboardGenerationTask` per shot.
3. Preserve `taskIds` order from page order.
4. Store selected scene references in `storyboardContext.referenceImages`.
5. Store character reference metadata separately in `extraParams`.
6. Store static slide image fallback metadata only as optional fallback/reference metadata.
7. Store overlay metadata in a loadable location for Storyboard Review UI.
8. Store audio strategy, requested/resolved strategy, voice mode, voice model, voice IDs, TTS render strategy, native audio plan, and timing.
9. Store per-shot image reference prompt, final video prompt, optional manual video prompt override, and prompt source.
10. Initialize `videoSegmentState` consistently with existing Storyboard Review planner helpers.
11. Add idempotency/source metadata guard.
12. Support optional Presentation Note writes without making notes canonical.
13. Support estimated timing at project creation and measured timing recomputation after audio exists.
14. Preserve existing `companionAudio`, `companionAudioUpdatedAt`, and `voiceoverFullScript` state during load/migration.
15. Keep legacy projects viewable, including missing voice ID recovery for old separate-TTS drafts.
16. Open the created Storyboard Review project immediately after successful handoff.

## Acceptance

- Storyboard Review opens with ordered tasks.
- Existing Storyboard Review draft normalization still works for old projects.
- Feature 127 metadata survives save/load.
- Paid generation remains a later explicit action.
- Static slide fallback remains secondary/reference-only.
- Presentation Note is optional and non-canonical.
- Manual prompt edits are scoped to the individual shot and do not rewrite prompts for other tasks.
- Existing generated video/audio assets are never rewritten by migration or normalization.
- The user lands in Storyboard Review after handoff and can return to Presentation Builder.

## UI/UX Contract

### Target User / JTBD

Indirect UI. This section ensures the Storyboard Review UI has enough persisted metadata to display clear sections.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Storyboard Review project | existing route | receives tasks and metadata |
| Presentation Builder handoff | existing dialog | create/open action uses handoff result |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Handoff mapper | `handoff.ts` | draft/task metadata | shot plans |
| Storyboard workspace | `storyboardReviewWorkspace.ts` | draft normalization | handoff metadata |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | existing create/open progress | section-02 evidence |
| empty | no tasks blocks handoff | unit test |
| error | duplicate/malformed metadata recoverable | unit/UI test |
| success | Storyboard Review opens with ordered tasks | integration/browser |
| disabled/focus/hover | owned by UI sections | section-02/05 evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | no direct layout ownership | section-02/05 evidence |
| tablet 768x1024 | no direct layout ownership | section-02/05 evidence |
| desktop 1440x900 | no direct layout ownership | section-02/05 evidence |

### Accessibility Acceptance

This section must preserve metadata that UI sections use for accessible labels and warnings.

### Copy Contract

Expose stable warning/reason codes; localized copy is added in UI sections.

### Browser Evidence Required

Indirect. Verify create/open flow in section-02 and Storyboard Review rendering in section-05.

## Verification

- `cd apps/web && pnpm test -- storyboardReviewWorkspace`
- focused handoff tests
- `cd apps/web && pnpm check`

## Implementation Notes

- Added Storyboard Review draft builder that creates one queued video task per article page.
- Persisted source lineage, idempotency key, selected scene references, character references, overlay metadata, static fallback image, voice config, script segments, and timing metadata.
- Persisted audio resolution details required for downstream voice generation and repair: requested/resolved strategy, audio reason code, native/separate allowance flags, fallback list, and `ttsRenderStrategy`.
- Persisted shot-level image reference prompts, final video prompts, manual video prompt overrides, and `promptSource`; manual video prompt overrides become the task prompt for the matching shot only.
- Persisted generated base image/video prompts separately from final image/video prompts so manual Builder edits remain traceable after handoff.
- Included per-shot prompt inputs/overrides in the Builder source draft identity used for duplicate prevention, so corrected prompts do not silently reopen stale duplicate projects.
- Preserved existing companion audio and voiceover script conventions when an existing draft is supplied.
- Added duplicate handoff guard, deterministic Builder source draft ID generation, Builder retry reuse, and legacy-warning helper.
- Builder retry reuse now avoids passing unrelated existing Storyboard Review drafts into new Article Video project creation, preventing old companion audio/render state from leaking into a fresh handoff.
- Article Video handoff now writes a schema-valid `videoSegmentState.videoSegmentPlan` (`sourceSurface: "storyboard_review"`, `mode/effectiveMode: "per_shot"`, valid segment shape, object warnings, and plan hash metadata) while keeping Article Video identity on task source metadata.
- The outer `videoSegmentState.effectiveMode` also stays `per_shot` so downstream task extra params do not receive a custom non-planner mode value.
- Each handoff task now receives `videoSegmentId`, `videoSegmentShotIds`, `videoSegmentPlanVersion`, and `videoSegmentPlanHash` so Storyboard Review can map tasks back to the correct video segment without relying on invalid custom plan fields.
- Focused verification included `section04.test.ts`.
