# Decision Log

- Depth: `micro`; one backend contract with two sequential implementation
  sections and focused tests.
- Chosen approach: deterministic final-prompt redaction plus fail-closed
  validation.
- Rejected: stronger negative prompt only, because the reported image already
  ignored an exact-cast prohibition.
- Rejected: a second LLM visual-summary rewrite, because it adds cost and can
  drift from the authoritative synopsis.
- Contract: selected physical/screen-caller refs are the only allowed roster
  names in a positive image prompt.

## Self-review rounds

1. Coverage: added all prompt modes, not policy-safe only.
2. Contradictions: retained explicit screen callers as allowed names.
3. Security/boundaries: roster lookup remains tenant + series scoped.
4. Obvious gap: protected overlapping selected names from substring damage.
5. Failure mode: final validation fails closed if sanitation misses a name.
6. Clean review: no new schema, credits, or presence inference introduced.
7. Clean review: tests cover the reported Thai example and generic mode path.
