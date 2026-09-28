# Dynamic Character Casting Age Consistency

## Context

Vertical Drama character casting can generate 1–5 independent portrait candidates.
The current candidate prompts preserve shared visual language but do not carry a
single authoritative apparent-age range across the batch. As a result, candidates
later in the batch can look noticeably older or younger even when they represent the
same story character.

## Goal

Derive a character-specific apparent-age profile from the character DNA and story
role, then apply the same profile to every casting candidate. The profile must remain
dynamic per story and per character; it must not use one fixed age for every lead.

Examples of role-aware outcomes include a student lead around 17–19, a young working
adult around 22–25, or an intentionally older lead around 30–35. These are examples of
role/DNA inference, not global constants.

## Requirements

- Prefer an explicit age or age range from authoritative story/character facts.
- Otherwise use approved Character DNA / Visual Bible age data.
- Otherwise derive one bounded age range from age-stage variant, role, occupation,
  relationships, story world, and narrative context.
- Derive the range once per character batch, not independently for candidates 1–5.
- Apply the same range to every candidate prompt and candidate design snapshot.
- Keep different characters independent: a large intended age gap between leads must
  be preserved rather than harmonized.
- Do not allow optional clothing, pose, or framing instructions to silently override
  canonical story age. Conflicting age text must be handled explicitly.
- For apparent ages under 18, preserve age-appropriate, non-sexualized casting rules.
- Keep the change limited to casting image generation and candidate selection. It must
  not change storyboard, shot, variant, twin, or later production flows.
- Preserve the no-reference path and the reference-guided `character-candidate-prompt`
  path, using the same age profile contract where applicable.

## Acceptance criteria

1. A five-image batch for one character carries one shared age directive.
2. Candidate prompt/DNA validation rejects or regenerates material age-range drift.
3. A student, young worker, and older-lead example resolve to role-appropriate ranges
   without hard-coding one universal age.
4. Male and female leads in an age-gap story receive separate ranges.
5. Existing approved DNA age data survives the no-primary recast path.
6. Reference-guided prompts receive the same resolved age directive while still stating
   that the reference is only a guideline and the result is a new fictional person.
7. No age selector is required from the user; the UI may show the derived range as a
   read-only casting explanation.
8. Existing candidate count, image selection, primary portrait promotion, credit,
   polling, and downstream character-generation behavior remain unchanged.

## Scope boundary

This is a plan-only specification for the age-consistency gap in the already-approved
character reference casting feature. No database migration, new image model, pixel-age
classifier, or automatic downstream regeneration is included.
