# Research Notes

## Repository discovery

The SocratiCode MCP discovery tools were unavailable in this session, so the
implementation boundary was narrowed with targeted `rg` and line-range reads.

Relevant existing pieces:

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSceneLockRow.tsx`
  already renders a scene-lock row and edit dialog. The dialog currently edits
  lighting, spatial layout, staging axis, palette, and time-jump only; fixed
  elements, props, and wardrobe are read-only.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  renders `VerticalDramaLocationsBibleCard` and mounts `VerticalDramaSceneLockRow`
  inside each Location section. The shot grid currently shows only a compact
  scene-lock badge.
- `apps/web/server/routers/verticalDramaEpisodes.ts` exposes
  `planSceneVisualState` and `updateSceneVisualState`. The update mutation uses
  tenant/user/series/episode ownership checks, row locking, `expectedRevision`,
  and `upsertSceneVisualState` with `manualEdit: true`.
- `apps/web/shared/verticalDramaSeries/sceneContinuity.ts` defines
  `VdSceneVisualState` and renders the shared continuity lock. It currently has
  free-form fixed elements, spatial layout, wardrobe, props, palette, lighting,
  and review fields but no structured sleep-surface fact.
- `apps/web/shared/verticalDramaSeries/contracts.ts` stores scene states under
  `startFramePlan.sceneVisualStates` and frame-level stale metadata under
  `frames[].imageStaleReason` and `frames[].imageStaleAt`.
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts` carries scene
  states across plan projection and preserves existing approved image anchors.
  `imageStaleReason: "prompt_changed"` is the existing prompt-change reason.
- Existing tests cover state parsing/upsert, router mutation persistence and
  revision conflicts, the SceneLockRow, and StoryboardPanel scene badges.

## Important behavior findings

- Scene states are keyed by `locationKey` and share `memberShotNumbers`.
- `manualEdit` protects a state from ordinary AI re-planning.
- Existing prompt rendering emits the continuity lock, so adding a structured
  sleep-surface field in the shared renderer will reach all member shots.
- Updating only `sceneVisualStates[locationKey]` currently does not mark member
  frames stale; the router mutation must be extended transactionally.
- Existing images must remain linked when a prompt becomes stale.

## Risk boundary

The optional structured furniture field is persisted inside the existing JSON
episode plan, so no database migration is expected. The implementation must
preserve legacy state parsing and avoid broad changes to unrelated prompt or
episode pipeline behavior.
