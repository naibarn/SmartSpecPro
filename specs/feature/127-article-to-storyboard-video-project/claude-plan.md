# Implementation Plan: Feature 127 Article To Storyboard Video Project

## 1. Purpose And Product Shape

Feature 127 adds an opt-in output path in Presentation Builder:

```text
article pages -> article storyboard video shot plan -> Storyboard Review project
```

The generated videos become the moving visual layer. Article page title/key text becomes editable CSS overlay metadata above the video. Storyboard Review owns video generation, review, repair, replacement, companion audio, and final render after handoff.

This feature must not alter existing `editable` or `full-slide-image` Presentation behavior.

## 2. Architecture Overview

Implement the feature as a thin Presentation Builder orchestration layer plus reusable shared helpers:

- `PresentationArticleGeneratorDialog.tsx` owns UI entry, preview state, user choices, and handoff action.
- `apps/web/shared/articleStoryboardVideo/` owns pure planning, normalization, validation, timing, model capability resolution, and handoff mapping.
- `apps/web/skills/article-storytelling-voiceover-script/SKILL.md` owns article-to-spoken-story script generation.
- Existing `apps/web/skills/seedance-multishot-review/SKILL.md` owns visual/video prompt writing, via an adapter that passes page content, selected scene references, character references, and audio-policy instructions.
- Storyboard Review state uses existing `StoryboardReviewDraft`, `StoryboardGenerationTask`, `storyboardContext.referenceImages`, `storyboardContext.extraParams`, `companionAudio`, `voiceoverFullScript`, and `videoSegmentState` patterns.

Prefer JSON metadata in existing review/task shapes before adding DB migrations. Add a migration only if implementation proves current Storyboard Review persistence cannot round-trip required metadata.

## 3. Feature Flags And Rollout

Add tenant flags defaulted off:

- `presentationArticleStoryboardVideo`
- `presentationArticleStoryboardVideoPreview`
- `presentationArticleStoryboardVideoOverlay`
- `presentationArticleStoryboardVideoReferenceFrames`
- `presentationArticleStoryboardVideoCharacterReferences`
- `presentationArticleStoryboardVideoSeedancePrompt`
- `presentationArticleStoryboardVideoVoiceScript`
- `presentationArticleStoryboardVideoUvoiceVoiceover`
- `presentationArticleStoryboardVideoElevenLabsDialogue`
- `presentationArticleStoryboardVideoNativeAudio`
- `presentationArticleStoryboardVideoNativeAudioPromptComposer`

Update:

- `apps/web/shared/featureFlags.ts`
- feature flag tests under `apps/web/shared/__tests__/`
- tenant/admin grouping only if existing feature flag admin UI needs explicit labels.

Rollout order:

1. Hidden developer flag.
2. Allowlisted tenants.
3. Builder preview without paid generation.
4. Storyboard Review handoff.
5. 3x3 references and character references.
6. Prompt/script skills.
7. Separate TTS.
8. Native video audio.
9. Overlay edit/final render integration.

## 4. Shared Domain Model

Create a shared module:

```text
apps/web/shared/articleStoryboardVideo/
  contracts.ts
  flags.ts
  planning.ts
  references.ts
  audio.ts
  timing.ts
  handoff.ts
  validation.ts
  index.ts
```

The shared contracts should define field-only TypeScript types for:

- `ArticleStoryboardVideoShotPlan`
- `ArticleStoryboardReferenceCandidateSheet`
- `ArticleStoryboardCharacterReferenceImage`
- `ArticleStoryboardReferenceImage`
- `ArticleStoryboardTextOverlay`
- `ArticleStoryboardVoiceoverPlan`
- `ArticleStoryboardVoiceSpeaker`
- `ArticleStoryboardVoiceScriptSegment`
- `ArticleStoryboardNativeVideoAudioPlan`
- `ArticleStoryboardModelSelection`
- `ArticleStoryboardAudioStrategyResolution`
- `ArticleStoryboardVideoPreview`
- `ArticleStoryboardVideoHandoff`
- `ArticleStoryboardTaskExtraParams`

