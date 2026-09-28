# Decision log

## Planning depth

- Depth: standard
- Reason: medium change across shared prompt contract, router mutations, services, and tests; no schema/auth changes.
- Route: quick plan followed by deep implementation.
- Promotion triggers: discovery of a provider API that cannot accept ordered reference images, or a required schema/data migration. Neither is currently present.

## Decisions

1. The canonical manifest is derived from `requiredCharacterRefs`, never database row order.
2. Primary portraits are mandatory; sheets, location, and product references are optional capacity consumers after mandatory portraits.
3. Missing portrait and capacity errors are server preconditions surfaced by existing client toast handlers.
4. Code owns the deterministic identity/dialogue postconditions; skills own creative prose.
5. The same final prompt used for submission is persisted for user visibility.
6. Existing dirty Grok/dialogue work is treated as in-scope prior work and reviewed in place.
7. Intentional repeated dialogue is preserved by an ordered block, not a set-based fragment list.

## Self-review rounds

### Round 1 — completeness

- [AUTO-FIX] Added angle-variation parity; the first outline covered only single-image generation.
- [AUTO-FIX] Added the model-capacity preflight before credit reservation.

### Round 2 — contradictions and codebase fit

- [AUTO-FIX] Distinguished mandatory primary portraits from optional character sheets so Image numbering stays stable.
- [AUTO-FIX] Reused existing toast error propagation instead of adding unnecessary client state.

### Round 3 — security and failure behavior

- [AUTO-FIX] Required tenant scoping to remain unchanged and prohibited signed-URL logging.
- [AUTO-FIX] Added assertions that no credit or provider call occurs after preflight failure.

### Round 4 — obvious missing improvement

- [AUTO-FIX] Added repeated-dialogue coverage because the dirty QC helper currently de-duplicates fragments.
- [AUTO-FIX] Added final-provider-boundary validation in addition to persistence validation.

### Round 5 — consistency

- No meaningful auto-fix items. File ownership and dependency order are consistent.

### Round 6 — final stabilization

- No meaningful auto-fix items. Two consecutive clean rounds reached; plan is ready.

