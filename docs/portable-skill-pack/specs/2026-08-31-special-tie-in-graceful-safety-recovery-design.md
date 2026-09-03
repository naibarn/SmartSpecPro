# Special Tie-in Graceful Safety Recovery

## Goal

Prevent a special tie-in generation from becoming a terminal failed episode when
the submitted story is safe and the generated prompt contains only a recoverable
prompt-control issue. Preserve hard stops for unsafe user input, unavailable
models, missing references, stale input, and persistence failures.

## Design

1. Keep story safety detection strict for positive coercion language, including a
   real statement that an adult forced a child to act.
2. Remove bounded negated English/Thai coercion phrases before marker matching.
   Prompt instructions such as `no forced movement` and `ห้ามบังคับ` describe
   constraints, not story events.
3. When input safety is clear but generated-output safety blocks, stop spending
   provider retries and materialize the existing deterministic nine-shot fallback.
   The fallback preserves selected references, continuity, product-use stages, and
   dialogue, while marking `quality_control.needs_review=true`.
4. Keep input-level safety blocks and downstream persistence/reference/model errors
   as hard failures because automatically continuing would risk unsafe content or
   invalid data.

## Invariants

- Normal episode flow is unchanged; only the special tie-in adapter and shared
  story-safety marker handling are touched.
- A product reference remains additive and present in every special shot.
- Selected-character and dialogue authorization remain enforced.
- No extra provider call is made after a generated-output safety block.
- Forensics still records the raw attempt, failure reason, fallback materialization,
  and final persistence outcome.

## Verification

- Safety regression: negated prompt constraints remain low risk; positive forced
  child action remains high risk.
- Re-run the persisted episode 248 output through the production analyzer.
- Run focused special tie-in and safety test suites.
