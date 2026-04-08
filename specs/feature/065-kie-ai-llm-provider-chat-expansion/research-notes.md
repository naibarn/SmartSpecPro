## Codebase scan

### Existing provider admin flow

- `apps/web/server/routers/llmProviders.ts`
  - Owns provider templates and admin CRUD for `llm_providers`.
  - `PROVIDER_TEMPLATES` currently supports single-style providers such as `openai`, `anthropic`, `google`, and `knplabai`.
- `apps/web/server/routers/multiProvider.ts`
  - Builds the admin model catalog from `llmProviders.availableModels` plus `model_provider_map`.
  - `defaultApiStyleForProvider(providerName)` assumes one default API style per provider.
  - Unmapped catalog rows inherit `apiStyle` from the provider-level default, which is not sufficient for a provider like Kie.ai that mixes `responses`, `messages`, and `chat-completions`.
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
  - Already shows model mappings, inline priority editing, and enables unmapped catalog rows through `bulkSetAdminModelCatalogEnabled`.
- `apps/web/drizzle/schema.ts`
  - `llmProviders.availableModels` is JSON-typed but only modeled in TypeScript as `{ id, name, contextLength?, pricing? }`.
  - `modelProviderMap` already supports `apiStyle`, `supportsVision`, `supportsThinking`, `supportsWebSearch`, `supportsFunctionTools`, `supportsStructuredOutputs`, and `supportsResponses`.
  - There is no media-style per-model LLM request config contract yet.

### Existing routing behavior

- `apps/web/server/_core/llmRoutes.ts`
  - `resolveApiUrl(baseUrl, modelId, providerName, apiStyle?)` supports:
    - `responses`
    - `messages`
    - `gemini`
    - `chat-completions`
  - The current logic still assumes endpoint shape can be derived from provider name plus generic API style.
  - `transformRequestBody()` branches by provider name, not by resolved `apiStyle`.
  - Auth/header selection is still effectively provider-derived today, which is correct for Kie and should remain separate from request-body format selection.
  - `extractOpenAIFields()` does not pass through Gemini-specific request fields such as `include_thoughts` or `reasoning_effort`.
- `apps/web/server/_core/responsesRoutes.ts`
  - `/v1/responses` already exists for responses-style models.
  - `sanitizeResponsesBody()` currently allows only a narrow set of fields and does not include `reasoning`.
  - The responses handling path is also the natural place to normalize family-specific usage fields before billing and audit logic consume them.

### Existing spec patterns

- `specs/feature/059-knplabai-multi-provider-expansion/`
  - Best match for a multi-provider expansion feature touching admin catalog plus routing.
- `specs/feature/041-IntelligentSkillModelSelection/`
  - Relevant for admin catalog behavior and per-model metadata.
- `specs/feature/032-Browser-Automation-Copilot/`
  - Relevant because it established `responses` API handling and GPT-5.x routing.

## Kie.ai web research

### Stable provider-level facts

- Kie docs position the API base URL as `https://api.kie.ai`, and the getting-started guide explicitly says pricing is maintained on a separate pricing page that may change over time.
- This supports a conservative design where pricing is not auto-invented from static assumptions when the Kie docs page for each model does not embed stable numeric prices.

Source:

- `https://docs.kie.ai/`
- `https://kie.ai/getting-started`

### GPT 5.4

Source:

- `https://docs.kie.ai/market/chat/gpt-5-4`

Observed:

- Page title: `GPT 5.4 (response)`.
- Endpoint shown: `POST /codex/v1/responses`.
- Request example uses:
  - `model: "gpt-5-4"`
  - `input` array, not OpenAI chat `messages`
  - `tools`
  - `reasoning.effort`
- Page explicitly says web search and function calling are mutually exclusive.
- Response example returns `output[]`, `usage`, `credits_consumed`, and `status`.

Implication:

- This model belongs in `apiStyle = responses`.
- Standard `/v1/chat/completions` callers cannot use it safely without a translation layer or a guardrail that redirects them to `/v1/responses`.
- The documented request surface includes `input`, `tools`, `reasoning`, and `stream`.
- The page heading explicitly references `tool_choice`, so the spec should treat it as a supported compatibility field for this family.
- The documented response shape includes `credits_consumed`, but that should be stored as provider metadata unless a validated billing conversion is introduced.
- Usage emitted by this family should be normalized before local pricing, credit, or analytics pipelines rely on it.

### Codex

Source:

- `https://docs.kie.ai/market/codex/gpt-codex`

Observed:

- Endpoint shown: `POST /api/v1/responses`.
- Page explicitly says the unified endpoint accepts one of:
  - `gpt-5-codex`
  - `gpt-5.1-codex`
  - `gpt-5.2-codex`
  - `gpt-5.3-codex`
- Request shape matches responses API:
  - `input`
  - `tools`
  - `reasoning.effort`

Implication:

- One doc page expands to four supported model IDs.
- They should be cataloged as Kie.ai responses-style models.
- The documented request surface again includes `input`, `tools`, `reasoning`, and `stream`, with the heading also referencing `tool_choice`.
- Response handling should follow the same normalization rule as GPT 5.4: normalize usage first and treat `credits_consumed` as metadata unless conversion is explicitly validated.

