# Section 10: Frontend Fallback Consent UI

## Overview

When a free model fails and the LLM router determines that a paid model is available as fallback, the server returns a `fallback_required` event (via SSE for streaming, or JSON for non-streaming). The frontend must detect this event, display an inline consent banner in the chat area, and allow the user to accept or reject the fallback. On acceptance, the original request is re-sent with the `preferredProvider` field set to the paid provider.

**Files to modify:**
- `apps/web/client/src/pages/ChatView.tsx` (or the chat message streaming handler)
- SSE parsing logic (wherever the EventSource/fetch streaming response is processed)

**Dependencies:**
- Section 06 (llmRoutes) must be complete — the server must emit `event: fallback_required` SSE events and return `fallbackRequired` JSON responses
- Section 08 (tRPC endpoints) must be complete — the `getAvailableModelsWithProviders` query is used for display names

---

## Tests First

Test file: `apps/web/client/src/pages/__tests__/FallbackConsentUI.test.tsx`

Use Vitest with React Testing Library. Mock the SSE/fetch response stream.

### SSE Event Parsing

- Test: An `event: fallback_required` SSE event triggers the consent banner. Simulate an SSE stream that sends `event: fallback_required\ndata: {"from": {"providerName": "OpenCode Zen", "modelName": "Kimi K2.5"}, "to": {"providerName": "OpenRouter", "modelName": "Claude 3.5 Sonnet", "providerId": 1}, "estimatedCredits": 50}\n\n`. Verify the banner element appears in the DOM.
- Test: The banner displays the source model, target model, target provider, and estimated credit cost. Verify text content includes "Kimi K2.5", "Claude 3.5 Sonnet", "OpenRouter", and "50 credits".
- Test: The banner has a "Switch" button and a "Cancel" button. Query both buttons by role/text and verify they exist.

### User Actions

- Test: Clicking "Switch" re-sends the chat request with `preferredProvider` set to the `to.providerId` from the fallback event data. Mock the fetch/send function, click "Switch", verify it was called with `preferredProvider: 1` in the body.
- Test: Clicking "Cancel" dismisses the banner and shows an error message in the chat (e.g., "Request cancelled. The model is temporarily unavailable."). Click "Cancel", verify the banner disappears and an error message element is shown.
- Test: While the fallback banner is showing, the chat input is disabled (prevents sending new messages until the user resolves the fallback).

### Non-Streaming (JSON) Fallback

- Test: A JSON response with `{ fallbackRequired: true, from, to, estimatedCredits }` triggers the same consent banner. Mock a non-streaming fetch response, verify the banner appears.

### Edge Cases

- Test: If the user's credit balance is below `estimatedCredits`, the "Switch" button is disabled and a tooltip/message explains insufficient credits.
- Test: Multiple rapid fallback events do not stack banners — only the most recent one is shown.

---

## Implementation Details

### SSE Event Handling

The current streaming handler in `ChatView.tsx` processes SSE data events to append chat content. Add handling for the `fallback_required` event type:

```typescript
// In the SSE parsing loop:
if (event.type === 'fallback_required') {
  const data = JSON.parse(event.data)
  // data shape: { from: { providerName, modelName }, to: { providerName, modelName, providerId }, estimatedCredits }
  setFallbackRequest(data)  // triggers banner render
  return  // stop processing further SSE events for this request
}
```

The SSE event format from the server (section 06):
```
event: fallback_required
data: {"from":{"providerName":"OpenCode Zen","modelName":"Kimi K2.5"},"to":{"providerName":"OpenRouter","modelName":"Claude 3.5 Sonnet","providerId":1},"estimatedCredits":50}

```

### Fallback Consent Banner Component

Create an inline banner component rendered within the chat message area (not a modal, not a toast — it should appear in-flow where the assistant response would have been).

**Visual structure:**
- Icon indicating a provider issue (warning/lightning icon)
- Text: "[Source model] is temporarily unavailable. Use [Target model] via [Target provider] for ~[N] credits?"
- Two buttons: "Switch" (primary action) and "Cancel" (secondary)
- If credits are insufficient: "Switch" is disabled, text below explains "You need [N] credits but have [M]"

**State management:**

```typescript
// New state in ChatView or the chat message handler:
const [fallbackRequest, setFallbackRequest] = useState<FallbackRequestData | null>(null)

type FallbackRequestData = {
  from: { providerName: string; modelName: string }
  to: { providerName: string; modelName: string; providerId: number }
  estimatedCredits: number
  // Store the original request params so we can re-send:
  originalRequest: { model: string; messages: Message[]; conversationId?: number }
}
```

### "Switch" Button Handler

When the user clicks "Switch":
1. Dismiss the banner (`setFallbackRequest(null)`)
2. Re-send the original request with the addition of `preferredProvider: fallbackRequest.to.providerId` in the request body
3. The server-side router (section 06) will use this `preferredProvider` to bypass routing and go directly to the specified provider, re-validating credits and health
4. Show the normal streaming response UI (assistant typing indicator, etc.)

### "Cancel" Button Handler

When the user clicks "Cancel":
1. Dismiss the banner (`setFallbackRequest(null)`)
2. Append an error message to the chat: "Request cancelled. [Source model] is temporarily unavailable. You can try again later or select a different model."
3. Re-enable the chat input

### Non-Streaming JSON Response Handling

For non-streaming requests (`/api/llm/chat`), the server returns:

```json
{
  "fallbackRequired": true,
  "from": { "providerName": "OpenCode Zen", "modelName": "Kimi K2.5" },
  "to": { "providerName": "OpenRouter", "modelName": "Claude 3.5 Sonnet", "providerId": 1 },
  "estimatedCredits": 50
}
```

In the non-streaming response handler, check for `response.fallbackRequired === true` and trigger the same `setFallbackRequest()` flow.

### Credit Balance Check

The banner needs the user's current credit balance to determine if the "Switch" button should be enabled. Use the existing credit balance from app state (e.g., `useAuth()` hook or a credits query). Compare `user.credits` against `fallbackRequest.estimatedCredits`.

### Chat Input Locking

While `fallbackRequest` is non-null, disable the chat input and send button. This prevents the user from sending additional messages while a fallback decision is pending, which would create confusing interleaved state.
