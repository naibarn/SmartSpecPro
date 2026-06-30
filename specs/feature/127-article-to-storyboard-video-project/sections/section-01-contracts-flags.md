# section-01-contracts-flags

## Goal

Create the shared foundation for Feature 127: tenant feature flags, shared contracts, validation, audio strategy resolution, and timing helpers. This section must be completed before UI, prompt, handoff, or audio integration work.

## Files

- `apps/web/shared/featureFlags.ts`
- relevant `apps/web/shared/__tests__/*featureFlag*.test.ts`
- `apps/web/shared/articleStoryboardVideo/contracts.ts`
- `apps/web/shared/articleStoryboardVideo/flags.ts`
- `apps/web/shared/articleStoryboardVideo/planning.ts`
- `apps/web/shared/articleStoryboardVideo/audio.ts`
- `apps/web/shared/articleStoryboardVideo/timing.ts`
- `apps/web/shared/articleStoryboardVideo/validation.ts`
- `apps/web/shared/articleStoryboardVideo/index.ts`
- new colocated tests under `apps/web/shared/articleStoryboardVideo/`

## Test First

Write tests before implementation for:

- all Feature 127 flags are allowed tenant feature flags and default off
- one shot plan is created per article page
- empty page list returns a blocked preview reason
- selected scene references require 1-5 items
- default timing uses 5 seconds per page before audio exists
- character references validate durable URL, consent, safety, and count limit
- character references do not count toward selected scene references
- changing character references stales candidate sheet and video prompt
- changing selected scene references stales only video prompt
- audio strategy defaults to `separate_tts_voiceover`
- audio strategy resolution returns stable `requested`, `resolved`, `reasonCode`, `message`, `nativeAudioAllowed`, `separateTtsAllowed`, and `fallbackOffered` fields
- `silent` remains an internal fallback/advanced state and is not a primary MVP Builder option
- native video audio blocks without native audio and Thai speech capability
- separate TTS blocks when any required speaker lacks voice model or voice ID
- two-speaker separate TTS requires two distinct voice IDs by default
- UVoice two-speaker mode resolves to `segment_then_merge`
- selected voice mode missing/unsupported blocks preview/handoff
- native video audio prompt composer flag disabled blocks native video audio handoff
- preview metadata rejects provider tokens, provider session references, and signed provider upload URLs

## Implementation Tasks

1. Add feature flags:
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
2. Create shared type contracts from `claude-spec.md`.
3. Implement pure shot-planning helpers that accept existing article page data and return `ArticleStoryboardVideoShotPlan[]`.
4. Implement overlay extraction from page title/key text.
5. Implement validation helpers and structured warning/blocking result objects.
6. Implement audio strategy resolution from requested strategy, model capability, voice config, flags, and language.
7. Implement audio-first duration estimation and mismatch helpers.
8. Implement MVP defaults: 5-second shot duration, `single_narrator`, `separate_tts_voiceover`, and lower-third/center-title overlay presets.
9. Implement access/credit validation contracts including stable `accessDecision`, `audioEstimate`, per-page `warningCodes`, skill availability, voice mode support, native prompt composer flag, and no credential-bearing metadata.
10. Export stable APIs from `index.ts`.

## Contracts

Public shared APIs should be pure and side-effect free. They must not call providers, mutate Storyboard Review drafts, or read UI state.

Important type boundary:

- `characterReferenceImages` are identity references.
- `selectedReferenceImages` are selected 3x3 scene frames.
- `accessDecision` must include `allowed`, `reasonCode`, `message`, `provider`, `videoModelId`, `voiceModelId`, `audioStrategy`, `nativeAudioAllowed`, `separateTtsAllowed`, and `missingFeatureFlags`.
- `audioEstimate` must include `audioStrategy`, `modelPreference`, `estimatedCharacters`, `estimatedNativeSpeechSeconds`, `estimatedTtsSegments`, `estimatedCredits`, and `notes`.
- Two-speaker dialogue uses distinct voice IDs by default; same-voice reuse is a future advanced mode and must not be accepted silently in MVP.

## Acceptance

- Feature flags are default-off and covered by tests.
- Pure helper tests pass.
- No Presentation Builder or Storyboard Review UI behavior changes in this section.
- No provider calls are introduced.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI. This section provides backend/shared state and validation contracts consumed by later UI sections.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| N/A | shared contracts only | no direct visible UI |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| N/A | shared helpers | validation/planning contracts | consumed by Builder and Storyboard Review sections |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| N/A | no direct UI in this section | covered by unit tests and later UI sections |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| N/A | no layout changes | not required for this section |

### Accessibility Acceptance

N/A. No controls are introduced in this section.

### Copy Contract

N/A. No user-facing copy is introduced in this section.

### Browser Evidence Required

N/A for this section. Browser evidence is required in section-02 and section-05.

## Verification

- `cd apps/web && pnpm test -- shared/articleStoryboardVideo`
- relevant feature flag tests
- `cd apps/web && pnpm check`

## Implementation Notes

- Added default-off Feature 127 tenant flags and admin flag grouping.
- Added shared contracts for access decisions, preview, warnings, shot plans, reference images, voice/audio config, timing, and credit breakdown.
- Added pure planning, validation, timing, and audio strategy resolution helpers.
- Added route-aware required feature flag helper so `missingFeatureFlags` covers reference frames, Seedance prompt, voice script, UVoice/ElevenLabs/native audio, native prompt composer, and character references when used.
- Focused verification included `section01.test.ts` and `articleStoryboardVideoFeatureFlags.test.ts`.
