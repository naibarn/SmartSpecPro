# Feature 065: Kie.ai LLM Provider Chat Expansion

## Objective

Add Kie.ai as a first-class LLM provider in the admin provider catalog and wire the web LLM gateway so the requested Kie chat models can be represented, configured, and routed correctly.

This feature extends the current multi-provider admin flow rather than creating a parallel Kie-only integration.

## Current-codebase fit

The repo already has the right building blocks:

- `llm_providers` for provider configuration
- `model_provider_map` for canonical model routing
- `MultiProviderAdmin` for admin catalog activation
- `/v1/chat/completions` and `/v1/responses` for two major gateway modes

The main missing piece is not storage. It is the inability to represent one provider whose catalog spans multiple API styles and multiple URL path families.

## In-scope outcomes

1. Add a Kie.ai provider template and admin CRUD support under `admin/llm-providers`.
2. Extend the provider catalog metadata so unmapped Kie models can carry per-model `apiStyle`, capability hints, and rich request config.
3. Add Kie-specific URL resolution rules for:
   - Kie GPT 5.4 responses path
   - Kie Codex responses path
   - Kie Claude messages path
   - Kie Gemini per-model chat-completions paths
4. Introduce an LLM request-config contract modeled after the media-model pattern.
5. Update request-shape handling so Kie Claude uses Anthropic-style payload transformation while still authenticating with Bearer credentials.
6. Pass through or validate documented Kie model inputs such as `reasoning`, `tools`, `tool_choice`, `thinkingFlag`, `stream`, `include_thoughts`, `reasoning_effort`, `response_format`, and `output_config`.
7. Extend responses-route sanitization so Kie GPT/Codex requests can preserve `reasoning` and `tool_choice`.
8. Add mandatory request-conflict validation and symmetric route-family guards before upstream calls.
9. Enforce allowlist-only request forwarding so unknown Kie top-level fields are rejected before upstream calls.
10. Normalize Kie family response usage for billing, audit, and analytics before enablement.
11. Seed or register the requested Kie model catalog entries in a disabled-by-default, rollout-safe way.

## Explicitly out of scope

- No Python backend changes.
- No Kie media model changes.
- No fully automatic Kie pricing synchronization.
- No generic chat-to-responses translation layer for all callers.

## Requested model catalog

The request references 10 Kie doc pages but expands to 13 concrete model IDs:

| Family | Model ID | API style | Notes |
|---|---|---|---|
| GPT | `gpt-5-4` | `responses` | Uses Kie responses payload with `input` and `reasoning.effort` |
| Claude | `claude-haiku-4-5` | `messages` | Kie Claude messages endpoint |
| Claude | `claude-opus-4-6` | `messages` | Kie Claude messages endpoint |
| Claude | `claude-sonnet-4-6` | `messages` | Kie Claude messages endpoint |
| Claude | `claude-opus-4-5` | `messages` | Kie Claude messages endpoint |
| Claude | `claude-sonnet-4-5` | `messages` | Kie Claude messages endpoint |
| Codex | `gpt-5-codex` | `responses` | Listed by Kie Codex page |
| Codex | `gpt-5.1-codex` | `responses` | Listed by Kie Codex page |
| Codex | `gpt-5.2-codex` | `responses` | Listed by Kie Codex page |
| Codex | `gpt-5.3-codex` | `responses` | Listed by Kie Codex page |
| Gemini | `gemini-3-flash` | `chat-completions` | Kie model-specific endpoint |
| Gemini | `gemini-3-pro` | `chat-completions` | Kie model-specific endpoint |
| Gemini | `gemini-3.1-pro` | `chat-completions` | Kie model-specific endpoint |

## Delivery phases

### Phase 1. Admin contract and catalog truthfulness

Goal:

- make unmapped Kie rows render truthfully in admin before any routing is enabled

Primary deliverables:

- widen `availableModels` typing and validation
- preserve model-level `apiStyle`, capability hints, and request config through admin APIs
- surface mixed-style Kie rows in admin catalog without requiring `model_provider_map`

