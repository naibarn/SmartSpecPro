# Code Review: Section 03 — character render normalizer

## Verdict

PASS.

The router resolves the canonical selected render model before invoking the
Visual Bible skill, shares the model capability with the final request
normalizer, and validates the final prompt after series-look/region assembly.
Target requests omit the negative field while legacy requests preserve it.
Approved target prompts and candidate batches have explicit stale-snapshot
guards, and all candidate prompts are preflighted before credit claim or paid
submission.

Focused router regression coverage passed: 32/32 tests across reference
framing and region/ethnicity flows. No paid provider call was made.
