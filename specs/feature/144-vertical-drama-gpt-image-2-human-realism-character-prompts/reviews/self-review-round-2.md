# PLAN ADVERSARIAL SELF-REVIEW — Round 1

## Attack assumptions

Review the plan as if an implementer can accidentally pass a request that looks
valid in the happy path but violates the provider contract under Unicode input,
candidate-batch failure, or a stale persisted prompt.

## Findings

### A1 — Character-count semantics were not explicit

The plan says “characters” but does not state which existing runtime count is
authoritative. A prompt containing astral Unicode could pass a code-point check
and fail a provider/request validator that uses JavaScript string length, or the
reverse.

**Fix:** use the same normalized `string.length` semantics as the existing
`modelPromptBudget`/media route checks, document that it is intentionally
conservative for surrogate pairs, and add boundary tests with Thai and emoji
fixtures. Do not introduce a second counting algorithm.

### A2 — Candidate preflight must not leave a claimed batch behind

The plan correctly moves candidate validation before credit reservation, but an
implementation could claim the batch first and then fail preflight, leaving
candidate rows in a non-retryable state.

**Fix:** require capability/version/length preflight over the loaded candidate
drafts before claim, reservation, or provider submit; if the existing lifecycle
requires a claim for loading, the failure path must release/expire the claim
using the existing idempotent mechanism. Add a test proving no reservation and
no provider task occurs on one invalid candidate.

### A3 — Stale approved prompts need a deterministic regeneration boundary

The plan says regenerate when Character DNA is available, but does not state
where this happens, which could lead to a router-only creative workaround.

**Fix:** regeneration belongs to the existing skill-generation service using the
same capability facts and current approved DNA context. The router only decides
reuse versus regenerate/reject and never appends prose. Add this to the file
map and test the no-facts rejection path.

## Result before integration

Three concrete fixes are required. No change is needed to family limits,
negative omission, skill ownership, or non-target compatibility.

## Regression check after integration

All three fixes are now reflected in `claude-plan.md`:

- length counting is centralized and explicitly covered by Unicode fixtures;
- candidate preflight is before claim/reservation where possible, with release/
  expiry behavior required when the existing loader requires a claim;
- stale-prompt regeneration is owned by
  `verticalDramaCharacterImageGeneration.ts`, while the router only selects the
  path.

The changes do not alter the target matrix, the single-prompt/negative omission
contract, or legacy provider behavior. Phase B is complete.
