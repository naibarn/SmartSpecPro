# Research notes

## Current implementation

- `apps/web/shared/verticalDramaSeries/contracts.ts` already defines
  `screenCallerCharacterRefs` as portraits shown only inside a phone/video-call
  screen.
- `apps/web/server/services/verticalDramaEpisodePipeline.ts` derives speaker
  order from `episodePlanShotDrafts[].dialogue_lines`, preserves explicit scene
  and caller arrays, and passes both into start-frame planning.
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts` already emits
  `screen_caller_character_refs` and excludes screen callers from physical
  attachment manifests, but the instruction does not enforce one vertical
  screen per spoken caller for the whole shot.
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts` has
  per-shot dialogue inputs and start-frame reference images, but its current
  video prompt contract has no structured spoken-caller/virtual-screen fact.
- Existing tests cover caller role preservation and start-frame caller prompt
  wording, providing regression patterns to extend.

## Scope decision

Use a new pure shared module under
`apps/web/shared/verticalDramaSeries/` and thread its result through the two
prompt builders. This is smaller and safer than adding a database field, and it
keeps regeneration deterministic from current authoritative data.

## Verification constraints

- Run focused Vitest files for the new helper, start-frame generation, and video
  prompt generation.
- Run `git diff --check`.
- Treat any repository-wide TypeScript failures as baseline unless they are in
  changed files or directly caused by this task.
- SocratiCode MCP tools were not exposed in this session; shell discovery was
  used after the configured fallback rule.