Exit condition:

- admin tests prove Claude, Gemini, and GPT/Codex rows render with distinct `apiStyle` values while unmapped

### Phase 2. Route-family correctness and request validation

Goal:

- make gateway routing depend on resolved model family instead of provider-wide assumptions

Primary deliverables:

- Kie-specific URL resolution rules
- request-body transformation keyed by `apiStyle`
- conflict validation before upstream fetch
- symmetric entrypoint guards between `/v1/chat/completions` and `/v1/responses`
- allowlist-only forwarding for model-specific request fields

Exit condition:

- llm route and responses route tests prove each Kie family reaches only its intended upstream path family

### Phase 3. Response normalization and billing safety

Goal:

- make mixed-family responses observable and billable without relying on guessed conversions

Primary deliverables:

- normalized usage extraction for responses, Claude, and Gemini families
- explicit metadata capture for `credits_consumed`
- disable-or-block behavior for models lacking safe pricing or normalization
- one shared normalization boundary before billing, credits, and audit consumers

Exit condition:

- billing/audit tests prove no Kie family falls back to guessed cost math

### Phase 4. Seed, rollout, and operator safety

Goal:

- register Kie cleanly without accidentally enabling it in production traffic

Primary deliverables:

- `kie_ai` provider seed/helper
- disabled-by-default provider and mapping behavior
- operator checklist for API key, pricing verification, and family-by-family smoke tests

Exit condition:

- seed tests and rollout checks show Kie can exist in the catalog without becoming active implicitly

## Implementation approach

### 1. Provider metadata and admin catalog

Update the typed shape of `llmProviders.availableModels` and the related Zod inputs so catalog entries may optionally include:

- `apiStyle`
- `supportsVision`
- `supportsThinking`
- `supportsWebSearch`
- `supportsFunctionTools`
- `supportsStructuredOutputs`
- `supportsResponses`
- `config`
- optional routing notes if the implementation finds them useful in JSON only

Then update catalog merging so unmapped models inherit their metadata from the catalog row, not from a provider-wide default.

This is the key change that lets one provider expose:

- Claude as `messages`
- Gemini as `chat-completions`
- GPT/Codex as `responses`

without forcing the admin user to create the mapping before even seeing correct route semantics.

### 1.1 LLM request-config contract

Mirror the media-model approach at a lighter weight. Each LLM catalog entry should be able to carry:

- `requestBodyFormat`
- `apiEndpoint` or `apiEndpointTemplate`
- `supportsStreaming`
- `inputFields`
- `passthroughFields`
- `conflicts`

Recommended shape:

```ts
type LlmInputField = {
  key: string;
  label: string;
  type: "boolean" | "number" | "text" | "select" | "json" | "messages" | "input" | "tools";
  required?: boolean;
  documented?: boolean;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  description?: string;
};

type LlmRequestConfig = {
  requestBodyFormat: "responses" | "anthropic-messages" | "openai-chat-completions";
  apiEndpoint?: string; // relative path only
  apiEndpointTemplate?: string; // relative path template only
  authStrategy?: "provider-default";
  supportsStreaming?: boolean;
  inputFields?: LlmInputField[];
  passthroughFields?: string[];
  conflicts?: Array<{ type: "xor"; fields: string[] }>;
};
```

This lets the catalog describe real model behavior instead of only a display name and API style.

Security rule:

- `apiEndpoint` and `apiEndpointTemplate` must start with `/`.
- Absolute URLs, schemes, and hostnames are forbidden in model config.
- Template expansion is limited to validated placeholders such as `{providerModelId}`.
- Placeholder values must come from the resolved catalog or mapping row, never directly from caller input.
- Expanded placeholder values must match a safe provider-model-id pattern and an existing catalog entry.
- `authStrategy` should default to `provider-default` and must not be inferred from `requestBodyFormat`.

### 2. Kie endpoint routing

Add explicit Kie-specific branches in `resolveApiUrl()`:

- `providerName === "kie_ai"` and `apiStyle === "messages"`
  - route to `https://api.kie.ai/claude/v1/messages`
