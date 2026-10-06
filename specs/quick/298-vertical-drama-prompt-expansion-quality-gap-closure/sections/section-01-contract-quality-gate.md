# Section 01: Contract and Quality Gate

## Objective

Make “AI treatment” a versioned, profile-aware shared contract and ensure a
failed, copied, mocked, or non-LLM response cannot be represented as a
successful expansion. Only validated output from a real LLM-backed skill is a
preview.

## Owned paths

- `apps/web/shared/verticalDramaSeries/promptExpansion.ts`
- optional `apps/web/shared/verticalDramaSeries/promptExpansionTreatment.ts`
- `apps/web/skills/vertical-drama-prompt-expansion/{skill.md,skill.json,input.schema.json,output.schema.json}`
- parser/quality fixtures under the web service test fixture directory

## Implementation contract

Add `promptExpansionContractVersion: 2`, treatment kind, quality diagnostics,
provenance, discriminated treatment, and Draft handoff fields while keeping a
legacy adapter for version-1 stored previews. Bound every field and list. Use
explicit provenance and verification states; do not persist raw model reasoning.

The story treatment supports setting, lead foundations, meeting/inciting event,
relationship progression, goals/needs, obstacles/opposing forces/costs, central
question, turning points, climax, ending direction, hooks, tone, audience,
assumptions, exclusions, and concise prompt. Minimum checks depend on the
premise signals and may return open questions instead of fabricated values.
Review, documentary, news, and software-review profiles have separate minimum
sets and never inherit romance requirements.

Refactor parsing into extraction, transport normalization, schema validation,
and quality evaluation. Accept only approved fences/wrappers/aliases from the
real skill's structured response. Plain text, empty, malformed, unsafe, copied,
near-copied, generic-only, or profile-incomplete output is rejected with check
IDs. Rejected output must not use the original prompt as its successful
`expandedPrompt`.

Keep visual slots separate. They may be deterministically derived only as
clearly labelled metadata and never used to hide a treatment failure.

## TDD stubs

Write tests first for every schema bound, profile minimum, provenance state,
2,000-character boundary, JSON/fence/wrapper/alias parse, plain-text rejection,
copied/generic/unsafe rejection, story boundary violation, and non-story
profile behavior. Include a regression test for the screenshot condition:
malformed model output must be a failed state, not a successful preview whose
main text equals the original.

## Completion gate

Section is complete when the shared type is the only source of truth for the
preview payload, all profile quality checks are deterministic and tested, and
the skill schema can validate a representative Thai story treatment without
requiring Draft-only fields.
