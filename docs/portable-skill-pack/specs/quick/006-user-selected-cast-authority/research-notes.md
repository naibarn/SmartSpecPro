# Research Notes

## Discovery boundary

The SocratiCode MCP discovery layer was unavailable in this session, so the
relevant area was narrowed with targeted repository searches and line-range
reads. The worktree is heavily dirty; only owned paths listed in the plan may
be changed.

## Current data path

- `vertical_drama_episodes.storyboard.shots[].characterIds` and related
  `requiredCharacterRefs` are generated storyboard data and may include a
  character mentioned by the narrative.
- `startFramePlan.frames[].requiredCharacterRefs` is already the frame-level
  selected cast used by image generation and cast-position locking.
- `startFramePlan.frames[].characterLookAssignments` records explicit user look
  selections.
- `startFramePlan.frames[].screenCallerCharacterRefs` is the existing explicit
  caller identity channel.
- Start Frame rendering resolves scene character refs from the frame plan in
  `verticalDramaEpisodes.ts` and `verticalDramaStartFrameGeneration.ts`.
- Enhanced context currently derives `characterIds` from the normalized
  storyboard shot, while speaker candidates and verified positions use frame
  refs. This split lets a storyboard-only character enter the Enhanced agent
  context even when it is absent from the approved image.
- Legacy video prompt generation has a separate path in
  `verticalDramaEpisodes.ts`; it must consume the same resolved visual cast.

## Relevant existing helpers/tests

- `selectEnhancedSpeakerIdentityCandidates` and
  `resolveEnhancedSpeakerIdentity` already restrict Enhanced speaker identity
  resolution to frame/caller candidates when frame refs exist.
- `buildVerticalDramaVerifiedCastPositions` maps the approved frame lock to
  viewer-relative positions.
- Start Frame tests already cover required-character ordering and prompt
  construction, making them the natural place for mention-only regressions.
- Enhanced tests cover candidate selection, selected-look mapping, and bridge
  input metadata. Legacy router/service tests cover the prompt path and job
  wiring.

## Episode 262 evidence

- Shot 9 storyboard contains `character-5-look-workwear` plus the three selected
  casual-home characters.
- Shot 9 frame requires only the three selected characters and has no caller
  refs.
- Shot 9 dialogue speakers are selected characters; มยุรี has no line.
- Enhanced jobs for shot 9 failed without credits, while a three-character
  comparison shot succeeded. The mismatch is therefore a per-shot input
  consistency problem, not a requirement to add มยุรี to the frame.

## Risk boundary

The resolver must not silently assign an authored line to a different visible
person. Ignoring a narrative-only cast entry is safe; changing dialogue
identity is not. Existing ambiguity/unresolved-speaker guards remain intact,
but an extra non-speaking narrative character must not trigger a provider call
or a visual-cast block.
