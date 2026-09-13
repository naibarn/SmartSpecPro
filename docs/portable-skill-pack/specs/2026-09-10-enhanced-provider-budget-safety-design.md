# Enhanced Provider Budget Safety Design

## Goal

Prevent Enhanced Video Prompt authoring from requesting an unbounded provider
output budget, handle provider-side credit-limit failures safely, and keep the
Agents bridge aligned with the selected provider route.

## Current failure

OpenRouter rejected the Agents Responses request with HTTP 402 because the
request was evaluated at 65,536 possible output tokens while the API key could
not afford that ceiling. The Python runtime has a total-token budget, but no
per-request output-token cap. The bridge also passes only the logical model id,
API key, and base URL; provider model id/API style are not carried through.

## Design

1. Add a bounded `max_output_tokens_per_stage` runtime setting, defaulting to
   8,192 and bounded by validation. Pass it to the Agents SDK as
   `ModelSettings(max_tokens=...)` for every stage.
2. Carry `providerModelId` and `apiStyle` in the authoring-model snapshot.
   The bridge uses the provider model id and explicitly selects Responses or
   Chat Completions. Unsupported transports fail closed.
3. Convert provider 402/429/auth failures and unknown bridge exceptions into
   stable, user-safe error codes. Do not expose Python paths, provider key
   metadata, or raw tracebacks to the browser. Preserve the pre-deduction
   boundary so failed provider calls do not deduct SmartAIHub credits.
4. Add Python and TypeScript regression tests for token propagation, transport
   selection, provider error classification, safe bridge messages, and the
   existing successful contract path.

## Non-goals

- No provider retry or credit purchase.
- No database schema or migration changes.
- No changes to video rendering/provider submission.
- No deployment or production restart in this change.

## Acceptance criteria

- Every Enhanced Agent request has an explicit bounded output-token limit.
- OpenRouter-style provider routing uses the persisted provider model id and
  declared API style, with no silent transport fallback.
- A provider 402 produces a stable actionable error without raw traceback.
- SmartAIHub credit deduction remains after a successful bridge result only.
- Focused Python and TypeScript tests pass, and unrelated dirty worktree files
  remain untouched.
