# Section 03 completeness review

## Result

PASS.

## Coverage

- Added a trusted internal marker and one shared final request normalizer.
- Resolves capability from the canonical selected image model before prompt
  generation, including the reference-image/edit-model route.
- Runs post-series-look length validation and target negative-field removal
  before image credit reservation or Hermes/MCP/gateway submission.
- Preserves legacy negative prompts and transport behavior for non-target
  models.
- Preview snapshots carry contract/profile metadata; stale target snapshots
  regenerate from character facts, while stale candidates fail before claim or
  reservation.
- Candidate batches read and normalize every prompt before claim/reservation,
  so one invalid candidate prevents the whole batch from being paid/submitted.
- GPT Image 2/Nano Banana prompts allow 20,000 characters and Seedream prompts
  allow 5,000 characters through the shared contract and browser snapshot.
- Approved-snapshot and candidate-batch reuse carries the bounded semantic retry
  count into the final trusted media request context for observability.

## Verification

- Feature 144 focused suite: 344 tests passed.
- Reference-framing and region/ethnicity router regressions: 32 tests passed.
- Character Visual Bible skill verifier: passed with no provider calls.
- Full web typecheck: no diagnostics in the new Feature 144 symbols; the
  matching `mediaGenerationService.ts(2573)` error is pre-existing dirty code.
- No paid provider generation or A/B evaluation was run.
