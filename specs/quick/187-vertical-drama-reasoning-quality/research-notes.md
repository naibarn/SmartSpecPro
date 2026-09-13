# Research Notes

## Discovery method

SocratiCode MCP tools were not available in this session, so discovery used targeted
`rg`, line-range reads, existing tests, and provider transport inspection. No source code
was changed during research.

## Current implementation evidence

### Existing reasoning helper

`apps/web/server/services/verticalDramaEpisodeGenerationSettings.ts:85-117`
currently returns:

- no parameters when the selected setting is not `mode: effort`;
- no parameters when the configured model id differs from the effective model;
- no parameters unless the enabled model row has `supportsThinking === true` and
  `providerName === openrouter`;
- otherwise `{ reasoning: { effort, exclude: true } }`.

This is a useful safety boundary but it is currently a caller convention rather than a
mandatory shared execution boundary.

### Transport behavior

`apps/web/server/services/verticalDramaStoryBible.ts:1759-1771` forwards
`extraBodyParams` into `executeWithFallback`.

`apps/web/server/services/llmRouter.ts:1063-1110` removes `reasoning` from generic
extra parameters and adds it back only for an OpenRouter candidate. The serialized body
is sent by `apps/web/server/services/llmRouter.ts:1187-1204`.

This means the current transport can safely carry OpenRouter reasoning, but only when a
caller supplies the extra body and only for paths that reach the supported chat/responses
branches.

### In-scope paths already wired

The following paths call the shared reasoning helper and pass its result:

- `verticalDramaScriptGeneration.ts:1917,1947`
- `verticalDramaStoryboardGeneration.ts:1103,1134`
- `verticalDramaStartFrameGeneration.ts:1562,1589,1638`
- `verticalDramaDialogueAudio.ts:1310,1326`
- `verticalDramaVideoMotionPromptGeneration.ts:1210,1298,1310`

### Gaps found

Representative paths that call LLM planning without the shared reasoning helper:

- Character Prompt Skill: `verticalDramaCharacterPromptSkill.ts:293-311`
- Character Visual Bible: `verticalDramaCharacterImageGeneration.ts:3326` and `3971`
- Special Tie-in: `verticalDramaSpecialSkillAdapter.ts:1539-1583`
- Clip dialogue regeneration: `verticalDramaVideoMotionPromptGeneration.ts:6093-6099`
- Character variant planner, episode quality review, location detector/image generation,
  series memory planning, shot image action, ad banner, and other auxiliary services
  also contain LLM call sites without the reasoning helper.

The source audit found 33 Vertical Drama JSON-planning caller files and only five actual
production callers using the helper (six matches including the helper file itself).

### Settings propagation

`verticalDramaEpisodes.ts:11992,12200,12335` copies series generation settings to new
episodes. `verticalDramaEpisodePipeline.ts` passes episode generation settings into the
five main episode stages. Several other service parameter types do not receive either
series or episode generation settings, which is why they cannot currently apply the
selected quality consistently.

### UI mismatch

`VerticalDramaSettingsTab.tsx:1078-1080` tells users the setting applies to every
LLM-driven step, but the caller audit shows that statement is currently false.

### Tests currently available

The focused run passed 3 files / 37 tests:

```text
server/services/llmRouter.test.ts
server/services/__tests__/verticalDramaEpisodeGenerationSettings.test.ts
shared/verticalDramaSeries/__tests__/generationSettings.test.ts
```

There is not yet a request-body assertion specifically proving that a reasoning object is
serialized for OpenRouter, nor a coverage test that every Vertical Drama LLM skill passes
through the common execution boundary.

## Provider documentation research

OpenRouter's current reasoning documentation states that the unified request field accepts
either `reasoning.effort` or `reasoning.max_tokens`, not both; model metadata can expose
`supported_efforts`, `default_effort`, `supports_max_tokens`, and `mandatory`; and
`exclude: true` keeps reasoning internal while omitting it from the response. It also
states that reasoning tokens are output tokens and are charged. Source:
https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

Design implication: the catalog must retain protocol/capability metadata and the adapter
must choose effort versus token budget per effective model. UI must not show raw options
that the selected model does not support.

## Risk-sensitive findings

- Do not add reasoning parameters after provider selection; the actual candidate must
  re-adapt the payload, including provider fallback candidates.
- Do not deduct credits before a valid provider result. A capability downgrade retry must
  remain within the existing bounded attempt and billing contract.
- Do not accept schema-valid story output without semantic continuity checks.
- Do not expose raw reasoning content in audit logs or user UI.
- The worktree is heavily dirty with unrelated changes; implementation must use focused
  paths and must not reset, stage, or rewrite unrelated files.
