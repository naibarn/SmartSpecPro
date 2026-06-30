# section-02-builder-preview

## Goal

Add the opt-in Article To Storyboard Video output mode in Presentation Builder and provide a clear preview before creating the Storyboard Review project.

## Depends On

- section-01-contracts-flags

## Files

- `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx`
- `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts`
- `apps/web/client/src/locales/en/presentation.json`
- `apps/web/client/src/locales/th/presentation.json`
- shared helpers from `apps/web/shared/articleStoryboardVideo/`

## Test First

Write tests for:

- feature flag off shows the Video project option as locked/disabled with setup guidance
- feature flag on shows the option
- existing `editable` and `full-slide-image` modes behave unchanged
- article-video preview creates one shot per article page
- preview shows shot count, duration estimate, video model, audio strategy, voice mode, and warnings
- preview renders `accessDecision`, `audioEstimate`, per-page `warningCodes`, `nativeSpeechLineCount`, and `speakerSegmentCount`
- preview surfaces missing feature flags from `accessDecision.missingFeatureFlags`
- preview credit estimate separates reference generation, character reference processing, video generation, native video audio, TTS, audio merge, and render where available
- preview defaults to 5 seconds per page, `single_narrator`, and `separate_tts_voiceover`
- separate TTS shows voice model and per-speaker voice ID controls
- native video audio hides voice ID controls and shows capability/fallback messaging when unsupported
- missing voice ID blocks create-project action
- UVoice premium unavailable requires explicit fallback selection and does not silently switch provider/model
- unsupported voice mode, disabled native-audio prompt composer flag, unavailable required skills, missing provider access, and unsafe provider credential/signed URL metadata block handoff
- successful handoff opens Storyboard Review immediately and shows a return/backlink path
- character reference controls are visible before 3x3 generation
- preview copy says it creates a Storyboard Review Project and does not start paid video generation
- footer CTA switches to Storyboard Review Project creation in Article Video mode and does not show Presentation import/note actions as competing primary outputs
- workflow summary switches to Article Video-specific steps and badge when Article Video output is selected, avoiding legacy slide-import wording in the video path
- dialog title/description, topic placeholder, article editor hint, source summary, aspect ratio help, and output summary use Article Video wording when Article Video output is selected
- media/output setup section and output-mode selector use Article Video wording when Article Video output is selected, making the Storyboard Review video-project destination visible before project creation
- Article Video creation is blocked until a video shot plan has been prepared/refreshed from the current article, so the fallback single-article-shot state or stale pre-edit plan cannot be handed off accidentally
- legacy slide-image Advanced Media Options and global Visual & References controls are hidden in Article Video mode; Article Video uses per-shot prompt/reference controls instead
- legacy lower slide-output panels such as prompt plan, generated images, slot audio/video, skill input JSON, slide JSON, and Presentation import affordances are hidden in Article Video mode and replaced by an Article Video project summary
- Article Video summary includes a visible shot workbench after planning, with one card per shot, explicit guidance that individual image/video generation happens per task in Storyboard Review, and a per-shot action that opens Storyboard Review with only that shot selected
- draft auto-save preserves Article Video-specific settings such as audio strategy, voice mode/IDs, per-shot prompt overrides, scene references, and character references
- preview exposes per-shot 3x3 image reference prompt and per-shot video prompt before project creation
- editing one shot's video prompt affects only that shot's Storyboard Review task prompt

## Implementation Tasks