- `providerName === "kie_ai"` and `apiStyle === "responses"` and model `gpt-5-4`
  - route to `https://api.kie.ai/codex/v1/responses`
- `providerName === "kie_ai"` and `apiStyle === "responses"` and model in the codex family
  - route to `https://api.kie.ai/api/v1/responses`
- `providerName === "kie_ai"` and `apiStyle === "chat-completions"` and model in the Gemini family
  - route to `https://api.kie.ai/<providerModelId>/v1/chat/completions`

Do not attempt to generalize this into a free-form marketplace router in this feature. The scope is the Kie model set above.

### 3. Request-shape handling

Update request transformation so body shape follows resolved `apiStyle` and the model's request config where needed:

- `messages` style:
  - reuse Anthropic-style transformation rules even when provider name is `kie_ai`
  - keep Bearer auth for Kie
- `chat-completions` style:
  - keep OpenAI-compatible body
  - preserve Kie Gemini extensions:
    - `include_thoughts`
    - `reasoning_effort`
    - `response_format`
    - `tools`
    - `stream`
    - multimodal `messages[].content[]`
- `responses` style:
  - keep using `/v1/responses`
  - permit the documented responses fields:
    - `input`
    - `tools`
    - `tool_choice`
    - `reasoning`
    - `stream`

Forwarding policy:

- Kie request forwarding is deny-by-default at the top level
- only canonical route fields plus per-model `config.passthroughFields` may survive sanitization
- unknown top-level Kie request fields should be rejected with deterministic 4xx errors rather than silently dropped
- internal routing or admin-only metadata must never be forwardable through passthrough config

For safety, `/v1/chat/completions` should not silently forward a `responses` model. If a resolved mapping has `apiStyle = responses`, return a clear client error instructing the caller to use `/v1/responses`.

The reverse guard is also required: `/v1/responses` must reject models whose resolved `apiStyle` is `messages` or `chat-completions`.

### 3.1 Conflict validation

`config.conflicts` is mandatory runtime validation metadata, not passive documentation.

Implementation should:

- validate documented incompatible field combinations before upstream fetch
- reject invalid combinations with deterministic 4xx errors
- reject before cost reservation or provider budget accounting

Minimum Kie conflicts in scope:

- responses families: web-search tools XOR function tools
- Gemini family: Google Search XOR Function Calling
- Gemini family: `response_format` XOR function-calling tools

Streaming decision for the first safe rollout:

- GPT/Codex and Gemini streaming remain in scope because their transport shape is closest to existing gateway behavior
- Claude `stream=true` is in scope for this feature once explicit SSE event normalization and tests are added
- catalog metadata may document Claude `stream`, and rollout may enable it only together with that normalization work

### 3.2 Auth strategy

Auth remains provider-level runtime behavior while request formatting remains model-level behavior.

Best-fit choice for this feature:

- keep Bearer auth for all Kie families
- do not derive Anthropic-native headers from `requestBodyFormat = "anthropic-messages"`
- keep any future auth expansion explicit at provider config level rather than model catalog level

### 4. Model mapping strategy

Seed the Kie provider row with disabled-by-default catalog metadata. For `model_provider_map` rows, the safe default is:

- insert disabled mappings, or
- defer mapping insertion until the operator confirms pricing and enablement

The implementation should avoid shipping enabled Kie mappings with guessed prices.

Canonical model ID rules:

- For models that already exist as canonical IDs elsewhere in the system, reuse the same `modelId`.
- For models that are new to this repo, use the provider model ID as the canonical `modelId`.

Explicit alias / crosswalk table for this feature:

