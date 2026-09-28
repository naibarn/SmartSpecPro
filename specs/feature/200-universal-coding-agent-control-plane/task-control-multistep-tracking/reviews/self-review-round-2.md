# Self-review round 2

- Backward compatibility is preserved by additive summary fields and a new
  query; existing list/detail callers remain valid.
- Completed predecessor visibility is explicitly tested rather than inferred
  from dashboard counters.
- Failed, canceled, waiting and malformed states have visible contracts.
- The plan avoids whole-repo typecheck and uses jsdom/Playwright proof.

Risk retained for implementation: old jobs may lack explicit ordinals, so the
grouper must use a stable fallback and never claim an unknown step is complete.
