# Vertical Drama Prompt Expansion 5,000-Character Input Limit

## Goal

Increase the Vertical Drama prompt-expansion premise limit from 2,000 to 5,000
characters without creating a client/server/schema mismatch.

## Design

- Keep one shared server constant as the authoritative limit and expose the
  same value to the client through the existing prompt-expansion contract.
- Update the text-area `maxLength`, live counter, over-limit validation copy,
  tRPC input validation, service guard, skill input schema, and smoke-test
  documentation/fixtures together.
- Preserve fail-closed behavior: input above 5,000 cannot reach the real LLM,
  and no credit is charged.
- Do not change unrelated 2,000-character limits elsewhere in the product.

## Verification

- Regression tests cover exactly 5,000 accepted and 5,001 rejected.
- The prompt-expansion UI test verifies the 5,000 counter/lock state.
- Existing focused prompt-expansion and model-policy tests remain green.
- Run `git diff --check` and the web production build.