| Canonical model ID | Kie provider model ID |
|---|---|
| `gpt-5.4` | `gpt-5-4` |
| `claude-haiku-4-5` | `claude-haiku-4-5` |
| `claude-opus-4-6` | `claude-opus-4-6` |
| `claude-sonnet-4-6` | `claude-sonnet-4-6` |
| `claude-opus-4-5` | `claude-opus-4-5` |
| `claude-sonnet-4-5` | `claude-sonnet-4-5` |
| `gpt-5-codex` | `gpt-5-codex` |
| `gpt-5.1-codex` | `gpt-5.1-codex` |
| `gpt-5.2-codex` | `gpt-5.2-codex` |
| `gpt-5.3-codex` | `gpt-5.3-codex` |
| `gemini-3-flash` | `gemini-3-flash` |
| `gemini-3-pro` | `gemini-3-pro` |
| `gemini-3.1-pro` | `gemini-3.1-pro` |

Runtime rule:

- canonical model resolution must happen before endpoint templating or request shaping
- routing must always use the resolved mapping's `providerModelId`, not the caller-supplied `model` string directly

Recommended capability defaults:

- GPT 5.4 and Codex:
  - `supportsResponses = true`
  - `supportsVision = true`
  - `supportsThinking = true`
  - `supportsWebSearch = true`
  - `supportsFunctionTools = true`
- Claude family:
  - `supportsFunctionTools = true`
  - `supportsThinking = true`
- Gemini family:
  - `supportsVision = true`
  - `supportsThinking = true`
  - `supportsWebSearch = true`
  - `supportsFunctionTools = true`
  - `supportsStructuredOutputs = true`

Only mark a capability when the Kie docs in scope support it directly.

### 4.1 Family-specific documented inputs

Documented by the Kie pages and should be captured in per-model config:

- GPT 5.4 / Codex
  - `input`
  - `tools`
  - `tool_choice`
  - `reasoning`
  - `stream`
- Claude
  - `messages`
  - `tools`
  - `thinkingFlag`
  - `stream`
  - `output_config` for `claude-sonnet-4-5`
- Gemini
  - `messages`
  - `tools`
  - `stream`
  - `include_thoughts`
  - `reasoning_effort`
  - `response_format` where documented

These inputs should be stored per model, not only per provider family.

### 4.2 Response normalization and billing

Before any billing, audit, or analytics pipeline consumes upstream output, normalize family-specific usage into one shared internal shape.

Minimum normalized fields:

- `normalizedInputTokens`
- `normalizedOutputTokens`
- `normalizedTotalTokens`
- optional `providerReportedCostUsd`
- optional `providerReportedCreditsConsumed`

Family rules:

- Kie GPT 5.4 / Codex:
  - normalize responses-style usage
  - persist `credits_consumed` as provider metadata unless a validated USD conversion rule exists
- Kie Claude:
  - normalize Anthropic-style `usage.input_tokens` and `usage.output_tokens`
- Kie Gemini:
  - reuse existing chat-completions usage parsing where compatible, after passthrough and conflict validation are in place

Normalization boundary:

- add one shared helper, for example `normalizeLlmUsage(...)`, at the gateway response boundary
- every Kie upstream response must pass through that helper before `costTracker`, audit logging, credit accounting, or usage persistence run
- downstream services should consume normalized fields rather than reading raw provider payload shapes directly

Billing precedence:

1. trusted provider-reported USD cost, if explicitly documented and validated
2. normalized token counts combined with local `model_provider_map` pricing
3. keep model disabled if neither path is safe enough for production

## Suggested implementation order

1. Expand `availableModels` types, Zod schemas, and admin merge logic first.
2. Add Kie provider template plus disabled catalog entries next, because those tests give fast feedback on metadata fidelity.
3. Add Kie URL resolution and request-shape transformation after model config is available.
4. Add conflict validation and symmetric route guards before touching enablement.
5. Add response normalization and billing safety logic before any seed step can mark models ready.
6. Finish with seed wiring, rollout notes, and regression runs across the touched test files.

## Affected files and modules

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/routers/multiProvider.ts`
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/drizzle/seed.ts`
- `apps/web/scripts/seed-multi-provider.ts`
- `apps/web/scripts/seed-kie-ai-provider.ts`
- web test files adjacent to the modules above

## Risks and mitigations

- Risk: mixed API styles on one provider break admin catalog assumptions.
  - Mitigation: move catalog metadata to per-model `apiStyle`.
