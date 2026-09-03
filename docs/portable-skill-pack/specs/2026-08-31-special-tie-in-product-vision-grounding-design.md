# Special tie-in product vision grounding

## Decision

When a special tie-in shot has selected product references, pass those images to
the existing start-frame prompt skill as additive product references in the
vision-capable authoring mode. Keep the existing product reference attachment
on the final image render unchanged.

## Boundaries

- Apply this only to `special_tie_in` prompt authoring; normal-series prompt
  authoring remains byte-compatible.
- Keep story summary, selected character references, and location references as
  the authoritative story/identity/scene inputs.
- Product references must be labeled as product references and must never be
  used as the scene or location.
- Vision-disabled/policy-safe models continue using the existing text facts;
  final rendering still receives the product reference URLs.

## Verification

Cover the vision-image ordering and additive product label with focused unit
tests, then rerun the special tie-in and start-frame prompt test suites.
