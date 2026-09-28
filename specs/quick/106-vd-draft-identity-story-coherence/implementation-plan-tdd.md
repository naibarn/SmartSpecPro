# TDD Guidance

## Contract tests first

1. `storyContext` keeps US market separate from Asian lead background and does not infer a
   country from English dialogue.
2. Explicit Thai/Vietnamese/other origin and creator names outrank spoken market and title.
3. Ambiguous broad origin returns `needs_creator_decision` rather than a random country.
4. `storyDesignContract` accepts bounded romance phases/advantage beats and rejects invalid
   IDs/windows through the existing Story Control validator.

## Service tests

1. Synthesis prompt includes separate identity facts and story-design requirements.
2. Parsed drafts with invalid role labels normalize safe casing and produce diagnostics.
3. Missing roles produce `needs_role_review`; occupation alone never promotes a lead.
4. Legacy responses without optional fields remain parseable.
5. Story bible prompt carries approved context/seed without changing legacy prompt behavior
   when the fields are absent.

## UI tests

1. Draft card renders separate market, setting, lead background, dialogue and naming rows.
2. Provenance and ambiguity states are visible in Thai and English.
3. Apply remains disabled for an unresolved structural role error and enabled after repair.
4. Existing title-selection and stale-draft gates continue to work.
5. The card stacks without horizontal overflow at mobile width and preserves keyboard focus.