### Claude family

Sources:

- `https://docs.kie.ai/market/claude/claude-haiku-4-5`
- `https://docs.kie.ai/market/claude/claude-opus-4-6`
- `https://docs.kie.ai/market/claude/claude-sonnet-4-6`
- `https://docs.kie.ai/market/claude/claude-opus-4-5`
- `https://docs.kie.ai/market/claude/claude-sonnet-4-5`

Observed:

- Endpoint shown for all pages: `POST /claude/v1/messages`.
- Request examples use Anthropic-style payloads:
  - `model`
  - `messages`
  - `tools`
  - `input_schema`
  - optional `thinkingFlag`
  - optional `stream`
- `claude-sonnet-4-5` also shows `output_config` with JSON schema structure in the request example.
- Streaming notes mention Claude-native SSE event names such as `message_start`, `content_block_delta`, and `message_stop`.

Implication:

- Kie Claude models should use `apiStyle = messages`.
- Request transformation must be chosen from `apiStyle`, not only from provider name, because Kie auth uses Bearer but body shape is Anthropic-like.
- The config layer should allow per-model documented inputs because not every Claude page exposes the exact same optional fields.
- Claude usage fields follow Anthropic-style naming such as `usage.input_tokens` and `usage.output_tokens`, so response normalization is required before billing or analytics use them.

### Gemini family

Sources:

- `https://docs.kie.ai/market/gemini/gemini-3-flash`
- `https://docs.kie.ai/market/gemini/gemini-3-pro`
- `https://docs.kie.ai/market/gemini/gemini-3-1-pro`

Observed:

- Each page uses its own model-specific endpoint:
  - `/gemini-3-flash/v1/chat/completions`
  - `/gemini-3-pro/v1/chat/completions`
  - `/gemini-3.1-pro/v1/chat/completions`
- Request body is OpenAI chat-completions style, not native Google Gemini:
  - `messages`
  - multimodal content arrays using `type: "image_url"`
  - `tools`
  - `response_format`
  - `stream`
  - `include_thoughts`
  - `reasoning_effort`
- Docs say:
  - Google Search and function calling are mutually exclusive.
  - `response_format` and function calling are mutually exclusive.

Implication:

- These models should use `apiStyle = chat-completions`.
- `resolveApiUrl()` must construct a Kie-specific per-model chat-completions URL.
- `extractOpenAIFields()` must preserve the Kie Gemini extras that are currently stripped.
- The docs also expose real parameter-conflict rules that should live in config:
  - Google Search XOR Function Calling
  - `response_format` XOR function-calling tools
- Gemini is the closest family to existing chat-completions behavior, but the gateway still needs explicit passthrough and conflict enforcement before it is safe to enable.

## Media-model pattern to reuse

`apps/web/scripts/seed-media-models-kie-ai.ts` already stores rich per-model metadata through config JSON:

- endpoint / payload metadata
- `inputFields`
- model-specific operational settings
- conflict-sensitive pricing metadata

The LLM version does not need pricing formulas, but it does need the same design pattern:

- per-model endpoint metadata
- per-model input field definitions
- explicit passthrough allowlists
- explicit field-conflict rules

## Security and operational notes

- Kie pricing is documented as changeable on a separate pricing page, so this spec should not require hardcoded price numbers copied from unstable marketing pages.
- Kie responses-style and Claude-style models should not be silently selected by generic chat paths unless the gateway can produce the correct upstream request shape.
- Admin catalog must clearly show API style and routeability to avoid operational misconfiguration.

## Missing-but-required behavior for production safety

- Conflict metadata must become runtime validation, not passive documentation. Invalid combinations should be rejected before upstream fetches and before cost reservation.
- Model-level endpoint config must be constrained to provider-relative or allowlisted path templates only. Absolute URLs would create an avoidable SSRF footgun in admin-managed config.
- Mixed-family support needs explicit response normalization so billing, audit, and analytics can consume consistent usage fields across Kie responses, Claude, and Gemini families.

## Testing context

- `apps/web/package.json`
  - web tests run with `npm --prefix apps/web test`
  - the project uses `vitest run`
- Relevant existing test anchors already exist for this feature slice:
  - `apps/web/server/routers/llmProviders.test.ts`
  - `apps/web/server/routers/multiProvider.test.ts`
  - `apps/web/server/_core/llmRoutes.test.ts`
  - `apps/web/server/__tests__/responsesRoutes.test.ts`
  - `apps/web/server/seed.test.ts`
- Current test style patterns:
  - router tests lean on `vi.mock()` and direct procedure invocation rather than full app boot
  - `responsesRoutes.test.ts` uses `supertest`, env stubs, and mocked gateway dependencies
  - `_core/llmRoutes.test.ts` uses Express plus mocked global `fetch` for proxy behavior
- Implementation implication:
  - the safest test-first path is to extend existing files rather than invent a new harness
  - response-normalization tests likely belong near `responsesRoutes.test.ts` or a closely adjacent billing/audit test file, because that is where current response-shape assumptions already live
