# Section 02 — autonomous repair runtime

## Ownership

Repair classification, best-known fallback, checkpoint-safe retry, and
completion status policy.

## Target files

- `verticalDramaStoryGenerationRepair.ts`
- `verticalDramaLongFormRuntime.ts`
- `verticalDramaCompletionContract.ts`
- related tests

## TDD expectations

Prove content-quality exhaustion returns structurally complete output with
warnings; provider/ownership/stale-state failures remain retryable failures.

## Acceptance

No ordinary semantic finding results in a user-only manual restart. Accepted
episodes/blocks survive every repair attempt and redelivery.

## Risks

Never turn missing shots/dialogue, corrupted checkpoints, or unavailable
provider output into fabricated prose. The fallback is only best-known accepted
content.
