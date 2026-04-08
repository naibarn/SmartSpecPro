# TDD plan

## Test-first order

1. Admin catalog metadata tests
2. Per-model request-config tests
3. URL resolution tests
4. Request transformation tests
5. Responses sanitization tests
6. Response normalization and billing tests
7. Seed and provider-template tests
8. End-to-end router smoke tests

## TDD execution slices

### Slice A. Admin truthfulness before routing

Write first:

- `apps/web/server/routers/llmProviders.test.ts`
- `apps/web/server/routers/multiProvider.test.ts`

Target failure:

- Kie rows exist but lose per-model `apiStyle` or nested config in admin output

Implementation unlock:

- schema widening
- provider template metadata
- admin catalog merge correctness

### Slice B. Route-family correctness before passthrough expansion

Write next:

- `apps/web/server/_core/llmRoutes.test.ts`
- `apps/web/server/__tests__/responsesRoutes.test.ts`

Target failure:

- Kie families resolve to wrong endpoint family or silently cross over between chat and responses entrypoints

Implementation unlock:

- Kie URL resolver branches
- request transformation by resolved `apiStyle`
- symmetric route guards
- alias-resolved `providerModelId` routing

### Slice C. Validation and billing safety before enablement

Write next:

- negative tests for `config.conflicts`
- negative tests for unknown Kie top-level fields
- usage normalization tests near responses/billing audit coverage

Target failure:

- invalid field combinations reach upstream or billing assumes OpenAI-style usage everywhere

Implementation unlock:

- conflict enforcement
- response normalization
- disable-by-default behavior when pricing or normalization is unsafe

### Slice D. Seed and rollout safety

Write last:

- `apps/web/server/seed.test.ts`
- any provider-template or rollout smoke assertions needed after routing is stable

Target failure:

- provider or mappings become enabled implicitly, or seeded metadata loses requested model details

## Tests to add or update

### `apps/web/server/routers/llmProviders.test.ts`

- provider templates include `kie_ai`
- Kie template contains the 13 requested model IDs in `availableModels`
- each catalog entry includes the expected `apiStyle`

### `apps/web/server/routers/multiProvider.test.ts`

- `mergeAdminModelCatalogRows()` prefers `availableModels[n].apiStyle` over provider-level default
- `mergeAdminModelCatalogRows()` preserves model `config.inputFields`
- `mergeAdminModelCatalogRows()` preserves model `config.conflicts`
- unmapped Kie Claude rows appear as `messages`
- unmapped Kie Gemini rows appear as `chat-completions`
- unmapped Kie GPT/Codex rows appear as `responses`
- unmapped Kie rows carry capability hints when provided

### `apps/web/server/_core/llmRoutes` tests

- `resolveApiUrl("https://api.kie.ai", "claude-sonnet-4-6", "kie_ai", "messages")`
  - returns `/claude/v1/messages`
- `resolveApiUrl("https://api.kie.ai", "gpt-5-4", "kie_ai", "responses")`
  - returns `/codex/v1/responses`
- `resolveApiUrl("https://api.kie.ai", "gpt-5.2-codex", "kie_ai", "responses")`
  - returns `/api/v1/responses`
- `resolveApiUrl("https://api.kie.ai", "gemini-3.1-pro", "kie_ai", "chat-completions")`
  - returns `/gemini-3.1-pro/v1/chat/completions`
- canonical `modelId = "gpt-5.4"` resolves through alias mapping to Kie `providerModelId = "gpt-5-4"` before URL construction
- Kie Claude request transformation uses Anthropic-style `messages` payload even though provider is not `anthropic`
- Kie Claude auth/header selection stays on Kie Bearer auth, not Anthropic-native headers
- Kie Claude request transformation preserves `thinkingFlag`
- Kie Claude request transformation preserves `output_config` for models whose config allows it
- Kie Gemini passthrough preserves `include_thoughts` and `reasoning_effort`
- Kie Gemini passthrough preserves `response_format`
- unknown Kie top-level request fields are rejected rather than silently forwarded
- `/v1/chat/completions` rejects Kie `responses` models with a clear error
- `/v1/responses` rejects Kie `messages` and `chat-completions` models with a clear error
- Claude `stream=true` is covered by SSE normalization tests before runtime enablement

### `apps/web/server/__tests__/responsesRoutes.test.ts`

- `sanitizeResponsesBody()` preserves `reasoning`
- `sanitizeResponsesBody()` preserves `tool_choice`
- Kie responses requests keep `tools` and `reasoning`
- Kie responses requests still force `store = false`
- conflict combinations are rejected before upstream fetch
- Kie responses requests reject unknown top-level fields that are not allowlisted

### Response normalization / billing tests

- Kie responses payload normalizes usage fields into shared token counters
- Claude payload normalizes `usage.input_tokens` and `usage.output_tokens`
- `credits_consumed` is stored as metadata only unless a validated conversion rule exists
- normalized usage is what billing/audit consumers read, not raw provider payload fields
- models without safe pricing or normalization remain disabled by default

### `apps/web/server/seed.test.ts`

- `seedKieAiProvider()` creates or upserts the `kie_ai` provider row
- Kie provider is disabled by default unless explicitly configured otherwise
- seed remains idempotent

## Suggested command loop

- `npm --prefix apps/web test -- server/routers/llmProviders.test.ts server/routers/multiProvider.test.ts`
- `npm --prefix apps/web test -- server/_core/llmRoutes.test.ts server/__tests__/responsesRoutes.test.ts`
- `npm --prefix apps/web test -- server/seed.test.ts`
- final focused rerun of every touched Kie-related test file before implementation handoff

## Expected first failures

- Type errors because `availableModels` JSON shape is too narrow
- admin catalog tests failing because per-model `apiStyle` is ignored
- request-config tests failing because catalog config is stripped or not typed
- URL resolution tests failing because Kie-specific branches do not exist
- responses sanitization test failing because `reasoning` is stripped
- normalization tests failing because current usage parsing assumes OpenAI chat-style accounting

## Regression checks

- Existing OpenAI, Anthropic, Google, and KNPLabs provider behavior remains unchanged
- existing responses-route feature-flag behavior remains unchanged
- current admin priority editing and bulk enable flows keep working for legacy providers
- billing and audit paths remain stable for non-Kie providers

## Fixtures and mocking notes

- Prefer unit tests for URL resolution and transformation logic
- Mock DB reads in router tests the same way current `multiProvider.test.ts` already does
- Avoid network calls in seed tests; assert on generated insert/update payloads or mocked DB usage
- Reuse existing `responsesRoutes.test.ts` helpers for mocked provider resolution, feature flags, and gateway credit flows instead of creating a parallel harness
