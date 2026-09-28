# Section 01 — Data Contracts, Fingerprints & Backward-Compatible Schema Plumbing

## 1. Objective
Establish the foundational data contracts, TypeScript interfaces, backward-compatible Python JSON schema, fingerprint cache invalidation, and tRPC audio settings procedures for Feature 175.

## 2. Invariants
1. `nativeAudioEnabled` is strictly additive across `EnhancedSkillInput`, `VerticalDramaMotionPromptPack`, and router contexts.
2. `buildEnhancedInputFingerprint` MUST hash `nativeAudioEnabled` (`true` vs `false`) to prevent cached prompt reuse across audio mode switches.
3. `prompt-intent.schema.json` MUST accept `oneOf: [ { type: "object", ... }, { type: "string" }, { type: "null" } ]` ensuring existing skills and legacy generators remain 100% operational.
4. Database tables `vertical_drama_series_sound_bibles` and `vertical_drama_audio_qc_reports` inherit tenant isolation.

## 3. Files to Modify & Create
- [MODIFY] `apps/web/server/services/verticalDramaEnhancedVideoPrompt.ts`:
  - Add `nativeAudioEnabled?: boolean` to `EnhancedSkillInput`.
  - Include `nativeAudioEnabled: input.nativeAudioEnabled ?? false` in `buildEnhancedInputFingerprint`.
  - Forward `nativeAudioEnabled` in `buildEnhancedSkillInput`.
- [MODIFY] `apps/web/server/routers/verticalDramaEpisodes.ts`:
  - In `loadEnhancedShotContext`, pass `nativeAudioEnabled: pack.nativeAudioEnabled === true` into `buildEnhancedSkillInput`.
  - Add procedures: `getEpisodeAudioSettings`, `updateEpisodeAudioSettings`, `getShotAudioManifest`.
- [MODIFY] `apps/web/skills/generic-commercial-video-director/schemas/stages/prompt-intent.schema.json`:
  - Replace simple string with `oneOf` supporting structured `ShotAudioIntent`.
- [NEW] `apps/web/shared/verticalDramaSeries/audioContracts.ts`:
  - Export TypeScript types and Zod schemas for `ShotAudioIntent`, `AudioManifest`, `AudioQcReport`, and `SeriesSoundBible`.

## 4. Verification
- `npm test -- verticalDramaEnhancedVideoPrompt.test.ts`
- `uv run --project apps/web/skills/generic-commercial-video-director pytest`
