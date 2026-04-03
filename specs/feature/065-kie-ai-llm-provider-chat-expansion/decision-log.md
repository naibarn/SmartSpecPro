## Planning depth

- Decision: `standard`
- Why:
  - The work is limited to web admin/catalog/routing, but it spans several coordinated files and needs explicit guardrails for mixed API styles.
  - It does not justify a full deep-plan promotion because it stays inside one subsystem family and does not introduce migrations with risky data backfills.

## Key design decisions

### D1. Create a new feature directory under `specs/feature/065-kie-ai-llm-provider-chat-expansion`

- Rationale:
  - The requester explicitly asked for a new or extended feature spec under `specs/feature`.
  - This keeps the Kie LLM expansion distinct from the broader KNPLabs feature while still referencing it.

### D2. Use `providerName = "kie_ai"` for the LLM provider row

- Rationale:
  - The repository already uses `kie_ai` for media provider naming.
  - Reusing the same slug reduces admin confusion and makes future icon/label reuse simpler.

### D3. Do not model Kie.ai as a single-default-style provider

- Decision:
  - Extend `availableModels` metadata so each catalog entry can carry `apiStyle`, capability hints, and rich per-model request config.
  - Make admin catalog merging prefer model-level `apiStyle` instead of provider-level defaults.
- Rationale:
  - Kie mixes at least three endpoint families in this request:
    - `responses`
    - `messages`
    - `chat-completions`

### D3b. Reuse the media-model config pattern for LLMs

- Decision:
  - Add an LLM `config` contract inspired by media models.
  - Keep the first version inside `llmProviders.availableModels` instead of adding a new table in this feature.
- Minimum config fields:
  - `requestBodyFormat`
  - `apiEndpoint` or `apiEndpointTemplate`
  - `inputFields`
  - `passthroughFields`
  - `conflicts`
- Rationale:
  - The user explicitly asked for model-level input support similar to media models.
  - Current hardcoded LLM allowlists are too narrow for Kie's documented inputs.

### D3c. Keep auth strategy provider-bound, not body-format-bound

- Decision:
  - `requestBodyFormat` controls payload transformation only.
  - Auth headers remain derived from provider identity and provider configuration.
  - For this feature, all Kie model families continue to use Bearer auth even when the request body is Anthropic-style.
- Rationale:
  - Kie Claude uses Anthropic-style request bodies but not Anthropic-native authentication headers.
  - Tying auth to body format would create subtle breakage and make mixed-style providers harder to reason about safely.

### D4. Support Kie GPT/Codex through `/v1/responses`, not generic chat auto-translation

- Decision:
  - The spec keeps responses-style models as responses-native.
  - Generic `/v1/chat/completions` should reject `apiStyle = responses` mappings with a clear error unless a future feature adds explicit translation.
- Rationale:
  - The existing codebase already has a dedicated responses proxy.
  - Silent chat-to-responses translation would enlarge scope and create new compatibility questions outside this request.

### D5. Pricing is deferred, but not ignored

- Decision:
  - Seed Kie provider catalog metadata and routing support now.
  - Treat exact price numbers as implementation-time data entry from Kie's current pricing page, because Kie explicitly documents pricing as changeable.
- Rationale:
  - The model pages in scope do not provide stable numeric pricing.
  - Hardcoding guessed or stale price numbers would make the spec less safe.

### D6. Enablement should be conservative by default

- Decision:
  - Provider row can exist disabled by default.
  - Model mappings should be disabled by default until API key, pricing, and rollout validation are complete.
- Rationale:
  - Prevents generic model selection from drifting into a partially wired provider.

### D7. Model-level endpoint config must stay relative-path only

- Decision:
  - `config.apiEndpoint` and `config.apiEndpointTemplate` may store only provider-relative paths or tightly-scoped relative templates.
  - Full URLs, schemes, and arbitrary hosts are out of scope for this feature.
- Rationale:
  - Admin-editable endpoint config should not become an SSRF escape hatch.
  - Kie's documented routes are fixed path families under one provider base URL, so relative-path-only config is the safest adequate design.

### D8. Normalize family-specific responses before billing

- Decision:
  - Response handling must normalize upstream usage into one internal shape before billing, credits, or analytics logic uses it.
  - Billing precedence should be:
    1. trusted provider-reported USD cost, if such a field exists and is explicitly validated
    2. normalized usage plus local `model_provider_map` pricing
    3. disabled rollout when neither path is safe
- Rationale:
  - Kie responses families expose `credits_consumed`, while Claude uses Anthropic-style usage keys.
  - Without normalization, the same provider rollout could undercount or miscount usage across model families.

## Risks that still need explicit implementation attention

- `transformRequestBody()` currently keys off provider name, which is insufficient for Kie Claude.
- `resolveApiUrl()` currently cannot express Kie's mixed and model-specific paths.
- `responsesRoutes.sanitizeResponsesBody()` strips `reasoning`, which Kie GPT/Codex examples use.
- Admin catalog currently cannot represent mixed-style unmapped models from a single provider.
- The current gateway does not have a structured place to store or enforce model-specific optional inputs like `thinkingFlag`, `output_config`, `include_thoughts`, `reasoning_effort`, and `tool_choice`.
- Without explicit alias rules, canonical IDs such as `gpt-5.4` and provider IDs such as `gpt-5-4` may drift and create duplicate mappings.
