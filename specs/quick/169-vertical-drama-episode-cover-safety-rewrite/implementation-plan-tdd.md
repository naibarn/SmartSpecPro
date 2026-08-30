# TDD Guidance

## Tests first

1. Add service tests proving cover mode loads the dedicated skill, keeps low-risk
   prompts unchanged, applies a returned safe prompt, blocks explicit output,
   fails closed on medium/high-risk malformed output, and records hashes.
2. Add hash-marker tests proving normal media reuses a matching prepared result
   and reruns safety for mismatched/tampered prompts.
3. Add cover router/service tests proving preparation occurs before credit
   reservation, the safe prompt is stored, Hermes and normal media receive the
   same prompt, and provider URLs are absent from safety metadata.
4. Add JSONB state tests for the additive safety summary and old-state
   compatibility.

## Expected red conditions

- Cover requests currently use `vertical_drama_managed` and preserve the
  original prompt unchanged.
- Hermes currently receives `snapshot.prompt` without the media safety stage.
- Cover state has no safety metadata field.
- No test currently proves cross-transport prompt parity.

## Test setup

- Follow existing Vitest mocks for `executeSkillLlmWithFallback`, Drizzle, and
  media transport helpers.
- Keep provider calls mocked; no live API or credit mutation.
- Run tests relative to `apps/web` through the workspace npm command.
