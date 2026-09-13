# Section 03: Story Truth Package and Semantic Quality Gates

## Ownership boundary

Own shared story facts, versioning, context projections, semantic issue contracts, and
acceptance/repair orchestration. Do not change provider transport or UI controls.

## Target files/modules

- new shared contracts under `apps/web/shared/verticalDramaSeries/`
- story context/projection service under `apps/web/server/services/`
- Script, Story Bible, Storyboard, Character, Episode Quality Review integration points
- focused pure-function and service tests

## Implementation contract

The Story Truth Package is the authoritative, versioned input projection. It must preserve
user-authored dialogue and approved managed assets. It must identify locked facts, source
version, and the producer artifact version. Downstream generation may add proposals but may
not overwrite locked facts without an explicit revision action.

Semantic gates must produce typed, repairable issues. A schema-valid result with a blocking
contradiction is rejected or repaired; it is not persisted as accepted merely because JSON
parsed successfully.

## TDD expectations

Test deterministic gates independently from provider calls. Use fixtures with:

- character knowledge contradiction;
- age/role/relationship drift;
- timeline inversion;
- speaker not present in the episode cast;
- missing continuity anchor;
- stale source version;
- valid but warning-only output.

Test that targeted repair receives issue details and that failed repair cannot replace the
last accepted artifact.

## Acceptance checks

- Story/script/storyboard stages consume the same canonical facts.
- Accepted artifacts record source and producer versions.
- Revisions cannot overwrite newer accepted output.
- Semantic review has bounded retry/repair budgets.
- Quality improvements do not delete or rewrite user-authored dialogue without an explicit
  user action.

## Risks

- Large context packages can increase cost and latency; use compact task projections.
- Existing legacy episodes may lack complete truth data; normalize with warnings and do not
  invent missing facts.