Validation rules:

- one shot per page
- selected scene references count is 1-5
- character references count is within configured limit, recommended 1-3
- character references have durable app-managed URLs
- blocked/inaccessible/unsafe/unconfirmed character references block 3x3 generation and prompt generation
- separate TTS requires voice model and concrete voice ID for each speaker
- native video audio requires model capability support for native audio and requested spoken language
- overlay text normalizes safely and respects max recommended length

## 4.1 MVP Product Decision Contract

Implement these MVP decisions from the source spec so implementation does not reopen settled choices:

1. Default shot duration starts at 5 seconds per article page, then stretches or warns based on script/audio duration.
2. MVP overlay presets are `lower_third` and `center_title`; `top_caption` may ship only if safe-area evidence passes, and `side_panel` is deferred until responsive evidence is strong.
3. Overlay style should inherit tenant/brand theme when available, otherwise use safe default presets.
4. Storyboard Review should include basic overlay preview/edit in MVP when existing overlay surfaces can support it; otherwise metadata preservation plus downstream composite remains the fallback.
5. Reference frame selection should auto-select 1-5 frames first, then allow user adjustment in advanced/expanded controls.
6. Successful handoff should open Storyboard Review immediately and show a toast/backlink to return to Presentation Builder.
7. If UVoice premium is unavailable in first rollout, warn and require explicit fallback selection; never silently switch TTS provider/model.
8. Project creation may happen with estimated timing before TTS is generated, but Storyboard Review must recompute timing after measured audio exists.
9. Default voice mode is `single_narrator`; users can switch to `two_speaker_dialogue` in preview.
10. Two-speaker dialogue requires two distinct voice IDs by default; same-voice reuse is a future advanced option.
11. Default audio strategy is `separate_tts_voiceover`; native video audio is available only when model capability explicitly supports the requested language.

## 5. Presentation Builder UI

Extend `PresentationArticleGeneratorDialog.tsx` without making it responsible for all business logic.

### UI Controls

Add an opt-in output selector value:

- `article-storyboard-video`

Add preview controls:

- video model selector
- audio strategy selector: separate TTS voiceover, native video audio
- voice mode selector: single narrator, two-speaker dialogue
- voice model selector when separate TTS is selected
- per-speaker voice ID selector when separate TTS is selected
- character reference attachment per shot/page
- 3x3 candidate generation/repair controls
- selected 1-5 scene reference frame controls
- default selections: 5-second shot duration, `single_narrator`, `separate_tts_voiceover`, lower-third/center-title overlay preset, and auto-selected scene references

### Preview Layout

The preview must answer:

1. `N video shots in Storyboard Review`
2. which overlay text appears per shot
3. selected video/audio/voice settings
4. selected character references versus selected 3x3 scene references
5. estimated duration, audio estimate, and credit/access warnings
6. that project creation is separate from paid video/TTS generation
7. what happens after handoff: Storyboard Review opens immediately with a return/backlink path

### UI/UX Contract

Target user / JTBD:

- Role: content creator or marketer using Presentation Builder.
- Goal: convert an article into a reviewable video project quickly.
- Entry point: Presentation Builder article dialog.
- Success outcome: user opens Storyboard Review with ordered video shots, prompts, overlay, references, and audio settings ready.

Surface inventory:

| Surface | File/route | Change |
|---|---|---|
| Article Builder dialog | `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx` | output mode, preview, model/audio/voice/reference controls |
| Presentation locale | `apps/web/client/src/locales/en/presentation.json`, `th/presentation.json` | labels, validation, help copy |
| Storyboard Review page/panel | `StoryboardReviewPage.tsx`, `StoryboardBatchReviewDialog.tsx` | restore/display metadata, overlay/reference/audio separation |
| Media locale | `apps/web/client/src/locales/en/media.json`, `th/media.json` | Storyboard Review labels |

State matrix:

