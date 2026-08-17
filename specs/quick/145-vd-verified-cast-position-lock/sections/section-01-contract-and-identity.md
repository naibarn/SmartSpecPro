# Section 01 — Contract and identity

Ownership: shared Vertical Drama contract/helper modules and focused unit tests.

Targets: `apps/web/shared/verticalDramaSeries/contracts.ts`, a focused shared
helper/test if useful, and the dialogue mapping helper in the episode router.

TDD: prove deterministic viewer positions, exact set/asset validation, Shot 5,
unique name resolution, ambiguous name rejection, and stable-key pass-through.

Acceptance: all persisted locks contain stable keys; no display-name-only speaker
can reach portrait lookup or prompt generation.

Risk: legacy optional data must round-trip without coercion.
