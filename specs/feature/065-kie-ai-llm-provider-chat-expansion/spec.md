# 065 - Kie.ai LLM Provider Chat Expansion

Version: 1.0
Date: 2026-03-31
Status: Proposed
Depends-on: 032 (Responses API), 041 (Admin model catalog), 059 (multi-provider expansion pattern)

---

## 1. Executive summary

This feature adds Kie.ai to the LLM provider admin and routing stack for chat-oriented model families requested by the product team:

- GPT 5.4
- Claude Haiku 4.5
- Claude Opus 4.5
- Claude Opus 4.6
- Claude Sonnet 4.5
- Claude Sonnet 4.6
- GPT Codex family
- Gemini 3 Flash
- Gemini 3 Pro
- Gemini 3.1 Pro

The main design constraint is that Kie.ai is not a single-style provider:

- GPT 5.4 and Codex use `responses`
- Claude uses `messages`
- Gemini uses OpenAI-style `chat/completions`, but with model-specific URL paths

The current admin catalog assumes one default `apiStyle` per provider, so Kie.ai requires a per-model catalog metadata upgrade before routing can be configured safely. This feature also needs a richer model-level input contract, similar to how media models define their real inputs.

## 2. Problem statement

The current codebase can already store mixed API styles in `model_provider_map`, but it cannot represent one provider with mixed styles before mappings exist. That creates three concrete failures for Kie.ai:

1. Admin catalog rows for unmapped Kie models would display the wrong `apiStyle`.
2. Kie Claude needs Anthropic-style request bodies, but request transformation is chosen by provider name instead of resolved `apiStyle`.
3. Kie Gemini and Kie responses models need Kie-specific URL paths that the current resolver cannot derive.
4. There is no structured place to describe model-specific inputs, passthrough fields, or parameter conflicts.

## 3. Goals

### 3.1 Admin provider support

- Add a Kie.ai provider template in `admin/llm-providers`
- Keep provider naming consistent with the existing media provider slug: `kie_ai`
- Surface Kie models in the admin model catalog with correct per-model route semantics

### 3.2 Routing support

Support these Kie upstream paths:

| Family | Upstream path pattern | Request shape |
|---|---|---|
| GPT 5.4 | `/codex/v1/responses` | responses-style |
| Codex | `/api/v1/responses` | responses-style |
| Claude | `/claude/v1/messages` | Anthropic messages-style |
| Gemini | `/<model>/v1/chat/completions` | OpenAI chat-completions style |

### 3.3 Safe rollout

- Provider and mappings should be conservative by default
- Responses-only models must not be silently used by generic chat routes
- Pricing should not be guessed from unstable docs

### 3.4 Per-model input contract

The feature must also support model-level request configuration detailed enough to represent documented Kie inputs such as:

- `reasoning`
- `tools`
- `tool_choice`
- `thinkingFlag`
- `stream`
- `include_thoughts`
- `reasoning_effort`
- `response_format`
- `output_config`
- multimodal `messages`
- structured `input`

### 3.5 Safety defaults

The safest fit for this feature is:

- keep auth strategy provider-bound, not request-format-bound
- allow only relative model endpoint paths and validated relative templates
- expand endpoint placeholders only from resolved catalog or mapping values, never caller input
- forward only allowlisted Kie request fields and reject unknown top-level extras
- validate documented field conflicts before upstream calls
- reject non-responses models from `/v1/responses`
- reject responses-only models from `/v1/chat/completions`
- support Claude streaming in the rollout only after SSE normalization ships with tests
- bill from normalized usage, never by guessing how `credits_consumed` should convert

## 4. Requested Kie model set

### 4.1 Model manifest

