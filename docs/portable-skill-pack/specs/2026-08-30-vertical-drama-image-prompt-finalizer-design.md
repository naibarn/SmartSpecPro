# Vertical Drama Image Prompt Finalizer

## Goal

Ensure every provider-ready Vertical Drama image render uses one canonical
prompt string containing both positive instructions and negative constraints,
with `cinematic-prompt-refiner-pro` as the final creative prompt-authoring
step.

## Contract

- Image transports receive `prompt` only; `negativePrompt` is persisted and
  returned as an empty string for Vertical Drama image prompts.
- Legacy `NEGATIVE PROMPT:` and `IMAGE NEGATIVE CONSTRAINTS:` lines are removed
  from the positive body, parsed conservatively, and emitted once as a
  canonical `IMAGE NEGATIVE CONSTRAINTS (MANDATORY — do not render):` line.
- Negative constraints are deduplicated case-insensitively while preserving
  first-seen wording and order. Ordinary positive prose containing the word
  "negative" is not rewritten.
- Start-frame, angle-grid, repair, and reference-frame provider paths call the
  cinematic refiner even when the provider length cap is not exceeded.
- Protected identity and canonical negative fragments must be present exactly
  once in the optimizer result. Invalid output is retried strictly and then
  fails closed; application code never appends prompt text after optimization.
- The `policy_safe_rewrite` mode remains an intentional exception: its exact
  replacement safety proof is already the final authoring boundary and must not
  be passed through a creative refiner that could reintroduce unsafe wording.

## Verification

- Canonical merge and forced-finalizer regression tests cover deduplication,
  positive-text preservation, protected fragments, and no post-refiner append.
- Existing start-frame image-mode and pipeline contract tests remain green.
- Production build, backend restart, service status, health endpoint, and diff
  whitespace checks passed.
