# Section 06: LLM Routes Decomposition

## Overview

This section decomposes the monolithic `proxyChatWithCredits()` function in `llmRoutes.ts` into thin HTTP handlers that delegate to the new services: `llmRouter` for provider resolution and execution, `costTracker` for usage logging, and the updated `creditService` for credit handling.

The HTTP endpoint handlers (`/api/llm/stream`, `/api/llm/chat`, `/v1/chat/completions`) remain in `llmRoutes.ts` but become significantly thinner.

**Dependencies:** Section 01 (schema), Section 02 (providerHealth), Section 03 (costTracker), Section 04 (llmRouter), Section 05 (creditService).
**Blocks:** Section 09 (frontend model selector), Section 10 (frontend fallback UI).

---

## Tests First

File: `apps/web/server/llmRoutes.test.ts`

### Endpoint Decomposition
- **Test: `/api/llm/stream` returns SSE stream on success** -- A successful request pipes the provider's streaming response to the client as SSE events.
- **Test: `/api/llm/stream` returns `event: fallback_required` SSE when tier crossing** -- When `llmRouter.executeWithFallback()` returns `{type: 'fallback_required'}`, the endpoint sends an SSE event with type `fallback_required` and data containing `from`, `to`, and `estimatedCredits`.
- **Test: `/api/llm/stream` with `preferredProvider` uses override** -- When the request body includes `preferredProvider`, it is passed through to `executeWithFallback()`.
- **Test: `/api/llm/chat` returns JSON response on success** -- Non-streaming requests return a standard JSON response body.
- **Test: `/api/llm/chat` returns fallback_required JSON when tier crossing** -- Returns HTTP 200 with `{fallbackRequired: true, from, to, estimatedCredits}`.
- **Test: `/v1/chat/completions` OpenAI-compat endpoint works with router** -- The OpenAI-compatible endpoint delegates to the same router flow.
- **Test: Credit deduction called after successful response** -- `creditService.deductCredits()` is called after the response completes, with 0 for free models.
- **Test: `costTracker.logRequest()` called after every attempt** -- Usage logging happens for both successful and failed requests.

### Brainstorm Mode
- **Test: Each model in brainstorm resolves its own provider chain independently** -- Brainstorm mode calls the LLM twice with different models; each call goes through `executeWithFallback()` separately.
- **Test: Credits deducted per model output (unchanged behavior)** -- Each model's usage is charged independently.

---

## Implementation Details

### File Path

`apps/web/server/routers/llmRoutes.ts` (existing file, modify in place)

### Decomposition of `proxyChatWithCredits()`

The current `proxyChatWithCredits()` function handles provider resolution, request proxying, streaming, and credit deduction all in one function. Split it into the following flow:

**New handler flow for each endpoint:**

1. **Parse request** -- Extract `model`, `messages`, `stream`, `preferredProvider` from the request body.
2. **Check credits** -- Call `creditService.checkCredits(user, model)`. For free models, this validates auth but skips balance check.
3. **Execute with router** -- Call `llmRouter.executeWithFallback({ model, messages, stream, userId, preferredProvider })`.
4. **Handle result** based on the discriminated union:
   - `{type: 'success'}`: Pipe/return response, then proceed to steps 5-6.
   - `{type: 'fallback_required'}`: Return fallback consent response (SSE event or JSON), skip steps 5-6.
   - `{type: 'error'}`: Return error response, still proceed to step 5 (log the failure).
5. **Log usage** -- Call `costTracker.logRequest()` with token counts, cost, timing, and fallback metadata.
6. **Deduct credits** -- Call `creditService.deductCredits()` with the calculated amount (0 for free models).
7. **Save message** -- Save the assistant message to the database (unchanged from current behavior).

### Streaming Endpoint (`/api/llm/stream`)

The streaming endpoint changes:

1. Call `llmRouter.executeWithFallback()` with `stream: true`.
2. The router handles pre-stream fallback internally (buffering until first chunk).
3. Once a provider starts streaming, the response is piped to the client as before.
4. On fallback consent needed: send SSE event:
   ```
   event: fallback_required
   data: {"from": "zen", "to": "openrouter", "estimatedCredits": 42}
   ```
5. On mid-stream failure: router sends SSE error event:
   ```
   event: provider_error
   data: {"error": "Provider connection lost", "providerId": 2}
   ```
6. After stream completes, accumulate total token usage from the response and call `costTracker.logRequest()` and `creditService.deductCredits()`.

### JSON Endpoint (`/api/llm/chat`)

For non-streaming requests, the fallback consent is returned as a JSON response:

```json
{
  "fallbackRequired": true,
  "from": { "provider": "zen", "model": "kimi-k2.5" },
  "to": { "provider": "openrouter", "model": "anthropic/claude-3.5-sonnet" },
  "estimatedCredits": 42
}
```

The frontend can then re-send with `preferredProvider` in the body.

### OpenAI-Compatible Endpoint (`/v1/chat/completions`)

This endpoint follows the same pattern. It parses the OpenAI-format request, delegates to `executeWithFallback()`, and returns an OpenAI-format response. The `preferredProvider` can be passed as an extra field in the request body (non-standard but harmless).

### Brainstorm Mode

Brainstorm mode calls the LLM twice per round with two different models. Each call goes through `executeWithFallback()` independently. No special handling is needed -- each model resolves its own provider chain. Credits are deducted per model output as before.

### Request Body Changes

Add an optional `preferredProvider` field (integer, provider ID) to the request body schema for all LLM endpoints. This is used by the frontend when the user consents to a fallback provider switch.