| Provider model ID | Display name | API style | Family |
|---|---|---|---|
| `gpt-5-4` | GPT 5.4 | `responses` | GPT |
| `claude-haiku-4-5` | Claude Haiku 4.5 | `messages` | Claude |
| `claude-opus-4-6` | Claude Opus 4.6 | `messages` | Claude |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | `messages` | Claude |
| `claude-opus-4-5` | Claude Opus 4.5 | `messages` | Claude |
| `claude-sonnet-4-5` | Claude Sonnet 4.5 | `messages` | Claude |
| `gpt-5-codex` | GPT 5 Codex | `responses` | Codex |
| `gpt-5.1-codex` | GPT 5.1 Codex | `responses` | Codex |
| `gpt-5.2-codex` | GPT 5.2 Codex | `responses` | Codex |
| `gpt-5.3-codex` | GPT 5.3 Codex | `responses` | Codex |
| `gemini-3-flash` | Gemini 3 Flash | `chat-completions` | Gemini |
| `gemini-3-pro` | Gemini 3 Pro | `chat-completions` | Gemini |
| `gemini-3.1-pro` | Gemini 3.1 Pro | `chat-completions` | Gemini |

### 4.2 Capability expectations

The spec only assigns capabilities that are directly supported by the Kie docs in scope.

| Family | Capability expectations |
|---|---|
| GPT 5.4 / Codex | `supportsResponses`, `supportsVision`, `supportsThinking`, `supportsWebSearch`, `supportsFunctionTools` |
| Claude | `supportsFunctionTools`, `supportsThinking` |
| Gemini | `supportsVision`, `supportsThinking`, `supportsWebSearch`, `supportsFunctionTools`, `supportsStructuredOutputs` |

### 4.3 Documented input matrix

This matrix is intentionally conservative. It lists inputs explicitly surfaced by the Kie docs or request examples reviewed for this spec.

| Model group | Documented inputs in scope | Notable per-model notes |
|---|---|---|
| `gpt-5-4` | `input`, `tools`, `tool_choice`, `reasoning`, `stream` | responses-style payload |
| `gpt-5-codex`, `gpt-5.1-codex`, `gpt-5.2-codex`, `gpt-5.3-codex` | `input`, `tools`, `tool_choice`, `reasoning`, `stream` | responses-style payload |
| `claude-haiku-4-5`, `claude-opus-4-5`, `claude-opus-4-6`, `claude-sonnet-4-6` | `messages`, `tools`, `thinkingFlag`, `stream` | Anthropic-style payload on Kie Bearer auth |
| `claude-sonnet-4-5` | `messages`, `tools`, `thinkingFlag`, `stream`, `output_config` | only page in scope that explicitly shows structured output config |
| `gemini-3-flash`, `gemini-3.1-pro` | `messages`, `tools`, `stream`, `include_thoughts`, `reasoning_effort` | model-specific `/<model>/v1/chat/completions` path |
| `gemini-3-pro` | `messages`, `tools`, `stream`, `include_thoughts`, `reasoning_effort`, `response_format` | page explicitly documents `response_format` conflict rules |

## 5. Architecture changes

### 5.1 Provider catalog metadata upgrade

Extend the TypeScript and Zod modeling for `llmProviders.availableModels` so each entry may include:

- `apiStyle`
- capability flags already supported by `model_provider_map`
- `config`

No database migration is required for the JSON column itself. This is a TypeScript contract and router validation upgrade.

### 5.1a LLM request config, inspired by media models

Use the media-model design pattern as the reference. Each LLM catalog entry should be able to carry:

```ts
config: {
  requestBodyFormat: "responses" | "anthropic-messages" | "openai-chat-completions";
  apiEndpoint?: string;
  apiEndpointTemplate?: string;
  authStrategy?: "provider-default";
  supportsStreaming?: boolean;
  inputFields?: Array<{
    key: string;
    label: string;
    type: "boolean" | "number" | "text" | "select" | "json" | "messages" | "input" | "tools";
    required?: boolean;
    documented?: boolean;
    default?: string | number | boolean;
    options?: Array<{ value: string; label: string }>;
    description?: string;
  }>;
  passthroughFields?: string[];
  conflicts?: Array<{ type: "xor"; fields: string[] }>;
}
```

This gives the LLM side the same core benefits media models already have:

- explicit per-model endpoint semantics
- explicit per-model inputs
- explicit per-model conflict rules

Safety constraints for this config:

