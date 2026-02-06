# Section 05: Credit Service Updates

## Overview

This section updates the existing `creditService.ts` to handle free models (0-credit deduction) and replace hardcoded `MODEL_PRICING` with dynamic pricing from the `model_provider_map` table.

The existing credit system uses 1 credit = $0.001 USD. Free model requests cost 0 credits. No separate budget layer is needed.

**Dependencies:** Section 01 (schema) -- requires `model_provider_map` table with `isFree`, `pricingInput`, `pricingOutput` columns.
**Blocks:** Section 06 (llmRoutes).

---

## Tests First

File: `apps/web/server/services/creditService.test.ts`

### Free Model Handling
- **Test: Free model skips credit deduction (amount=0)** -- When the model has `isFree = true` in `model_provider_map`, no credits are deducted from the user's balance.
- **Test: Free model still logs to `credit_transactions` with metadata `{freeModel: true}`** -- A transaction record is created even for free models, with amount=0 and metadata indicating it was free. This ensures complete audit trail.
- **Test: `checkCredits()` skips balance check for free models but still validates auth** -- The user must be authenticated, but their credit balance is irrelevant for free models.
- **Test: Paid model deduction unchanged from current behavior** -- Existing paid model credit deduction logic is unaffected by these changes.

### Dynamic Model Pricing
- **Test: Pricing lookup from `model_provider_map` used when model exists in map** -- The cost calculation uses `pricingInput` and `pricingOutput` from the database table.
- **Test: Hardcoded `MODEL_PRICING` fallback used when model not in map** -- For models not yet added to `model_provider_map`, the existing hardcoded pricing table is used as a backward-compatible fallback.
- **Test: Price changes in DB reflected without restart** -- Updated pricing in `model_provider_map` is picked up on the next request (no aggressive caching or use short-lived cache with invalidation).

---

## Implementation Details

### File Path

`apps/web/server/services/creditService.ts` (existing file, modify in place)

### Free Model Handling

Update the credit deduction flow:

1. Before deducting credits, query `model_provider_map` to check if the model has `isFree = true`.
2. If the model is free:
   - Skip the credit balance deduction.
   - Still insert a row into `credit_transactions` with `amount = 0` and metadata `{ freeModel: true, modelId: "..." }`. This preserves the audit trail.
3. The `checkCredits()` function (called before request execution) should:
   - Always validate that the user is authenticated.
   - If the model is free, skip the balance sufficiency check.
   - If the model is paid, perform the normal balance check.

### Dynamic Model Pricing

Replace the hardcoded `MODEL_PRICING` object with a database lookup:

1. When calculating credits to charge for a request, first look up the model in `model_provider_map` for `pricingInput` and `pricingOutput`.
2. If found, calculate cost: `(inputTokens / 1_000_000 * pricingInput) + (outputTokens / 1_000_000 * pricingOutput)`. Convert to credits using the 1 credit = $0.001 rate.
3. If the model is NOT found in `model_provider_map`, fall back to the existing hardcoded `MODEL_PRICING` table. This provides backward compatibility during the migration period when not all models have been added to the map.

### Caching Considerations

Model pricing changes infrequently. Two acceptable approaches:
- **No cache**: Query `model_provider_map` on every request. The query is simple (single row lookup by modelId) and the table is small.
- **Short-lived cache**: Cache pricing for 5 minutes, invalidate on admin updates via the tRPC mutation (Section 08). This reduces DB queries but adds complexity.

The simpler no-cache approach is recommended for initial implementation. Optimize later if profiling shows it matters.
