# Section 01 — Safety Service and Skill

## Ownership

Own the dedicated episode-cover skill and shared safety service contract. Do
not change provider adapters or credit logic here.

## Targets

- `apps/web/skills/vertical-drama-episode-cover-safety-rewriter/`
- `apps/web/server/services/imagePromptSafetyService.ts`
- `apps/web/server/services/__tests__/imagePromptSafetyService.test.ts`

## TDD and acceptance

- Add failing tests for mode selection, skill loading, minimal rewrite,
  explicit block, outage behavior, safe-prompt hashes, and marker reuse.
- Implement the smallest mode/configuration extension compatible with existing
  standard and `vertical_drama_managed` behavior.
- Ensure bounded arrays/strings in metadata and no URL input to the skill.

## Risks

Do not weaken fail-closed behavior or let a client-controlled marker authorize
an unreviewed prompt. Preserve existing standard-mode behavior exactly.

## Result

Implemented the dedicated skill and `vertical_drama_cover` mode, including
bounded metadata, retry/fail-closed behavior, safe-prompt hashing, and exact
marker reuse checks. Focused service tests pass.
