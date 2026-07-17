# Decision log

## Planning depth

- Depth: `micro`
- Reason: one service and one focused test file; no API, UI, DB, or dependency change.
- Promotion trigger: normalization requires changes to shared persisted contracts or client
  response types. Current research shows neither is needed.

## Decisions

1. Use a Zod preprocess wrapper around the output schema so normalization runs before
   nested Character DNA validation.
2. Normalize only `current_cast_compared`, `recent_series_compared`,
   `prior_lead_dna_compared`, and `history_completeness`.
3. Keep `candidate_direction_count` LLM-owned and literal-3 validated.
4. Apply a one-way status rule: unsupported `pass` becomes `provisional`; never promote.
5. Return correction metadata from the pure normalizer and log only bounded facts.

## Stabilization reviews

- Round 1 `[AUTO-FIX]`: removed `candidate_direction_count` from server normalization.
- Round 2 `[AUTO-FIX]`: made threshold handling explicitly one-way and conservative.
- Round 3 `[AUTO-FIX]`: separated pure normalization from bounded logging.
- Round 4: no meaningful completeness, contradiction, security, or missing-test findings.
- Round 5: no meaningful findings; second consecutive clean round reached.