- `apiEndpoint` and `apiEndpointTemplate` must be provider-relative paths beginning with `/`
- absolute URLs, schemes, and hostnames are forbidden
- template expansion must be limited to validated values such as `providerModelId`
- placeholder values must come from the resolved catalog or mapping row, never caller input
- `authStrategy` defaults to `provider-default` and must never infer provider headers from `requestBodyFormat`

### 5.2 Admin catalog merge logic

Update the admin catalog merge path so it:

- reads per-model `apiStyle` from `availableModels`
- reads capability hints from `availableModels`
- falls back to provider-level defaults only when the catalog row does not provide them

This prevents Kie models from being mislabeled before they are mapped.

### 5.3 Kie URL resolver rules

Add an explicit `kie_ai` branch in `resolveApiUrl()`:

- `messages` -> `/claude/v1/messages`
- `responses` + `gpt-5-4` -> `/codex/v1/responses`
- `responses` + codex family -> `/api/v1/responses`
- `chat-completions` + gemini family -> `/<providerModelId>/v1/chat/completions`

Set the provider base URL to `https://api.kie.ai` so the URL builder can compose the correct path family.

### 5.4 Request transformation rules

#### Claude on Kie

When `apiStyle = messages`, use Anthropic-style request formatting regardless of provider name:

- separate system content
- `messages`
- `tools`
- `stream`
- optional `thinkingFlag`
- optional `output_config` where the model config documents it

Authentication remains Bearer because that is how Kie documents auth.

#### Gemini on Kie

Keep OpenAI-style chat payloads, but preserve Kie-specific fields:

- `include_thoughts`
- `reasoning_effort`
- `response_format`
- `tools`
- `stream`
- multimodal `messages[].content[]`

Gemini model config should also capture the documented conflicts:

- Google Search XOR Function Calling
- `response_format` XOR function-calling tools

#### GPT/Codex on Kie

Use the existing `/v1/responses` infrastructure and permit `reasoning` in the sanitized request body.

Kie responses config should include the documented request fields:

- `input`
- `tools`
- `tool_choice`
- `reasoning`
- `stream`

Forwarding policy for all Kie families:

- top-level request forwarding is deny-by-default
- only canonical route fields plus `config.passthroughFields` may be sent upstream
- unknown top-level Kie request fields must be rejected with deterministic 4xx errors
- routing and admin metadata must never be forwardable

### 5.5 Response normalization

Before any billing, credit accounting, or audit logic uses upstream output, normalize family-specific usage into shared fields:

- `normalizedInputTokens`
- `normalizedOutputTokens`
- `normalizedTotalTokens`
- optional `providerReportedCostUsd`
- optional `providerReportedCreditsConsumed`

Family rules:

- GPT 5.4 / Codex:
  - normalize responses-style usage
  - keep `credits_consumed` as provider metadata unless a validated conversion rule exists
- Claude:
  - normalize Anthropic-style `usage.input_tokens` and `usage.output_tokens`
- Gemini:
  - reuse existing chat-completions usage parsing where compatible after Kie-specific passthrough and conflict validation are in place

Normalization boundary:

- every Kie upstream response must be normalized before credit accounting, audit logging, or cost tracking consumes it
- downstream consumers should read normalized fields, not raw provider-specific usage keys

Billing precedence:

1. Trusted provider-reported USD cost, if explicitly validated
2. Otherwise normalized usage against local pricing in `model_provider_map`
3. Otherwise keep the model disabled

## 6. Guardrails

### 6.1 Route-family guards

If `/v1/chat/completions` resolves to a `responses` mapping, fail fast with a clear client error instructing the caller to use `/v1/responses`.

If `/v1/responses` resolves to a non-`responses` mapping, fail fast with a clear client error instead of trying to reinterpret Claude or Gemini payloads.

This is preferable to silently sending the wrong payload family to the wrong upstream endpoint.

### 6.2 Conflict validation

`config.conflicts` is mandatory validation metadata, not passive documentation.

The gateway must reject documented invalid combinations before:

