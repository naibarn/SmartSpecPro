# Section 03 — Analysis, Calculation, Readiness, Safety

## Scope

Implement Spec 265 §§11–18, 33–37, 40–41: skill-first bounded reasoning, deterministic calculations, scenario/MCDA/uncertainty, explainability and protected/professional/side-effect boundaries.

## Implementation

- Pure deterministic calculation helpers with versioned assumptions and explicit units.
- Financial horizon calculations preserve one declared currency, period and input basis; estimate/user-stated data remain disclosed, with no implicit currency conversion, sale prediction or automatic investment recommendation.
- Regulated calculations remain blocked until the jurisdiction ruleset and qualifying professional verification reference are explicitly supplied.
- A caller-supplied verification claim never becomes an official/professional readiness label; regulated readiness requires a server-verified receipt.
- Preserve provenance for every financial input and propagate bounded low/base/high inputs into net cash-flow ranges. Reject totals outside deterministic output precision.
- Separate estimates/proxies from observed/verified facts; expose uncertainty and causal limits.
- No restricted/protected-class inference or unauthorized external side effect.

## Tests

Calculation fixtures, missing data, sensitivity, numerical boundary, safety and side-effect guard cases.
