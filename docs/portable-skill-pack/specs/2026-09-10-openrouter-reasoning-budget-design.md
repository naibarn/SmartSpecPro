# OpenRouter reasoning budget safety

## Problem

Vertical Drama quality profiles can resolve to `xhigh` reasoning while a skill
still sends a small `max_tokens` value intended for the final answer. OpenRouter
allocates part of that completion budget to reasoning, so a successful HTTP 200
may contain no usable assistant text and the skill fails with `empty_response`.

## Solution

The provider adapter keeps `max_tokens` as the requested final-answer budget,
converts OpenRouter effort reasoning to an explicit bounded
`reasoning.max_tokens`, and expands the total completion budget to include both
budgets. The request sends only one reasoning control (`max_tokens`, not both
`effort` and `max_tokens`) and remains unchanged for providers that do not
support thinking.

The shared response extractor also normalizes string and array content so
OpenRouter-compatible response variants do not get misclassified as empty.

## Failure behavior

- Unsupported providers do not receive OpenRouter reasoning parameters.
- A genuinely empty response remains retryable/fallback-eligible.
- Reasoning text is never substituted for the final answer; schema/output
  validation still applies to the assistant content.

## Verification

- Assert `xhigh` becomes a bounded reasoning budget with final output reserved.
- Assert array-form assistant content is accepted.
- Run focused LLM/router and Vertical Drama tests; do not run repository-wide
  TypeScript checking because the environment has insufficient RAM.
