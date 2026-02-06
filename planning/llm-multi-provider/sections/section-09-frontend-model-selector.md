# Section 09: Frontend Model Selector Enhancement

## Overview

Update the model selector in `ChatView.tsx` to display provider information, free model badges, cost-per-1K-tokens, and allow users to select a specific provider for a model. The selected provider is stored alongside the model in conversation state and sent as `preferredProvider` in LLM requests.

**Files to modify:**
- `apps/web/client/src/pages/ChatView.tsx` (or the model selector component it uses)
- Conversation state management (wherever model selection is stored today)

**Dependencies:**
- Section 08 (tRPC endpoints) must be complete — this section consumes `getAvailableModelsWithProviders`

---

## Tests First

Test file: `apps/web/client/src/pages/__tests__/ModelSelector.test.tsx` (or co-located `.test.tsx`)

Use Vitest with React Testing Library. Mock the tRPC query `llmProviders.getAvailableModelsWithProviders`.

### Rendering

- Test: Model list shows provider name next to each model entry. Mock data with two models, each from different providers. Verify both provider names render.
- Test: Free models display a "FREE" badge. Mock a model with `isFree: true`, verify a badge element with text "FREE" is present.
- Test: Paid models display estimated cost per 1K tokens. Mock a model with `pricingInput: 3.0` and `pricingOutput: 15.0` (per 1M tokens). Verify the displayed cost is formatted correctly (e.g., "$0.003 / $0.015 per 1K").
- Test: Models with multiple providers show a "Change provider" affordance. Mock a model offered by two providers. Verify a clickable element exists to switch providers.

### Selection Behavior

- Test: Selecting a model stores both `modelId` and `providerId` in conversation state. Select a model, verify the state update includes both fields.
- Test: Default selection is the cheapest provider for the chosen model. Mock a model with two providers (one free, one paid). Verify the free provider is auto-selected.
- Test: Clicking "Change provider" opens a popover/dropdown listing all providers for that model with pricing comparison. Trigger the action, verify provider options render with names and costs.
- Test: Selecting a different provider from the popover updates the stored `providerId` in conversation state.

### Loading and Error States

- Test: While `getAvailableModelsWithProviders` is loading, the selector shows a loading indicator.
- Test: If the query fails, a user-friendly error message is shown (not a crash).

---

## Implementation Details

### Data Source

Replace the current model list data source with the `getAvailableModelsWithProviders` tRPC query (section 08). This returns:

```typescript
type AvailableModel = {
  modelId: string
  modelName: string
  providers: Array<{
    providerId: number
    providerName: string
    providerModelId: string
    pricingInput: number   // per 1M input tokens
    pricingOutput: number  // per 1M output tokens
    isFree: boolean
    isEnabled: boolean
  }>
}
```

### Model Selector Component Changes

The current model selector shows a flat list of model names. Enhance it as follows:

**Each model entry displays:**
- Model name (e.g., "Kimi K2.5")
- Provider name in a subtle badge (e.g., "via OpenCode Zen")
- "FREE" badge if `isFree` is true on the selected provider
- Cost indicator: formatted as "$X.XX / $Y.YY per 1K tokens" (input/output) for paid models, or "Free" for free models
- If the model has multiple providers: a small "Change provider" link/icon

**Provider selection popover:**
When the user clicks "Change provider", show a popover or dropdown listing all providers for that model. Each row in the popover shows:
- Provider name
- Price per 1K tokens (input/output)
- "FREE" badge if applicable
- Radio or click-to-select behavior

Selecting a provider from the popover updates the selection and closes the popover.

### Conversation State Updates

The conversation state currently stores the selected model as a string (`model: string`). Extend this to also store the provider:

```typescript
// Before:
{ model: "kimi-k2.5-free" }

// After:
{ model: "kimi-k2.5-free", preferredProvider: 42 }
```

When sending LLM requests (`POST /api/llm/stream` or `/api/llm/chat`), include `preferredProvider` in the request body if the user has explicitly chosen a provider. If no explicit provider selection was made (user just picked a model), omit `preferredProvider` and let the router choose the best provider.

### Default Provider Selection Logic

When the user selects a model (not a specific provider):
1. Sort the model's providers by cost ascending (`pricingInput + pricingOutput`)
2. Free providers sort first (cost = 0)
3. Auto-select the first (cheapest) provider
4. Store this as the default `preferredProvider`

### Cost Formatting Utility

Create a small helper function for consistent cost display:

```typescript
function formatModelCost(pricingInput: number, pricingOutput: number, isFree: boolean): string
  // If isFree: return "Free"
  // Otherwise: convert per-1M to per-1K by dividing by 1000
  // Return "$X.XXX / $Y.XXX per 1K tokens"
```

### Backward Compatibility

If `getAvailableModelsWithProviders` returns an empty list or fails, fall back to the existing model list behavior. This ensures the selector works during migration before seed data is in place.
