# P1 Section 02 — Visual Canon and Frame Planning Evidence

- Verification profile: `quick`
- Base revision: `e158fc14d42bbdb644c5a52ca8abf50255bc6dbd`
- Verification time: `2026-11-07 07:41 UTC`
- Resource evidence: `free -h` reported 23 GiB available memory and 12 GiB free swap.
- Focused command: `pnpm test server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts server/services/__tests__/verticalDramaStartFrameGeneration.locationGrounding.test.ts server/services/__tests__/verticalDramaStartFrameGeneration.imagePromptModes.test.ts server/services/__tests__/verticalDramaSceneContinuityLock.test.ts server/services/__tests__/verticalDramaShotSceneIntent.test.ts server/services/__tests__/verticalDramaEpisodePipeline.locationRosterWiring.test.ts shared/verticalDramaSeries/__tests__/seriesLookLock.test.ts --reporter=dot`
- Outcome: 7 test files passed; 246 tests passed.
- Patch hygiene: `git diff --check` passed.

## Changes proved

- The existing tenant feature flags and effective series identity now supply the optional series look to bulk start-frame and video-motion prompt generation. Missing identity or unavailable flags omit the addition and preserve the existing prompt path.
- Prompt projections record the optional look revision and SHA-256 fingerprint. Existing approved character/location/start-frame references and explicit user edits remain higher priority in the prompt contracts.
- Scene-intent previews carry the SHA-256 revision of the storyboard source used by the optional preflight.
- Start-frame and video-prompt persistence compare the source JSONB snapshots before update. A stale generation preserves the newer saved data, emits an advisory warning, and returns normally.
- Existing role-scoped references and first/last-frame projection tests remain passing; existing start-frame-only mode is retained when an approved stop frame is absent.

## Limits

- No live provider request or browser E2E was run. These remain later acceptance evidence; no provider task was submitted.
- Repository-wide TypeScript typecheck was not run, per `AGENTS.md` shared-workspace resource policy.
