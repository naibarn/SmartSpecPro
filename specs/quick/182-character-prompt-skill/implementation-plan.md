# Implementation plan

## Objective

Route normal portrait and character-sheet prompt generation through
`character-prompt-skill`, producing only the requested prompt while preserving
the current tRPC and media contracts.

## Affected files

- `apps/web/skills/character-prompt-skill/skill.md` and its schema/audit tests.
- New `apps/web/server/services/verticalDramaCharacterPromptSkill.ts` adapter.
- `apps/web/shared/verticalDramaSeries/characterProfile.ts` shared profile and
  snapshot contract.
- `apps/web/server/services/verticalDramaCharacterDesignContext.ts` profile
  continuity projection.
- `apps/web/server/routers/verticalDramaCharacters.ts` preview, portrait, and
  sheet calls.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
  optional preview typing only if the router response changes.
- Focused service/router/shared tests in the existing Vertical Drama test
  suites, plus a new adapter test if the existing suites cannot isolate it.

## Work sequence

1. Add the shared Zod contract for the new profile and an additive
   `characterPromptProfile` field to approved/persisted visual-bible schemas.
   Require either legacy `designDna` or the new profile in an approved
   snapshot. Keep all existing legacy records valid.
2. Update the skill instructions with a deliverable contract. Explicitly state
   that `generation.render_context` is data and `positive_prompt` must be a
   complete standalone prompt for that requested deliverable.
3. Implement the adapter:
   - normalize series DNA from the loaded design context and series facts;
   - normalize one character with authoritative role, age, region, reference,
     occupation, personality, timeline, and visual overrides;
   - include bounded cast/approved-profile evidence as data;
   - load the new skill body and call the existing bounded JSON planner;
   - validate role/age/region/approved identity and selected-model prompt length;
   - return `positive_prompt`, model, profile, summary, retry count, and
     compatible contract metadata;
   - settle one `character-prompt-skill` run after a valid final response.
4. Switch the three normal router call sites to the adapter:
   - portrait preview/direct portrait use `portrait`;
   - `auto`/`turnaround` sheet uses `turnaround`;
   - named/full-combined sheet uses `sheet:<type>`;
   - approved prompt paths remain LLM-free.
5. Update persistence and design-context projection so a profile-only snapshot
   retains face anchors and visual summary for future calls. Do not invent
   legacy hidden-truth or score fields.
6. Keep candidate casting on its existing skill and confirm no normal path calls
   both skills.
7. Add focused regression tests and run bounded validation.

## Acceptance criteria

- Portrait generation causes one new-skill LLM call and returns exactly one
  portrait prompt; no four unused sibling prompts are required or generated.
- Turnaround and every named sheet receive a prompt tailored to that one type.
- Approved portrait render performs zero second prompt LLM calls.
- Existing image model capability, negative-prompt, reference, tenant, and
  stale-snapshot guards remain active.
- Legacy visual bibles continue to parse and reuse.
- New profile snapshots validate, persist, and provide continuity evidence.
- Skill billing records `character-prompt-skill`, deliverable, model, tokens,
  and retry metadata with one settlement per LLM call.
- Focused tests and `git diff --check` pass; no paid image generation occurs.

## Rollback

Keep the legacy service exported and switch router imports back to it if the new
adapter fails focused validation. The additive profile field remains harmless
to legacy readers and needs no database migration.
