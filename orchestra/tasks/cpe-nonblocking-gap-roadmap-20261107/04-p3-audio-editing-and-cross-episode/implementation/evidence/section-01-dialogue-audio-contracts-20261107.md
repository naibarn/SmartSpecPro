# P3 Section 01 — Dialogue and Audio Contracts

## Implemented

- New dialogue/audio plans carry an optional source binding derived from the series ID, episode ID, persisted script and storyboard. Existing JSON plans without the binding remain readable and are classified as `unverified`.
- Assembly compares source-bound plans against the current episode snapshot. A stale optional audio plan contributes no TTS segments; current clip-authored dialogue can still supply captions, and video assembly proceeds.
- The assembly manifest records `current`, `stale`, `unverified` or `missing` source status. Stale source does not remove audio already baked into a generated video clip.
- Existing provider capability checks, selected audio strategy, voice bindings, speech delivery, shot timing and the separate-TTS visual-prompt boundary remain in place. Added regression coverage for narrator vs. audio strategy, explicit silence, dialogue-free clips, stale plans and legacy plans.

## Verification

- Profile: `package` (Vertical Drama dialogue planner, episode assembly resolver and router handoff).
- Baseline revision: `33f945eab3752b4b404018c43270e00e8ba19efc`.
- Verification time: 2026-11-07 09:17 UTC; available memory was 23 GiB and `/mnt/SmartSpecDev` had 1.5 TiB free when resource evidence was captured.
- Passed: `pnpm exec vitest run server/routers/__tests__/verticalDramaEpisodes.textOverlayPlan.test.ts -t 'continues video assembly with stale optional dialogue audio'` (1 test).
- Passed: `pnpm exec vitest run server/services/__tests__/verticalDramaEpisodeVideoAssembly.test.ts -t 'skips stale optional audio|keeps legacy audio plans|builds dialogueAudio.segments only'` (3 tests).
- Passed: `pnpm exec vitest run server/services/__tests__/verticalDramaDialogueAudio.test.ts` (34 tests).
- Passed: `git diff --check`.
- Not run: repository-wide TypeScript check, per repository memory constraints.

## Existing verification gaps observed

- Full `verticalDramaEpisodeVideoAssembly.test.ts`: 84 passed, 1 failed. The storage-capacity assertion hard-codes `/tmp`, while this host reports the selected mount as `/mnt/SmartSpecDev`.
- Full `verticalDramaEpisodes.textOverlayPlan.test.ts`: 18 passed, 1 failed. The `getEpisodeDetail` flag-off assertion expects 3 `db.select` calls but observes 4. This path is outside the dialogue/audio revision change.
