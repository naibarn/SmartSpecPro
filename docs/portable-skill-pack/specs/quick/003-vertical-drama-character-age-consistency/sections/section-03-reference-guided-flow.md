# Section 03: Reference-Guided Flow

## Goal

Make `character-candidate-prompt` consume the same dynamic age profile, including valid
teen ranges, while retaining new-person/reference-guideline disclosure.

## Implementation scope

- Replace router hard-coded adult clamping and 24–25 fallback with the shared resolver.
- Pass the profile to the adapter as `age_min`/`age_max` and persist it with the batch.
- Update `character-candidate-prompt` input schema and skill instructions to support the
  existing age-stage lower bound, including 17–19, plus age-appropriate safety rules.
- Require one shared apparent-age band across all requested independent outputs.
- Keep the prompt plain text, one-image-per-task, no collage, new fictional person, and
  reference-as-guideline behavior unchanged.
- Reuse one bounded reference-link projection for preview and retry. It must cap at six
  and preserve deterministic ordering even when a character has many primary-portrait
  links.

## Files

Primary files are `verticalDramaCharacterReferenceCasting.ts`,
`verticalDramaCharacters.ts`, the skill SKILL.md/schema, shared profile contracts, and
reference adapter/router tests.

## Tests before implementation

- Adapter maps 17–19, 22–25, and 30–35 exactly without clamping.
- Schema accepts under-18 input and rejects invalid ranges.
- Prompt preserves same-age-band, non-sexualized under-18, new-person, and guideline-only
  wording.
- Counts 1–5 reuse one profile.
- Retry with more than six stored portrait/reference links caps safely instead of failing
  the router input contract.
- Ownership, credit, selection, and no-reference branches remain unchanged.

## Completion proof

Focused reference casting and router suites pass, and the skill contract tests confirm
the schema/documentation remain aligned.

## UI/UX Contract

### Target User / JTBD
N/A — this section owns the skill adapter, schema, and router contract.

### Existing Pattern Reference
N/A — client controls reuse is defined in section 04.

### Surface Inventory
N/A — no direct browser markup.

### Component Map
N/A — adapter/schema/router boundary only.

### State Matrix
N/A — adapter and router outcomes are tested without rendering.

### Responsive Matrix
N/A — no layout change.

### Accessibility Acceptance
N/A — no new control.

### Copy Contract
N/A — plain-text skill content is a generation contract; localized UI copy is in section 04.

### Browser Evidence Required
N/A — browser evidence is defined in section 04.

## Implemented

- Reference picker links now use `casting_reference`; identity-lock resolution remains restricted to `primary_portrait`, while casting resolution accepts both roles.
- Preview/retry/picker projection keeps a deterministic six-link cap and preserves the canonical primary portrait from deletion.
- The reference skill accepts age bands below 18, enforces 1–5 outputs, repeats the shared age-band and new-person constraints, and receives the resolver's min/max band.