- Risk: Kie responses models are selected by generic chat callers.
  - Mitigation: reject them early from `/v1/chat/completions` with a precise error.
- Risk: guessed prices cause wrong credits.
  - Mitigation: keep Kie mappings disabled until pricing is entered from the current Kie pricing page.
- Risk: Kie Gemini fields are lost.
  - Mitigation: extend request-field allowlists explicitly.
- Risk: Kie model families expose different optional inputs.
  - Mitigation: store `config.inputFields`, `config.passthroughFields`, and `config.conflicts` per model.
- Risk: unknown request fields leak upstream or create undefined provider behavior.
  - Mitigation: use allowlist-only forwarding and reject unknown top-level fields with deterministic 4xx errors.
- Risk: model-config endpoint overrides create SSRF surface.
  - Mitigation: allow only relative endpoint paths and validated relative templates.
- Risk: mixed-family response usage is billed incorrectly.
  - Mitigation: normalize usage before billing and keep `credits_consumed` as metadata unless conversion is explicitly validated.
- Risk: non-responses families leak into `/v1/responses`.
  - Mitigation: add symmetric route-family guards on both chat and responses entrypoints.
- Risk: Claude streaming events do not match current gateway expectations.
  - Mitigation: ship Claude streaming only together with SSE normalization tests that cover text deltas, tool-use deltas, and usage extraction.

## Security and boundary concerns

- Keep API keys in `llmProviders.apiKeyEncrypted` only.
- Do not introduce SSRF exceptions for Kie beyond the explicit public base URL.
- Do not allow model config to specify absolute upstream URLs.
- Do not allow endpoint placeholders to expand from caller-supplied values.
- Do not infer auth headers from request-body format.
- Reject unknown top-level Kie request fields instead of best-effort passthrough.
- Do not pass internal routing fields upstream.
- Preserve the current `/v1/responses` guardrails such as feature flags and budget limits.
- Normalize usage before any billing or audit logic consumes upstream provider responses.

## Operator rollout checklist

1. Seed or create the `kie_ai` provider with `isEnabled = false`.
2. Confirm provider API key storage works through existing encrypted admin flows.
3. Enter or verify pricing from Kie's current pricing source before enabling any mapping.
4. Smoke-test one model per family:
   - Claude messages
   - Gemini chat-completions
   - one responses model
5. Verify `/v1/chat/completions` rejects Kie responses models and `/v1/responses` rejects Kie Claude/Gemini.
6. Verify usage audit output shows normalized token counters for each family before production enablement.

## Acceptance criteria

- Admin provider templates include a Kie.ai LLM provider.
- Admin catalog can display Kie models with correct per-model `apiStyle` before mapping exists.
- Admin catalog can also carry model-level request config metadata.
- Kie Claude requests resolve to `/claude/v1/messages` and use Anthropic-style bodies.
- Kie Gemini requests resolve to model-specific `/.../v1/chat/completions` paths and preserve Gemini-only request fields.
- Kie GPT 5.4 and Codex requests work through `/v1/responses` and preserve `reasoning`.
- The feature explicitly models documented inputs such as `reasoning`, `tools`, `tool_choice`, `thinkingFlag`, `stream`, `include_thoughts`, `reasoning_effort`, `response_format`, and `output_config`.
- Generic chat routes do not silently misroute responses-only Kie models.
- `/v1/responses` rejects Kie Claude and Gemini models instead of misrouting them.
- Endpoint config is explicitly constrained to relative paths or validated relative templates only.
- Usage normalization and billing precedence are defined for Kie responses, Claude, and Gemini families.
- Unknown Kie top-level request fields are rejected unless explicitly allowlisted by model config.
- Routing uses resolved `providerModelId` from catalog or mapping aliases, not raw caller model strings.
- Claude streaming is enabled only when SSE normalization and dedicated tests ship together.
- The requested Kie models are represented in the feature spec and catalog.

## Rollout notes

- Ship provider template and routing first.
- Seed provider disabled by default with rich catalog metadata.
- Enable selected models only after API key, pricing, and smoke tests pass.
