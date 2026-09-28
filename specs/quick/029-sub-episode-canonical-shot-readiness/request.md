# Request

Fix the disabled Sub-episode full-video assembly action that reports `9/10`
when the episode has nine canonical storyboard shots. Historical
`motionPromptPack.clips` can contain multiple legacy sub-shot records for one
parent shot, but readiness and assembly must operate on one selected completed
clip per canonical shot.

## Constraints

- Follow the approved design in
  `docs/portable-skill-pack/specs/2026-07-13-sub-episode-assembly-canonical-shot-readiness-design.md`.
- Do not hardcode nine; preserve variable shot-count support.
- Use one pure shared resolver for the client and server.
- Do not rewrite or delete historical JSONB clip records.
- Preserve unrelated dirty-worktree changes, especially existing edits in
  `VerticalDramaEpisodePage.tsx` and `verticalDramaEpisodes.ts`.
- Add regression coverage before implementation.

## Non-goals

- No database migration or production-data mutation.
- No changes to video generation, credit charging, ffmpeg rendering, native
  audio, subtitles, or dialogue generation.