1. Extend the local output mode type with `article-storyboard-video`.
2. Gate the option by `presentationArticleStoryboardVideo`.
3. Keep all existing mode state isolated from article-video state.
4. Add preview state built from shared planning helpers.
5. Add model selector and audio strategy selector.
6. Add voice mode selector and per-speaker voice ID controls for separate TTS.
7. Add character reference attachment UI per shot/page.
8. Add 3x3 candidate summary and selected scene reference summary.
9. Add per-shot editable prompt review for the 3x3 image reference prompt and video prompt.
10. Add access/credit/blocking summary from stable `accessDecision` and `audioEstimate` contracts with per-category credit breakdown.
11. Add MVP default selections and explicit fallback UI for unavailable UVoice premium/native audio.
12. Add blocking UI for unsupported voice mode, disabled native-audio prompt composer, missing skills, missing provider access, and unsafe credential-bearing metadata.
13. Open Storyboard Review after successful handoff and expose a return/backlink path.
14. Make the sticky footer reflect the selected output mode so Article Video creation is not confused with Presentation Note or slide/video import actions.
15. Make the right-side workflow summary reflect the selected output mode instead of showing the legacy slide-first workflow in Article Video mode.
16. Hide slide-output format controls in Article Video mode and switch surrounding guidance copy away from slide/Presentation wording.
17. Relabel the media/output setup section and output-mode selector for Article Video mode so the destination reads as a Storyboard Review video project.
18. Relabel the planning skill section for Article Video mode and expose Prepare/Refresh video shot plan as the required step before project creation.
19. Mark the prepared plan stale when the article changes after planning, and block Storyboard Review project creation until the plan is refreshed.
20. Relabel the image model as reference-image generation in Article Video mode and hide legacy slide-image advanced/global reference panels.
21. Replace lower slide-output review panels with an Article Video project summary when Article Video output is selected.
22. Add a visible Article Video shot workbench to the main preview area so users can see each prepared shot and open Storyboard Review with only one shot selected when they want to generate/repair a single shot.
23. Persist and restore Article Video-specific draft state so prompt/reference/voice adjustments survive closing and reopening the Builder dialog.
24. Add localization keys in English and Thai.

## UI/UX Contract

### Target User / JTBD

- Role: content creator/marketer.
- Goal: convert article pages into a ready-to-review video project.
- Entry point: Presentation Builder article dialog.
- Success outcome: user understands what will be created, what costs credits later, and what settings will carry into Storyboard Review.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Article Builder dialog | `PresentationArticleGeneratorDialog.tsx` | new output mode and preview controls |
| Presentation locale | `en/presentation.json`, `th/presentation.json` | labels/errors/help copy |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Existing article dialog | `PresentationArticleGeneratorDialog.tsx` | mode state and preview surface | shared planning helpers |
| Future extracted preview component if needed | same directory | dense preview rendering | `ArticleStoryboardVideoPreview` |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | estimate/reference states show progress | component/browser test |
| empty | create disabled with page-required message | component test |
| error | blockers inline with remediation | component test |
| success | create Storyboard Review action enabled | component test |
| disabled/focus/hover | controls reachable and visible | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked controls, no overflow | screenshot/manual |
| tablet 768x1024 | summary plus shot list readable | screenshot/manual |
| desktop 1440x900 | dense preview, no excessive hero layout | screenshot/manual |
| small-mobile 360x800 | reference grid scrolls/collapses | screenshot/manual if risky |
| laptop 1024x768 | primary action remains visible | screenshot/manual if risky |
| wide-desktop 1280x800 | constrained readable lines | screenshot/manual if risky |

### Accessibility Acceptance

- Keyboard path reaches output mode, selectors, reference controls, and create button.
- Focus is visible.
- Icon-only repair/remove controls have names.
- Errors are tied to relevant controls.

### Copy Contract

