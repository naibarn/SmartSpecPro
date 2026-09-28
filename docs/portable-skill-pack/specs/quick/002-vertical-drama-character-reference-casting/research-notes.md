# Research Notes

## Existing UI and flow

- `VerticalDramaCharacterStockPanel.tsx` already exposes candidate counts `[1,2,3,4,5]`, prompt preview, batch submission, polling, retry and candidate selection.
- The reference disclosure already lists character assets and contains the casting generate section; this is the narrowest UI insertion point.
- `previewCharacterPrompt` currently routes candidate generation to `generateCharacterPortraitCandidates` and the existing Visual Bible skill.

## Existing server contracts

- `generatePortraitCandidateBatch` claims durable private candidate rows, reserves image credits, submits one independent image task per candidate, then polls/settles task results.
- `selectPortraitCandidate` currently assumes every candidate has a `visualBibleSnapshot` and writes it to `verticalDramaCharacters.data.visualBible`.
- `verticalDramaCharacterStockService` owns candidate metadata and all tenant/user/series/character checks.
- Candidate image submission currently sends `references: []` for Hermes and no reference image list for the normal media generation call; reference-guided mode must add a server-resolved reference path.

## Skill runtime

- `apps/web/skills/character-candidate-prompt/SKILL.md` defines the required input fields and plain-text output contract.
- The skill requires reference images and supports `image_count` 1–10, `lock_clothing`, `pose_mode`, and `camera_framing`; product scope caps generated candidates at 5.
- `productVideoMotionPromptSkillRunner.ts` demonstrates the repository pattern for loading an admin skill, resolving skill policy, building multimodal messages and executing model fallback.
- `skillExecutor` returns a placeholder for `llm-only`; therefore the adapter must use the shared LLM fallback service directly, while charging through the existing skill revenue settlement boundary or the established character prompt credit boundary without double charging.

## Dirty worktree / SocratiCode

- Worktree contains extensive unrelated modifications and untracked files from prior work. Only owned paths will be edited.
- SocratiCode MCP was unavailable in the current transport; shell-based targeted discovery was used and this fallback is recorded here.

## Risks

- Prompt-only candidates cannot safely overwrite Character DNA; snapshot must be optional and selection must preserve existing DNA when absent.
- Reference URLs must never be trusted from the browser; asset-link IDs and server-side resolution are required.
- Image model/provider capability may reject references; errors must leave the candidate batch recoverable and avoid duplicate billing.
