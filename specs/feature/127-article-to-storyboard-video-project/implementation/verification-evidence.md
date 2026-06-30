# Feature 127 Implementation Verification Evidence

## Date

2026-06-30

## Scope Verified

- Default-off tenant feature flags for Article to Storyboard Video.
- Presentation Builder opt-in mode that creates a Storyboard Review project instead of changing the existing Presentation image/document flow.
- One video shot per article page.
- 3x3 reference candidate contract with 1-5 selected scene references and separate character references.
- Seedance prompt input contract and article storytelling voiceover script skill.
- Storyboard Review handoff metadata for prompt, overlay, audio, references, voice, timing, source lineage, and duplicate prevention.
- Storyboard Review metadata panel for video prompt separation, text overlay edit, voice/audio summary, character references, scene references, and timing warnings.
- TTS/render helpers for UVoice `voiceID`, UVoice segment-and-merge dialogue, ElevenLabs dialogue strategy, native audio duplicate prevention, and V1/T1/A1 track separation.
- Storyboard Review handoff/review metadata now persists and restores audio resolution details needed downstream: requested/resolved audio strategy, audio reason code, native/separate allowance, and `ttsRenderStrategy`.
- Storyboard Review Voiceover/audio panel now supports recoverable voice configuration edits for voice model and per-speaker voice IDs, marking TTS audio stale without mutating video prompt or overlay metadata.
- Storyboard Review Voiceover/audio panel now displays requested vs resolved audio strategy plus native-video-audio and separate-TTS allowance, making fallback/blocking state visible after handoff.
- Builder preview character reference picker per article page/shot, persisted into shot plans and Storyboard Review handoff metadata separately from scene references.
- Builder preview selected scene reference picker per article page/shot with reset back to auto-selected 3x3 frames.
- Builder preview now supports shot-by-shot prompt review: each shot exposes an editable 3x3 image reference prompt and editable video prompt before handoff, so a user can correct one shot without changing every shot.
- Storyboard Review handoff now uses manual video prompt overrides as the actual `task.prompt` for that shot and persists both image reference prompt and video prompt metadata with `promptSource`.
- Storyboard Review metadata normalization and panel now surface the Builder-provided 3x3 image reference prompt, video prompt, optional manual override, and prompt source, so reviewers can inspect what was handed off after leaving Presentation Builder.
- Storyboard Review prompt metadata normalization preserves prompt line breaks instead of collapsing prompts to one line, keeping Builder-generated prompt sections readable for review/copying.
- Storyboard Review prompt metadata card now provides copy actions for the 3x3 image reference prompt and video prompt, and warns when the current task prompt has changed after the Builder handoff.
- Handoff now stores both generated base prompts and final prompts for image reference and video generation. When a Builder prompt was manually edited, Storyboard Review can show the generated original in an expandable reference block alongside the final prompt that was actually used.
- Storyboard Review prompt edits now update Article Video metadata with `currentVideoPrompt`, `currentPromptSource`, `currentPromptUpdatedAt`, and manual-only `reviewPromptEditedAt` without overwriting the Builder handoff prompt or generated base prompt, preserving full prompt lineage.
- Storyboard Review regenerated prompts and skill-generated prompt planning now also update Article Video current prompt metadata with the correct source and neutral `currentPromptUpdatedAt`, preventing bypass paths from leaving stale `currentVideoPrompt` metadata or a misleading manual-edit timestamp.
- Storyboard Review prompt drift warning now displays the current prompt source, current prompt update timestamp, and copy action for the current prompt, making Builder handoff vs latest Review prompt context visible in the UI.
- Storyboard Review duration changes now update Article Video current prompt metadata with `duration_adjusted`, preventing prompt-duration normalization from leaving stale current prompt lineage.
- Builder duplicate-prevention source identity now includes per-shot prompt inputs/overrides, so a corrected manual prompt can create a distinct Storyboard Review project instead of reopening an older draft with stale prompts.
- Builder prompt edit validation now treats manual override state separately from generated prompt state: users can clear a field while editing, but project creation is blocked until the edited prompt has text or is reset.
- Builder preview required-skill gate for `seedance-multishot-review` and `article-storytelling-voiceover-script` after skill list load.
- Builder preview and handoff now derive required Feature 127 flags from the selected route: reference frames, Seedance prompt, voice script, UVoice/ElevenLabs/native audio, native prompt composer, and character references when used.
- Builder mode isolation now resets a restored/persisted `article-storyboard-video` mode back to the normal editable flow when the tenant feature flag is disabled, preventing the opt-in path from leaking into existing Presentation behavior.
- Builder Article Video preview copy now uses paired English/Thai locale keys for mode labels, status labels, model/audio/voice controls, reference pickers, CTA text, and success toast instead of inline branch-specific copy.
- Builder handoff now uses a deterministic Article Storyboard source draft ID derived from deck/content/model/audio/voice/reference choices and checks the existing Storyboard Review draft before writing, so retrying the same handoff opens the existing project instead of silently creating duplicate tasks.
- Builder duplicate checks now read the existing Storyboard Review draft only for idempotency; new Article Video projects no longer inherit companion audio, render job, project link, or other state from an unrelated existing draft.
- Presentation Builder dialog description now clarifies that users can choose either a Presentation output or an Article Video project for Storyboard Review from the same article authoring entry point.
- Media & Output now always shows the Video project output choice; when `presentationArticleStoryboardVideo` is off, it is disabled/locked with setup guidance instead of being invisible.
- Presentation Builder footer now switches CTA by selected output mode: Article Video mode shows a primary Storyboard Review Project create action and hides Presentation import/note actions, reducing confusion with the legacy Presentation output path.
- Presentation Builder workflow summary now switches from the legacy slide-first 6-step flow to a focused Article Video flow: create article, review video shots, and create/open the Storyboard Review Project. The workflow badge also changes from slide output formats to Storyboard Review Project, and slide-specific guided banners are suppressed in Article Video mode.
- Presentation Builder header, topic placeholder, article editor label/hint, source summary label, output summary, and aspect-ratio help now switch to Article Video wording when Video project is selected. The legacy Preferred Slide Output selector is hidden in Article Video mode because the output is always a Storyboard Review Project.
- Article Video mode now requires a prepared video shot plan before Storyboard Review project creation. Workflow step 2 exposes Prepare/Refresh video shot plan, the planner section is relabeled for Article Video page planning, and create CTAs are blocked until the article has been split into page-level shot plans.
- Article Video mode now labels the image model as a reference-image model and hides legacy slide-image Advanced Media Options plus the global Visual & References panel. Per-shot prompt/reference controls remain in the Article Video preview, reducing confusion between slide-supporting images and Storyboard Review video references.
- Builder now stores the Article Video plan's article snapshot client-side when the prepare API omits `article`, preventing a just-prepared video shot plan from being marked stale before the user can open a per-shot Storyboard Review task.
- Builder Article Video source article panel now supports collapse/expand and vertical resize, increasing the available working area for shot cards while preserving access to article review/editing.
- Builder Article Video shot workbench now expands into available vertical space, removing the large blank lower workspace caused by the previous fixed-height shot list.
- Builder Article Video shot workbench now has explicit reference-image generation and repair actions at both project and per-shot levels. Per-shot reference generation uses that shot's Article Video 3x3 reference prompt and stores the generated image as the shot scene/start-frame reference before opening Storyboard Review.
- Builder per-shot open actions now communicate and enforce the real workflow: missing reference image blocks opening the shot, ready reference image enables opening the single Storyboard Review task where video generation/repair continues.
- Builder per-shot cards now show selected reference/start-frame thumbnails and open the existing image preview modal, so reference inspection and repair are available in the main workbench.
- Builder reference generation now replaces only the shot prompts that were actually regenerated, preserving existing ready references for other shots during project-level missing-reference generation.
- Builder reference repair now uses pending replacement behavior: an existing ready reference stays active while the new provider task is processing, and the shot card exposes processing/failed state plus a refresh action for the pending image task.

