# Section 03: Kie Endpoint Routing and Request Shapes

## Purpose

Make the LLM gateway generate the correct upstream URL and payload shape for each Kie model family.

## Ownership

- `resolveApiUrl()`
- request transformation / passthrough
- `/v1/chat/completions` and `/v1/responses` guardrails for Kie

## Target files

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`

## Implementation notes

### URL rules

Add an explicit `providerName === "kie_ai"` branch with the following behavior:

- `apiStyle === "messages"` -> `/claude/v1/messages`
- `apiStyle === "responses"` and `model === "gpt-5-4"` -> `/codex/v1/responses`
- `apiStyle === "responses"` and codex family -> `/api/v1/responses`
- `apiStyle === "chat-completions"` and gemini family -> `/<model>/v1/chat/completions`

Use the provider base URL `https://api.kie.ai`.

Template safety rule:

- gemini path expansion must use the resolved mapping or catalog `providerModelId`
- never expand endpoint templates from raw caller input
- resolved provider model IDs must match a safe catalog-backed identifier before path construction

### Request transformation

1. Make request transformation sensitive to resolved `apiStyle` and model config where required:
   - `messages` should produce Anthropic-style payloads even for `kie_ai`
   - `chat-completions` should preserve OpenAI-compatible shape
   - `responses` stays in the dedicated responses route
   - auth selection must remain provider-bound, so Kie Claude still uses Bearer auth rather than Anthropic-native headers

2. Extend OpenAI-field extraction for Kie Gemini so the following are not stripped:
   - `include_thoughts`
   - `reasoning_effort`
   - `response_format`
   - any explicit compatibility passthrough fields from model config

3. Extend responses sanitization so the documented fields are preserved for Kie GPT/Codex:
   - `reasoning`
   - `tool_choice`

4. Apply deny-by-default forwarding for Kie requests:
   - only canonical route fields plus `config.passthroughFields` may be sent upstream
   - unknown top-level fields must trigger deterministic 4xx validation errors
   - internal routing metadata must never pass through

### Guardrail

If a generic chat request resolves to a Kie `responses` mapping, return a clear 4xx error telling the caller to use `/v1/responses`.

If `/v1/responses` resolves to a Kie model whose `apiStyle` is `messages` or `chat-completions`, return a clear 4xx error instead of attempting cross-family translation.

If Claude `stream=true` is requested, the gateway may proxy it only after SSE event normalization is implemented and shipped with tests.

## TDD expectations

- Write URL resolution tests before touching router code.
- Write one request-shape test for Kie Claude and one passthrough test for Kie Gemini before implementation.
- Add a responses-route sanitization test for `reasoning`.
- Add a negative test proving `/v1/responses` rejects Kie Claude or Gemini mappings.
- Add a negative test proving unknown Kie top-level fields are rejected.
- Add streaming tests proving Claude SSE normalizes into OpenAI-compatible chunks for text deltas, tool-use deltas, and terminal finish reasons.

## Acceptance checks

- Kie Claude payloads are messages-style with Bearer auth.
- Kie Gemini keeps `include_thoughts`, `reasoning_effort`, and `response_format`.
- Kie GPT/Codex preserve `reasoning` through `/v1/responses`.
- Generic chat does not misroute Kie responses-only models.
- `/v1/responses` does not accept Kie Claude or Gemini models.
- Unknown Kie top-level request fields do not pass upstream.
- Claude streaming is normalized into OpenAI-compatible SSE only when explicit tests cover the supported event set.

## Risks

- The existing streaming parser has provider-specific assumptions. Support only the explicitly tested Claude event set and treat new event families as follow-up work until tests are added.
