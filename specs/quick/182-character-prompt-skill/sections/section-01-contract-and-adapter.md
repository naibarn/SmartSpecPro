# Section 01 — shared contract and skill adapter

## Ownership

Own the new profile type, snapshot extension, skill deliverable wording, and
`verticalDramaCharacterPromptSkill` adapter. Do not change media submission or
unrelated skill execution.

## Target files

- `apps/web/shared/verticalDramaSeries/characterProfile.ts`
- `apps/web/skills/character-prompt-skill/skill.md`
- `apps/web/server/services/verticalDramaCharacterPromptSkill.ts`
- focused schema/adapter tests

## TDD expectations

Write schema and normalization tests before implementation. Validate strict
profile output, role mapping, age/timeline compatibility, explicit region, and
one deliverable context. Verify malformed or conflicting data fails before
credit settlement.

## Acceptance checks

- Adapter loads only `character-prompt-skill` for normal requests.
- It returns one standalone prompt and a validated profile.
- It does not synthesize legacy sibling prompts or hidden narrative DNA.
- Inline-only models receive no separate negative field after normalization.

## Implementation evidence

- Added the strict Zod profile contract and profile-only approved snapshot path.
- Added the deliverable-aware adapter. `portrait`, `turnaround`, and
  `sheet:<type>` each produce one `positive_prompt`/`negative_prompt` pair;
  the adapter never creates legacy sibling prompt fields.
- Added fixed two-credit settlement metadata under `character-prompt-skill`;
  provider token usage is retained for audit only.
- Added focused Vitest coverage for one-call behavior, render-context routing,
  profile persistence, and legacy snapshot compatibility.
- Verified with `npm test -- --run server/services/__tests__/characterPromptSkill.test.ts
  shared/verticalDramaSeries/__tests__/characterPromptProfile.test.ts` (5 tests
  passed) and `git diff --check`.

## Risks

The existing profile JSON schema is maintained in the skill bundle while the
server needs runtime validation. Keep the shared Zod contract aligned and add a
content/audit assertion so required keys cannot drift silently.