## Commands

```bash
cd apps/web && npm run test -- client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up focused run after prompt validation hardening:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 3 files / 20 tests.

Follow-up focused run after Storyboard Review prompt metadata display:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts
```

Result: passed, 1 file / 6 tests.

Follow-up focused run after preserving prompt line breaks:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts
```

Result: passed, 1 file / 6 tests.

Follow-up focused run after adding prompt copy/drift warning UI:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 2 files / 10 tests.

Follow-up focused run after generated-vs-final prompt traceability:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts
```

Result: passed, 2 files / 13 tests.

Follow-up focused run after current prompt edit metadata:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts
```

Result: passed, 1 file / 7 tests.

Follow-up focused run after regenerated/skill-generated current prompt metadata:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts client/src/lib/storyboardReviewWorkspace.test.ts
```

Result: passed, 2 files / 43 tests.

Follow-up focused run after current prompt UI context:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts client/src/lib/storyboardReviewWorkspace.test.ts
```

Result: passed, 2 files / 43 tests.

Follow-up focused run after duration-adjusted current prompt metadata:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts client/src/lib/storyboardReviewWorkspace.test.ts
```

Result: passed, 2 files / 43 tests.

Follow-up focused run after current prompt timestamp semantics:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section05.test.ts client/src/lib/storyboardReviewWorkspace.test.ts
```

Result: passed, 2 files / 43 tests.

Follow-up feature suite after current prompt timestamp semantics:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after Builder footer output-mode CTA isolation:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after Builder workflow output-mode isolation and slide-guided-banner suppression:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after Builder header/article/source-summary copy isolation:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after Article Video shot-plan preparation guard:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after hiding legacy slide-image controls in Article Video mode:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after replacing lower legacy slide-output panels with the Article Video project summary:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after Article Video setup/output selector relabeling:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after Article Video draft persistence for voice, prompts, and references:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after stale-plan guard for article edits after planning:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up focused run after schema-valid Article Video `videoSegmentPlan` handoff:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section04.test.ts
```