- Tone: practical and reassuring.
- Primary languages: Thai and English.
- Required labels: Storyboard Review Project, Video prompt, Text on video, Voiceover, Character references, Scene references.
- Validation copy: missing voice ID, unsupported native audio, blocked references, missing pages.
- Fallback copy: UVoice premium unavailable, choose fallback explicitly; native audio unsupported, switch to separate TTS explicitly.
- Blocking copy: missing skill, unsupported voice mode, native audio composer disabled, provider access unavailable, and unsafe provider metadata detected.
- Technical field names such as `accessDecision`, `audioEstimate`, `warningCodes`, and `missingFeatureFlags` must not appear as raw user-facing labels.
- Localization fallback: English key must exist for every Thai key.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`.

## Acceptance

- Existing modes are unchanged.
- Preview blocks invalid handoff.
- Users can distinguish project creation from paid generation.
- Character references and selected scene references are visually separate.

## Verification

- `cd apps/web && pnpm test -- PresentationArticleGeneratorDialog`
- `cd apps/web && pnpm check`
- browser evidence for mobile/tablet/desktop preview

## Implementation Notes

- Added opt-in `article-storyboard-video` visual mode to `PresentationArticleGeneratorDialog`.
- Existing editable/full-slide image modes remain the default path unless the tenant flag and user selection enable Article Video.
- Clarified the Presentation Builder dialog description so users understand this entry point can create either normal Presentation output or an Article Video project for Storyboard Review.
- The Video project output option now remains visible but disabled when the tenant feature flag is off, with copy explaining that the feature flag must be enabled before selection.
- If a saved draft restores `article-storyboard-video` while the tenant flag is disabled, the dialog resets the mode back to `editable` and hides the Article Video preview branch.
- Builder preview shows video model, separate TTS/native audio choice, voice mode, voice IDs, shot count, estimated duration, and readiness blockers.
- Builder preview Article Video copy now uses `presentation.json` locale keys in both English and Thai for the mode, preview labels, voice/audio controls, reference picker labels/help text, create action, and success toast.
- Builder preview gates handoff on required prompt/script skills after the skill list is loaded.
- Builder preview/handoff uses route-aware Feature 127 required flags instead of only checking the base article-video flags.
- Builder preview exposes per-shot Scene references via `ImageSourcePicker`; user selections override auto-selected 3x3 references and can be reset to auto 3x3.
- Builder preview now exposes per-shot Character references via `ImageSourcePicker`; selected images are sent to shot planning as `characterReferenceImagesByPageId`.
- Builder preview now exposes per-shot editable Image reference prompt and Video prompt fields. Reset returns each field to the generated prompt for that shot.
- Builder prompt validation keeps manual edit state distinct from generated prompts; an edited prompt can be cleared during typing, but handoff is blocked until the user enters prompt text or resets the field.
- The handoff uses manual Video prompt edits only for the edited shot, avoiding a global prompt change that could break every generated video task at once.
- Article Video mode now relabels the media/output setup area and output selector as Article Video setup / output destination, making the video-project path explicit while preserving the existing Presentation mode labels.
- Article Video mode now hides the lower legacy slide-output review panels and shows a compact Article Video project summary instead, so users do not see slide JSON, slot audio/video generation, or Presentation import tools in the video-project path.
- Article Video mode now shows a main-preview shot workbench with one card per prepared shot, reference/prompt status, localized guidance that Shot 1 can be generated independently, and a per-shot action that creates/opens the Storyboard Review Project with only that shot selected.
- Article Video mode stores the exact article snapshot used by a newly prepared video shot plan on the client when the prepare API response omits `article`, so a fresh plan does not immediately become stale and disable the per-shot Storyboard Review actions.
- Article Video article source panel can now be collapsed and its text area can be resized vertically, giving users more working space for the shot workbench after the article has been reviewed.
- Article Video shot workbench now fills the available Builder workspace instead of capping the shot list at a small fixed height, reducing the large unused blank area below the shot cards.
- Article Video shot workbench now provides explicit reference-image actions: generate references for all shots, generate a missing reference for one shot, or repair an existing shot reference. These actions use the Article Video 3x3 reference prompt for that shot and write the result back as the shot's scene/start-frame reference before Storyboard Review handoff.
- Per-shot cards now show whether references are missing or ready. Opening a single Storyboard Review task is enabled only after the shot has at least one scene/start-frame reference, making the Builder-to-Review workflow concrete: prepare shot plan, generate/repair reference image, then open the shot to generate/repair video in Storyboard Review.
- Per-shot cards now show thumbnail previews of the selected reference/start-frame images and reuse the existing image preview modal, so users can inspect the generated reference before opening the Storyboard Review video task.
- Reference generation preserves existing ready references for other shots when generating only missing references, preventing a project-level repair/generate action from accidentally removing unrelated shot references.
- Reference repair now keeps the existing ready reference active while the replacement image is still processing. The shot card shows the pending/failed reference task and offers a refresh action, so users are not blocked by a provider task that has not returned a URL yet.
- Article Video draft auto-save now preserves audio strategy, voice mode/IDs, per-shot scene/character references, and image/video prompt overrides. The existing video prompt skill selection is also restored instead of being cleared on reopen.
- Article Video project creation now treats a prepared plan as stale when the article text changes after planning, with localized refresh guidance, so Storyboard Review handoff cannot use a pre-edit page split or prompts.
- Handoff action writes a Storyboard Review draft and opens `/storyboard-review?source=presentation-article-video`.
- Focused verification included `PresentationArticleGeneratorDialog.test.ts`.
