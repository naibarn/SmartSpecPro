# Section 03 — Semantic Beats and Timing

## Ownership

Own Visual Beat Plan validation, motion-director skill contract, registry-only
selection, compiler event projection, TTS/caption timing and fallback behavior.

## Target files

- `apps/web/server/services/videoProjectMotionDirector.ts`
- `apps/web/server/services/videoProjectCompiler.ts`
- `apps/web/server/routers/videoProjects.ts`
- `apps/web/skills/video-project-motion-director/skill.md`
- `apps/web/skills/video-project-scene-plan/skill.md`
- `apps/web/shared/videoIntelligence/projectSchemas.ts`
- related service/router tests

## TDD expectations

Test intent-to-preset mapping, invalid output rejection, non-destructive candidate
application, absolute frame projection, continuous/event/restart policies and subtitle
alignment after TTS duration changes.

## Acceptance

The same narration segment receives an explainable registered visual system, its events
land on the intended cue frames, and invalid/low-confidence plans fall back safely.

## Risks

Do not make a raw LLM narration string the timing source. Do not slice continuous
particle/graph systems on every caption cue. Preserve current motion candidates and
scene template behavior.