Result: passed, 1 file / 7 tests. The test now parses the handoff `videoSegmentPlan` with `VideoSegmentPlanSchema`.

Follow-up feature suite after schema-valid Article Video `videoSegmentPlan` handoff:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after adding the main-preview Article Video shot workbench:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after adding per-shot Storyboard Review open action:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after prepared Article Video plan article snapshot fix:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after collapsible/resizable Article Video source article panel:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after full-height Article Video shot workbench and reference-image generate/repair actions:

```bash
cd apps/web && npm run test -- shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after reference preservation fix and per-shot reference thumbnail preview:

```bash
cd apps/web && npm run test -- client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts
```

Result: passed, 7 files / 50 tests.

Follow-up feature suite after pending-reference repair handling:

```bash
cd apps/web && npm run test -- client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts shared/articleStoryboardVideo/__tests__/section01.test.ts shared/articleStoryboardVideo/__tests__/section03.test.ts shared/articleStoryboardVideo/__tests__/section04.test.ts shared/articleStoryboardVideo/__tests__/section05.test.ts shared/articleStoryboardVideo/__tests__/section06.test.ts shared/__tests__/articleStoryboardVideoFeatureFlags.test.ts
```

Result: passed, 7 files / 50 tests.

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/web/client/src/locales/en/presentation.json','utf8')); JSON.parse(require('fs').readFileSync('apps/web/client/src/locales/th/presentation.json','utf8'))"
```

Result: passed. Also re-run after Builder footer output-mode CTA isolation, Builder header/article/source-summary copy isolation, lower legacy panel isolation, Article Video setup/output selector relabeling, Article Video draft persistence, and stale-plan guard for article edits: passed.

```bash
cd apps/web && npm run check -- --pretty false
```

Result: blocked by pre-existing repository issue:

```text
server/test_db.ts(1,23): error TS2307: Cannot find module './db/index.js' or its corresponding type declarations.
```

No additional Feature 127 TypeScript errors were reported before this blocker.

## Browser Evidence

Not captured in this implementation pass. The Storyboard Review and Presentation Builder UI changes are behind default-off feature flags and covered by focused tests/shared contracts, but mobile/tablet/desktop browser screenshots remain a follow-up gate before release.

## Residual Risks

- Provider calls are represented by deterministic helper contracts; real UVoice/ElevenLabs/Seedance execution should be smoke-tested in an environment with provider credentials.
- Storyboard Review overlay UI uses the existing component's inline Thai/English copy style; Builder Article Video branch copy is now localized, but full Storyboard Review metadata-panel locale extraction can still be done later if the team wants central copy management there too.
- Typecheck cannot be marked green until the unrelated `server/test_db.ts` import issue is fixed.