| State | Expected UI |
|---|---|
| loading | shot/credit/model estimates show skeleton or concise progress |
| empty | no article pages disables handoff and explains pages are required |
| error | access, voice ID, reference, skill, and credit blockers show inline messages |
| success | preview shows ordered shots and enabled create-project action |
| disabled | paid generation buttons remain disabled until explicit Storyboard Review action |
| focus/hover/selected | model, audio, reference, and 3x3 frame controls are keyboard reachable and visibly focused |

Responsive matrix:

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | stacked sections, no horizontal overflow, primary action visible after summary |
| tablet 768x1024 | two-column summary/details when space allows |
| desktop 1440x900 | compact dense layout, page list and details visible without excessive scrolling |
| small-mobile 360x800 | reference grid may collapse to scrollable row; text must not overlap |
| laptop 1024x768 | preview remains usable with compressed controls |
| wide-desktop 1280x800 | avoid overly wide text lines; keep page list scannable |

Accessibility acceptance:

- All controls have labels and keyboard focus.
- Icon-only repair/select/remove controls have accessible names.
- Selected frame and character reference states are announced via text/ARIA.
- Validation errors identify the field and remediation.
- Reduced-motion users do not get distracting animated previews.

Copy contract:

- Thai and English labels must be clear to non-technical users.
- Avoid exposing internal words as primary labels when simpler copy works.
- Required conceptual labels: `Video prompt`, `Text on video`, `Voiceover`, `Character references`, `Scene references`, `Storyboard Review Project`.
- Required fallback copy: UVoice premium unavailable, choose a fallback voice model explicitly; native audio unsupported, switch to separate TTS explicitly.

Browser evidence required:

- mobile, tablet, desktop screenshots or Playwright evidence
- no new console errors
- no overflow/overlap in preview and Storyboard Review metadata sections
- keyboard path through output mode, model/audio controls, reference selection, and create-project action

## 6. Reference Candidate Flow

Create pure helpers in `references.ts`:

- create empty candidate sheet
- attach/remove character references
- validate character references
- generate candidate prompt input
- split/store 3x3 sheet frames once provider output exists
- auto-select 1-5 scene frames
- allow user adjustment after auto-selection in an advanced/expanded control
- mark candidate/prompt stale when character references change
- mark prompt stale when selected scene references change

Important separation:

- `characterReferenceImages`: identity/style source references.
- `selectedReferenceImages`: selected scene/composition frames from 3x3.

Character references must not be placed in the selected 1-5 scene-frame count, but both reference groups are passed to prompt generation with distinct roles.

## 7. Prompt And Script Skills

### Seedance Prompt Adapter

Add a prompt adapter that calls `seedance-multishot-review` with:

- article page summary and visual intent
- selected scene references
- character references
- audio policy
- overlay exclusion instruction
- model family/capability notes

Audio policy:

- `separate_tts_voiceover`: prompt must be visual-only/silent/no speech/no lip-sync.
- `native_video_audio`: prompt may include spoken lines only when capability resolution allows native audio and Thai speech.

### Article Storytelling Skill

Create `apps/web/skills/article-storytelling-voiceover-script/SKILL.md`.

The skill must:

- rewrite article page text into spoken storytelling
- support `single_narrator` and `two_speaker_dialogue`
- output structured script segments mapped to page/shot IDs
- avoid video directions, CSS overlay copy, fabricated claims, and meta commentary
- include target duration guidance
- support Thai first, with locale-aware fallback.

Output should be structured enough for app parsing. Do not copy the existing ElevenLabs product skill verbatim because its plain-text product-dialogue contract is not sufficient for shot-level metadata.

## 8. Audio Strategy And Timing

Implement `audio.ts` and `timing.ts`.

### Strategy Resolution

Inputs:

- requested audio strategy
- selected video model capability
- selected voice model capability
- spoken language
- feature flags
- voice mode and speaker voice IDs

Output:

- requested strategy
- resolved strategy
- `reasonCode`/`message`
- `nativeAudioAllowed`
- `separateTtsAllowed`
- `fallbackOffered`

