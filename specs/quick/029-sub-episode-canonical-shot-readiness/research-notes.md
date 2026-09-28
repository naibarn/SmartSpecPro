# Research Notes

## Observed failure

- Production screenshot route: `/drama-series/6/episodes/41`.
- UI reports `9/10` and identifies shot 3 as missing, disabling full assembly.
- The page currently computes `totalClipCount` from
  `motionPromptPack.clips.length` and `readyClipNumbers` from raw completed clip
  records.
- `VerticalDramaStoryboardPanel` compares those raw counts for its label,
  warning, disabled state, and partial-assembly visibility.

## Runtime path

- Client calculation:
  `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`.
- Client presentation and gate:
  `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`.
- Server mutation:
  `apps/web/server/routers/verticalDramaEpisodes.ts`.
- Existing raw-clip precondition:
  `resolveClipsForAssembly` in
  `apps/web/server/services/verticalDramaEpisodeVideoAssembly.ts`.
- Shared client/server contracts live under
  `apps/web/shared/verticalDramaSeries/` and are importable through `@shared`.

## Historical-data cause

- Legacy speaker-aware splitting persisted multiple clips such as 301/302 for
  canonical shot 3.
- Commit `e6da3ebaa` changed prompt regeneration to collapse these records back
  to one clip, with tests proving stale splits are removed when a shot is
  regenerated.
- Episodes not regenerated after that change still retain the old records.
- Existing assembly code and frontend regression coverage still deliberately
  count every raw sub-shot, so the old data remains a live blocker.

## Boundaries

- Ownership and tenant boundaries remain inside `assembleEpisodeVideo`; the
  resolver receives only the already-owned episode snapshot and performs no IO.
- No new dependency, schema, route, permission, or billing surface is needed.
- SocratiCode discovery was attempted first but its MCP transport returned
  `Transport closed`; targeted `rg`, line-range reads, git history, and existing
  tests were used instead.

## Test environment

- Package: `apps/web` (`npm`).
- Focused runner: `npm test -- <vitest paths>` from `apps/web`.
- Type check: `npm run check` from `apps/web`.
