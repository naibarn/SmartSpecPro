# Section 02 Code Review: callLLMStructured Utility

## HIGH Severity

1. **Credits deducted on failed attempts** - Credits consumed on retry failures with no visibility to caller
2. **No test for credit accumulation across retries** - Missing test for summing tokens/credits on retry
3. **`fallback_required` uses plain Error** - Not distinguishable from provider errors

## MEDIUM Severity

4. **Messages not typed with `Message` from `llm.ts`** - Uses plain objects instead of importing Message type
5. **Raw LLM response in retry prompt** - Potential prompt injection vector, should truncate
6. **Missing test for `fallback_required` case** - Only `type: "error"` is tested
7. **Error propagation test calls function twice** - Should capture rejection once
8. **`costUsd` not forwarded to `deductCreditsForModel`** - Falls back to model-lookup pricing

## LOW Severity

9. **stripMarkdownFences regex edge case** - Non-greedy may fail on nested fences
10. **No test for markdown fence stripping** - Functional gap
11. **`tenantId` informational only** - Only used in audit log metadata
12. **Audit log only written on success** - Failures invisible in audit trail