Never silently downgrade native video audio to separate TTS.
`silent` remains an internal fallback/advanced state for legacy or explicitly muted projects and must not be presented as a primary MVP choice in Builder preview.

### Separate TTS

Rules:

- single narrator requires one speaker voice ID
- two-speaker dialogue requires two speaker slots with two distinct concrete voice IDs by default
- UVoice stores `voiceId` in app metadata and sends provider param `voiceID`
- UVoice two-speaker mode uses `segment_then_merge`
- ElevenLabs dialogue-capable route may use `single_request_dialogue`
- generated audio attaches to Storyboard Review companion audio as one logical voiceover track
- if UVoice premium is unavailable in first rollout, block automatic provider switching and require explicit fallback selection

### Timing

Use audio-first planning:

1. Estimate script duration before TTS.
2. Allocate per-shot target durations.
3. After audio is generated, measure actual durations.
4. If mismatch exceeds tolerance, mark timing warning and offer repair actions.
5. Allow Storyboard Review project creation with estimated timing before TTS exists, then recompute timing after measured TTS/native speech duration is available.

## 9. Storyboard Review Handoff

Create `handoff.ts` to map `ArticleStoryboardVideoHandoff` into Storyboard Review draft/task data.

For every article page:

- create one `StoryboardGenerationTask`
- `type = "video"`
- `prompt` contains video prompt only, plus native speech lines only when native video audio is selected
- `model` and `storyboardContext.model` use selected video model
- `durationSeconds` and `storyboardContext.duration` use planned timing
- `storyboardContext.referenceImages` stores selected scene references
- static slide image fallback metadata is stored only as fallback/reference data when present, not as the primary video output
- `storyboardContext.extraParams` stores source, shot, overlay, audio strategy, requested/resolved strategy, voice config, character reference IDs/metadata, selected reference IDs, script metadata, prompt/source metadata, and timing
- `videoSegmentState.videoSegmentPlan` stores selected video model and audio strategy
- draft-level `voiceoverFullScript` can store full script summary, but per-shot segments remain in task metadata
- `companionAudio` stores generated separate audio only after audio generation exists
- existing `companionAudio`, `companionAudioUpdatedAt`, and `voiceoverFullScript` conventions must be preserved when loading or migrating old Storyboard Review projects
- migration/normalization must not rewrite existing generated video or audio assets unless the user explicitly regenerates them
- successful handoff opens the created Storyboard Review project immediately and surfaces a return/backlink path to Presentation Builder

Prevent duplicate creation with source draft ID + source mode metadata and an idempotency key where existing storage/API supports it.

Presentation Note relationship:

- optional Slide/Presentation Note writes may store source page text, narration text, video prompt, overlay text/style, and Storyboard Review task ID
- Presentation Note must remain secondary and must not become canonical video state
- Storyboard Review remains the source of truth for video review metadata after handoff

## 10. Storyboard Review UI Extensions

Extend existing UI sections rather than creating a new review page.

Required display/edit areas:

- Video prompt
- Text on video / overlay
- Voiceover/audio
- Character references
- Scene references
- Model/audio strategy summary
- Timing warnings

Overlay editor:

- Store and edit CSS metadata.
- Never write overlay text into `task.prompt`.
- Warn when prompt-like text appears in overlay fields.

Reference UI:

- Existing start/end frame controls can remain for video generation.
- Add display for selected 3x3 scene references.
- Add separate display for character references.

Audio UI:

- Restore voice mode, voice model, and per-speaker voice IDs.
- Missing voice IDs should show recoverable config error, not failed video task.

## 11. Access, Credits, And Blocking Rules

Preview/handoff blocks when:

- feature flag is off
- required skills unavailable
- selected video model inaccessible
- separate TTS voice model inaccessible
- selected scene reference count outside 1-5
- character reference count exceeds limit
- character references are blocked, unsafe, inaccessible, or lack required confirmation
- selected voice mode is missing or unsupported
- separate TTS is missing voice model or voice ID
- native video audio unsupported by selected model/language/flag
- native video audio is selected but the native audio prompt composer feature flag is disabled
- credit estimate cannot be produced for paid provider path
- UVoice premium is requested for separate TTS but unavailable and no explicit fallback has been selected
- required page/shot data missing
- overlay text cannot be normalized safely
- provider OAuth tokens, provider session references, signed provider upload URLs, or other credentials would be exposed in preview or persisted metadata

