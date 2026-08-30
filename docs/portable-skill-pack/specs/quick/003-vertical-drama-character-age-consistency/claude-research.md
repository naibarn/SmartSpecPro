# Research Findings

## Discovery status

SocratiCode was not available in the current tool session, so repository discovery
used targeted `rg` and narrow file reads as the documented fallback. The worktree is
heavily dirty; the plan must preserve unrelated changes and touch only the casting
contract, age-resolution logic, skill content/schema, and focused tests.

## Existing contracts

### Normal candidate flow

- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` builds one
  Visual Bible input payload and one candidate-batch prompt for 1–5 candidates.
- The current candidate prompt requires different faces and shared visual language,
  but does not inject one server-owned age directive into every candidate.
- Each candidate returns its own `character_design_dna.age_range`, so age can drift
  during the same LLM response.
- Candidate images are later submitted as independent single-image provider tasks.

### Reference-guided flow

- `apps/web/server/services/verticalDramaCharacterReferenceCasting.ts` already sends
  `age_min` and `age_max` to `character-candidate-prompt` and reuses one plain-text
  prompt for the requested image count.
- `apps/web/server/routers/verticalDramaCharacters.ts` currently derives these values
  from `character.data.ageMin/ageMax`, but clamps the minimum to 18 and falls back to
  an inferred 24–25 range. This is incompatible with a legitimate 17–19 student
  casting case and does not inspect all available DNA/story facts.
- The skill input schema also declares `age_min` and `age_max` minimum 18, so the
  schema and runtime must be updated together.

### Existing DNA and age data

- `apps/web/shared/verticalDramaSeries/characterProfile.ts` already has a persisted
  free-text `visualBible.ageRange` and structured `designDna.ageRange`.
- `apps/web/server/services/verticalDramaCharacterDesignContext.ts` extracts approved
  design DNA and bounded story/cast context, so the age resolver can reuse the same
  server-owned context rather than querying new tables.
- Existing age-stage variant rules distinguish a same-person life-stage variant from
  a separate casting identity; the resolver must preserve that distinction.

### Skill behavior

- `apps/web/skills/vertical-drama-character-visual-bible/SKILL.md` already requires an
  age range in character DNA, but candidate mode does not make the range shared.
- `apps/web/skills/character-candidate-prompt/SKILL.md` already says all candidates
  must share the requested apparent-age range, so the missing part is authoritative
  age resolution and validation, not a new generation mode.
- `apps/web/skills/character-candidate-prompt/schemas/input.schema.json` currently
  limits ages to 18–100 and must become compatible with age-appropriate teen inputs.

## Root cause

The system has an age field in some downstream contracts, but no single shared
`CharacterCastingAgeProfile` is resolved before candidate prompting. Normal candidate
generation lets the model author age independently per DNA; reference-guided generation
has a hard-coded adult fallback and an adult-only schema. Independent image tasks then
amplify the visible drift.

## Testing evidence and approach

Existing focused suites cover character image generation, character profile/DNA,
reference casting, and UI candidate behavior. The plan should add pure resolver tests,
normal candidate prompt/validation tests, reference adapter contract tests, router
branch tests, and UI read-only age explanation tests. No database migration or external
pixel-age classifier is needed for this gap closure.

## Post-plan commit impact review

Reviewed commit `ff64f446d` (`feat: add inline character casting reference picker`),
which is present on both `main` and `origin/main` and changes only
`VerticalDramaCharacterStockPanel.tsx`.

### Compatible changes

- The commit keeps the existing 1–5 candidate count and sends reference-guided option
  fields through the existing preview payload.
- It adds a forced candidate-batch entry point for the inline reference flow, so a
  character with an attached reference can still generate candidates even though the
  ordinary no-primary eligibility check becomes false.
- It carries `referenceGuided` through client batch state and preserves the
  new-person/no-DNA-lock copy on selection.

### Required plan updates / risks

1. `retryPortraitCandidate` forwards every `primary_portrait` asset link without a
   six-item cap, although the router accepts at most six. A character with more than
   six portrait/reference links can fail only on retry. Add a shared bounded-reference
   helper and retry test.
2. The inline picker initializes from every `primary_portrait` asset. Existing
   characters can have more than six because generated/imported portraits use that
   role. Project a bounded six-image list with deterministic ordering and preserve the
   intended main portrait.
3. Removing a picker item calls `deleteAsset` without protecting the canonical primary
   portrait. Because references currently share the `primary_portrait` role, a user can
   unlink the main identity image while editing optional references. Add a guard or a
   distinct reference role before considering this safe.
4. Return the age profile as a read-only preview projection and retain it in retry/batch
   state; the new inline reference surface is now the primary reference-guided UI.

## Verification after commit review

- Focused client tests passed: 3 files, 68 tests.
- `npm --workspace apps/web run typecheck` passed.
- No browser/provider/production proof was performed.
