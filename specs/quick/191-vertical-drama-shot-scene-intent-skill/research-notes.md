# Research Notes

- `apps/web/server/services/verticalDramaStoryboardGeneration.ts` already
  normalizes LLM character ids but intentionally does not infer scene membership
  from prose. It is the generation output boundary.
- `apps/web/server/services/verticalDramaEpisodePipeline.ts` builds the real
  storyboard, persists it, then projects it into `start_frame_render_plan`.
  The semantic pass belongs between generation and persistence.
- `apps/web/shared/verticalDramaSeries/characterPresence.ts` explicitly treats
  prose inference as unsafe and supports scene/caller partitioning only from
  explicit refs.
- Existing `spokenCallerVirtualScreen.ts`, `barrierMultiView`, and
  `supportingPresence.ts` provide reusable downstream contracts.
- Existing start-frame prompt construction already renders screen callers,
  barrier/separate-view facts, dialogue eye-line, and required physical refs.
- The worktree has unrelated dirty changes in all of these areas; patches must be
  additive and narrow.
- SocratiCode MCP was unavailable in this session; discovery used scoped `rg` and
  targeted source reads.