Credit estimate must separate:

- reference generation
- character reference processing
- video generation
- native video audio
- TTS
- audio merge
- render

Preview contract fields must remain stable for UI and tests:

- `accessDecision.allowed`, `accessDecision.reasonCode`, `accessDecision.message`, `accessDecision.provider`, `accessDecision.videoModelId`, `accessDecision.voiceModelId`, `accessDecision.audioStrategy`, `accessDecision.nativeAudioAllowed`, `accessDecision.separateTtsAllowed`, and `accessDecision.missingFeatureFlags`
- `audioEstimate.audioStrategy`, `audioEstimate.modelPreference`, `audioEstimate.estimatedCharacters`, `audioEstimate.estimatedNativeSpeechSeconds`, `audioEstimate.estimatedTtsSegments`, `audioEstimate.estimatedCredits`, and `audioEstimate.notes`
- per-page `warningCodes`, `nativeSpeechLineCount`, and `speakerSegmentCount`

Compatibility rules:

- old Presentation drafts without article-video state load normally
- old Storyboard Review projects without Feature 127 metadata load with defaults and recoverable warnings
- old separate-TTS drafts with missing voice IDs remain viewable and keep existing generated audio, but block new TTS generation until the user selects valid voice IDs

## 12. Localization

Add Thai and English copy for:

- output option and description
- preview headings
- model/audio/voice labels
- character reference labels
- scene reference labels
- 3x3 generation/repair states
- audio strategy fallback messages
- missing voice ID errors
- provider dialogue strategy explanation
- Storyboard Review metadata sections

Thai copy should be user-friendly and not overly technical.

## 13. Implementation Waves

### Wave 1: Contracts, Flags, And Pure Planning

Files:

- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/__tests__/*featureFlag*.test.ts`
- `apps/web/shared/articleStoryboardVideo/*`

Deliver:

- feature flags default off
- contracts and validators
- page-to-shot planning
- overlay extraction
- audio strategy resolver
- timing estimator
- unit tests

### Wave 2: Builder Preview UI

Files:

- `PresentationArticleGeneratorDialog.tsx`
- `PresentationArticleGeneratorDialog.test.ts`
- `apps/web/client/src/locales/en/presentation.json`
- `apps/web/client/src/locales/th/presentation.json`

Deliver:

- new output mode
- preview model/audio/voice/reference controls
- blocking and warning states
- existing modes unchanged
- UI tests for mode isolation and validation

### Wave 3: References And Prompt/Script Preparation

Files:

- `apps/web/shared/articleStoryboardVideo/references.ts`
- `apps/web/shared/articleStoryboardVideo/prompting.ts`
- `apps/web/skills/article-storytelling-voiceover-script/SKILL.md`
- skill tests/fixtures if the repo has skill test conventions

Deliver:

- character reference attach/validate/stale flow
- 3x3 candidate state and repair flow
- Seedance prompt adapter
- structured article storytelling skill
- tests for prompt audio policy and reference separation

### Wave 4: Storyboard Review Handoff

Files:

- `apps/web/shared/articleStoryboardVideo/handoff.ts`
- `apps/web/client/src/lib/storyboardReviewWorkspace.ts`
- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
- relevant Storyboard Review create/open integration points

Deliver:

- Storyboard Review draft/task creation from shot plans
- metadata persistence and restoration
- videoSegmentState mapping
- duplicate creation guard
- tests for 5-page article -> 5 tasks

### Wave 5: Storyboard Review UI And Overlay/Audio Display

Files:

- `StoryboardReviewPage.tsx`
- `StoryboardBatchReviewDialog.tsx`
- `apps/web/client/src/locales/en/media.json`
- `apps/web/client/src/locales/th/media.json`
- relevant UI tests

Deliver:

- separate sections for prompt, overlay, audio, character references, scene references
- overlay edit support
- missing voice ID recovery state
- timing warnings
- browser evidence

### Wave 6: TTS, Native Audio, And Final Render Integration

Files:

- Media Studio TTS integration points
- Storyboard Review audio helpers
- render/final composite handoff paths
- tests for companion audio and render metadata

Deliver:

- UVoice single and two-speaker handling
- ElevenLabs dialogue-capable strategy hook
- native video audio capability gating
- audio-first measured duration update
- final render avoids duplicate voiceover

## 14. Testing Strategy

Unit tests:

- planning creates one shot per page
- existing modes ignore article-video state
- reference count validation
- character reference validation and stale rules
- audio strategy resolution
- voice ID validation
- UVoice segment strategy
- handoff task mapping
- prompt excludes overlay text
- native audio prompt includes speech only when allowed

Integration tests:

- feature flags default off
- Builder preview stores selected model/audio/voice config
- Storyboard Review restores metadata
- changing voice ID stales only TTS audio
- changing character references stales candidate sheet and prompt
- duplicate handoff prevention

Browser tests/evidence:

- option locked/off and enabled/on
- preview on mobile/tablet/desktop
- attach character reference before 3x3
- select 1-5 scene references
- missing voice ID blocks handoff
- Storyboard Review shows distinct sections
- overlay edit persists and does not alter prompt

Commands:

- `cd apps/web && pnpm check`
- focused Vitest commands for changed test files
- focused Playwright/screenshot workflow where available

## 15. Failure Modes

- Provider capability mismatch: resolve via metadata, block unsupported native audio, offer explicit fallback.
- Character identity drift: keep character references separate and pass them into both 3x3 and video prompt generation.
- Prompt/overlay confusion: separate UI labels and never store overlay text in `prompt`.
- TTS duration mismatch: audio-first estimate, measured update, warning/repair.
- UVoice dialogue ordering issue: deterministic `sequenceIndex`, measured durations, and merge/sequence tests.
- Duplicate project creation: source metadata and idempotency key.
- Credit surprise: preview estimate before paid generation.
- Legacy drafts: recoverable warnings, no metadata migration that rewrites assets.

## 16. Definition Of Done

- New output path is feature flagged and opt-in.
- Existing Presentation Builder modes behave unchanged.
- Builder creates a valid Storyboard Review project with one ordered video task per page.
- Each task preserves prompt, overlay, audio strategy, model, voice IDs when needed, references, source lineage, and timing.
- Character references are supported before 3x3 generation and remain separate from selected scene references.
- Prompt and script skill integration follows audio strategy policy.
- Storyboard Review restores metadata and renders clear UI sections.
- Separate TTS and native video audio paths are capability-gated.
- Access/credit preview blocks unsafe or incomplete handoff.
- Unit/integration/browser verification passes or skipped checks are documented with residual risk.

## 17. Plan Self-Review

Round 1 result:

- Structural integrity: pass. Every major component has an owning module/file.
- Completeness vs spec: fix required. The first pass covered the core feature but did not make all Recommended MVP answers from the source spec explicit enough for implementers.
- Implementability: pass. Waves are ordered by dependency and testable increments.
- Internal consistency: pass. Terms use `character references` for identity and `scene references` for selected 3x3 frames.
- Edge cases: pass. Provider capability, duration mismatch, duplicate handoff, voice ID gaps, and legacy drafts are covered.

Round 2 result:

- Added the MVP Product Decision Contract to lock default duration, overlay presets, tenant/brand theme fallback, overlay edit fallback, reference auto-selection plus adjustment, immediate Storyboard Review open, explicit TTS fallback selection, estimated-then-measured timing, default single narrator, distinct dialogue voice IDs, and default separate TTS.
- Propagated those decisions into `claude-spec.md`, `claude-plan-tdd.md`, and all affected section files.
- Re-ran section and UI contract validators successfully.

No material findings remain after Round 2.
