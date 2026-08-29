# Implementation usage and verification

## User flow

1. Enable tenant flag `verticalDramaSpecialEpisodes`.
2. Open a series Episodes tab and choose `สร้างตอนพิเศษ Tie-in` beside the unchanged normal
   `สร้างตอนย่อยใหม่` action.
3. Enter the idea, select 1–3 uploaded or Marketplace Capture images, optionally select
   approved series characters/speakers, choose duration, dialogue mode, and the independent
   image/video models.
4. Submit `สร้างตอนพิเศษและ Prompt`. The server creates a `SPECIAL NN` episode and queues
   `idea-to-video-prompt`; start-frame and video prompts appear in the shared storyboard
   surface when ready. Rendering remains explicit and uses the existing gates/credit UI.

## Focused proof

```text
npm --workspace apps/web test -- client/src/lib/specialTieInUi.test.ts server/services/__tests__/verticalDramaSpecialSkillAdapter.test.ts shared/verticalDramaSeries/__tests__/specialTieInContracts.test.ts
npm --workspace apps/web run build:unsafe
```

The first command passed 3 files / 8 tests in the final focused run. The second command
passed client and widget builds. `npm --workspace apps/web exec tsc --noEmit --pretty false`
was attempted with 6GB heap and hit Node OOM; no full typecheck pass is claimed.

The migration is intentionally a tracked additive SQL artifact and must be applied through
the normal release migration process. Browser/provider/R2/credit/deployment verification is
outside the local test run and is recorded as pending rather than inferred.