- any upstream fetch
- any reservation or billing side effect

Minimum conflict rules in scope:

- responses families: web-search tools XOR function-calling tools
- Gemini family: Google Search XOR Function Calling
- Gemini family: `response_format` XOR function-calling tools

Claude streaming policy for the first rollout:

- request metadata may still document `stream`
- runtime support for Claude `stream=true` is enabled only when SSE event normalization is implemented and tested
- GPT/Codex and Gemini streaming remain in scope

### 6.3 Pricing and billing

Kie's own getting-started documentation says pricing lives on a separate page and may change. Therefore this feature should not hardcode guessed pricing data from unstable docs.

Accepted rollout approaches:

- provider seeded disabled with catalog metadata only
- mappings inserted disabled by default until pricing is confirmed from the current Kie pricing page

### 6.4 Enablement

Do not make Kie the default active provider in this feature.

### 6.5 Security posture

- Do not derive auth headers from `requestBodyFormat`.
- Do not allow absolute model endpoint URLs.
- Do not allow endpoint placeholders to expand from caller-supplied values.
- Reject unknown top-level Kie request fields instead of best-effort passthrough.
- Validate model-config conflicts before upstream fetch.
- Keep `credits_consumed` as metadata unless an explicit validated conversion is added later.

## 7. File-level scope

### Server

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/routers/multiProvider.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/drizzle/seed.ts`
- `apps/web/scripts/seed-multi-provider.ts`
- `apps/web/scripts/seed-kie-ai-provider.ts`

### Client

- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
- `apps/web/client/src/components/admin/multiProviderAdminModelMappings.ts`

### Tests

- `apps/web/server/routers/llmProviders.test.ts`
- `apps/web/server/routers/multiProvider.test.ts`
- `apps/web/server/seed.test.ts`
- existing llm route / responses route tests near `_core`

## 8. Acceptance criteria

- Kie.ai appears as an LLM provider template in admin.
- The Kie model catalog contains the 13 requested model IDs.
- Unmapped Kie catalog rows display correct per-model API styles.
- Unmapped Kie catalog rows can also carry model-level request config metadata.
- Kie Claude routes and payloads work through the messages path.
- Kie Gemini routes work through the Kie model-specific chat-completions paths.
- Kie GPT 5.4 and Codex routes work through `/v1/responses` and preserve `reasoning`.
- The spec defines how documented inputs such as `reasoning`, `tools`, `tool_choice`, `thinkingFlag`, `stream`, `include_thoughts`, `reasoning_effort`, `response_format`, and `output_config` are represented per model.
- Generic chat routes reject Kie responses-only models instead of misrouting them.
- `/v1/responses` rejects Kie Claude and Gemini models instead of misrouting them.
- Endpoint config is constrained to relative paths or validated relative templates only.
- Usage and billing normalization are defined for Kie responses, Claude, and Gemini families.
- Unknown Kie top-level request fields are rejected unless explicitly allowlisted by model config.
- Claude streaming is enabled only with SSE normalization and dedicated tests.
- Existing non-Kie providers are unaffected.

## 9. Sources

- Kie GPT 5.4 docs: `https://docs.kie.ai/market/chat/gpt-5-4`
- Kie Claude docs:
  - `https://docs.kie.ai/market/claude/claude-haiku-4-5`
  - `https://docs.kie.ai/market/claude/claude-opus-4-6`
  - `https://docs.kie.ai/market/claude/claude-sonnet-4-6`
  - `https://docs.kie.ai/market/claude/claude-opus-4-5`
  - `https://docs.kie.ai/market/claude/claude-sonnet-4-5`
- Kie Codex docs: `https://docs.kie.ai/market/codex/gpt-codex`
- Kie Gemini docs:
  - `https://docs.kie.ai/market/gemini/gemini-3-flash`
  - `https://docs.kie.ai/market/gemini/gemini-3-pro`
  - `https://docs.kie.ai/market/gemini/gemini-3-1-pro`
- Kie getting started:
  - `https://docs.kie.ai/`
  - `https://kie.ai/getting-started`
