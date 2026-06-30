# Research: Feature 127 Article To Storyboard Video Project

## Research Decision

- Codebase research: yes. SmartSpecPro is an existing git repository and SocratiCode index is healthy.
- Web research: attempted for ElevenLabs Text to Dialogue, Seedance reference-image video prompting, and Veo/native-audio capabilities. The web tool did not return usable source snippets in this session, so the plan treats vendor support as capability metadata that must be verified against current provider configs at implementation time rather than hardcoded from memory.
- Testing research: yes. Existing Vitest-style tests are present for Presentation Builder, Storyboard Review workspace behavior, feature flags, and shared contracts.

## Codebase Findings

### Presentation Builder Entry Point

- Primary file: `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx`.
- Existing `SlideVisualMode` is currently `"editable" | "full-slide-image"`.
- Existing tests live at `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.test.ts`.
- The current builder already persists/restores draft state and has a full-slide image generation path. Feature 127 must add an opt-in output path without changing default existing modes.

### Storyboard Review Workspace

- Primary shared client logic: `apps/web/client/src/lib/storyboardReviewWorkspace.ts`.
- Tests: `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`.
- Existing draft shape includes:
  - `taskIds`, `selectedTaskIds`, `tasks`
  - `companionAudio` and `companionAudioUpdatedAt`
  - `voiceoverFullScript`
  - `videoSegmentState`
- Existing tasks use `storyboardContext.referenceImages`, `storyboardContext.referenceVideos`, and `storyboardContext.extraParams`.
- `applyStoryboardReviewVideoOptionsToDraft` already marks tasks stale when video model or audio strategy changes.
- Existing audio strategy conventions include `separate_tts_voiceover`, `native_video_audio`, `silent`, and `auto` in related planner state. Feature 127 should normalize its requested/resolved strategy into this existing vocabulary.

### Storyboard Review UI

- Primary page: `apps/web/client/src/pages/StoryboardReviewPage.tsx`.
- Batch review panel: `apps/web/client/src/components/media/StoryboardBatchReviewDialog.tsx`.
- Existing UI already shows video clips, audio tracks, reference frame controls, voiceover script editing, generation, regenerate, and final video/audio render actions.
- The plan should extend existing sections instead of introducing a second review workspace. The UI must separate Video prompt, Text overlay, Voiceover/audio, Scene reference images, and Character references.

### Media Studio / TTS / Audio

- Existing Media Studio page contains `StoryboardCompanionAudioCandidate` flow and audio preparation helpers.
- Existing Storyboard Review supports companion audio and can render final video with audio.
- UVoice-specific `voiceID` mapping is not a generic `voiceId` provider parameter. The plan must preserve selected `voiceId` in app metadata and map it back to provider `voiceID` when calling UVoice.
- Current Storyboard Review audio count appears capped in some UI flows. Feature 127 should treat a multi-segment UVoice dialogue as one logical voiceover track, represented either by a merged asset or a deterministic sequence that does not consume arbitrary extra user-facing audio slots.

### Seedance Prompt Skill

- Existing skill: `apps/web/skills/seedance-multishot-review/SKILL.md`.
- It is `llm-only`.
- It already supports uploaded product/character references conceptually and has guidance for preserving the same person from uploaded character reference images.
- It is currently framed around product review prompts; Feature 127 should provide a structured input adapter so article shot content maps into scene/storytelling context without weakening its output guardrails.

### Existing ElevenLabs Voiceover Skill

- Existing skill: `apps/web/skills/elevenlabs-product-voiceover-dialogue/SKILL.md`.
- It outputs plain-text voiceover/dialogue, not structured app metadata.
- Feature 127 should not reuse this skill directly as the article narrator contract. It should create `article-storytelling-voiceover-script` with structured output for per-shot script segments, speaker IDs, timing targets, and provider-neutral audio intent.

### Feature Flags

- Tenant feature flags live in `apps/web/shared/featureFlags.ts`.
- Feature flag tests live under `apps/web/shared/__tests__/`.
- Server-side gate helpers include `apps/web/server/middleware/requireFeatureFlag.ts` and `requireFeatureFlagExpress.ts`.
- Feature 127 should add flags defaulted off and test inclusion in the allowed/default flag contracts.

### Localization

- Presentation Builder copy is in `apps/web/client/src/locales/en/presentation.json` and `apps/web/client/src/locales/th/presentation.json`.
- Storyboard Review copy is in `apps/web/client/src/locales/en/media.json` and `apps/web/client/src/locales/th/media.json`.
- The user-facing conversation and product surface need Thai-friendly copy while still supporting English fallback.

## Architecture Implications

1. Keep feature-specific planning/conversion helpers outside the huge dialog where possible, for example `apps/web/shared/articleStoryboardVideo/`.
2. Store new metadata in `storyboardContext.extraParams` and existing draft fields unless a shared type extension is unavoidable.
3. Keep selected 3x3 scene reference frames separate from character reference images.
4. Avoid provider/model string matching. Use a model capability resolver for native audio, Thai speech, reference image limits, and TTS dialogue strategy.
5. Treat Storyboard Review as the canonical video workspace after handoff. Presentation notes may store references but must not become canonical video state.

## Testing Conventions

- TypeScript tests use Vitest-style `*.test.ts` colocated near shared helpers or component files.
- Existing targeted commands likely include `cd apps/web && pnpm test -- ...` for focused tests and `cd apps/web && pnpm check` for type checking.
- Browser-visible workflow changes should add component/browser tests where existing harnesses exist; at minimum the plan requires Playwright/manual evidence for mobile, tablet, and desktop viewports during implementation.

## Research Risks / Follow-Up Verification

- Provider capability details for Seedance, Veo 3.1, omni-style video models, ElevenLabs dialogue routes, and UVoice must be verified against current provider registry/config during implementation.
- Because current web lookup did not produce reliable source snippets here, implementation must rely on the app's own model registry and live provider contracts rather than hardcoded assumptions.
