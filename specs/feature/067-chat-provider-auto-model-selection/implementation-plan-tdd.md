# TDD plan

## Test-first order

1. Picker and selection-contract tests
2. Server-side chat selection normalization tests
3. Capability derivation tests
4. Resolver ranking and provider isolation tests
5. Chat runtime integration tests
6. Conversation persistence and observability tests
7. Regression tests for Kie and explicit OpenRouter behavior

## TDD execution slices

### Slice A. Selection contract before resolver logic

Write first:

- chat picker tests around new provider-auto entries
- request-shape tests around `modelSelection`

Target failure:

- chat can only express a flat model string
- provider-auto intent cannot be represented unambiguously

Implementation unlock:

- structured selection metadata
- backward-compatible wire normalization

### Slice B. Resolver correctness before UI integration

Write next:

- unit tests for `resolveChatModelSelection(...)`

Target failure:

- contradictory payloads resolve heuristically
- provider-auto crosses providers
- route-family-incompatible candidates remain eligible

Implementation unlock:

- selection precedence
- provider filtering
- route-family filtering
- continuity behavior

### Slice C. Capability derivation before auto enablement

Write next:

- requirement derivation tests for chat needs

Target failure:

- arbitrary client booleans influence expensive model selection
- runs requiring web search / responses / computer use are not filtered correctly

Implementation unlock:

- trusted capability derivation
- capability requirement mapping

### Slice D. Runtime integration before rollout

Write next:

- chat route / handler tests
- Kie inheritance tests

Target failure:

- provider-auto resolves a Kie model but does not apply Kie routing behavior
- explicit OpenRouter requests regress

Implementation unlock:

- request-building integration
- runtime resolution
- provider pin propagation

### Slice E. Persistence and observability

Write last:

- conversation persistence tests
- resolved-model metadata tests

Target failure:

- auto mode overwrites conversation preference with last resolved concrete model
- users and operators cannot tell what model ran

Implementation unlock:

- preference vs resolved-state persistence
- UI/debug metadata

## Tests to add or update

### Client tests

#### `apps/web/client/src/components/agency/ModelPicker` tests

- shows `Auto (best overall)` entry
- shows `Kie AI - Auto Model` only when Kie is enabled and has at least one enabled mapped model
- shows `OpenRouter - Auto Model` only when OpenRouter is enabled and has at least one enabled mapped model
- still shows explicit models grouped by provider
- selecting provider-auto produces the expected normalized picker value

#### `apps/web/client/src/components/chat/ChatView` tests

- explicit model selection sends explicit `model` as today
- provider-auto sends `modelSelection.mode = "auto-provider"`
- global auto sends `modelSelection.mode = "auto-global"`
- explicit provider selection still sends `preferredProvider` where required for backward compatibility
- conversation stored in auto mode does not collapse into a plain explicit model on the next request

### Server tests

#### New `apps/web/server/services/chatModelSelection.test.ts`

- explicit mode with only `model` resolves correctly
- explicit mode with matching `model` and `modelSelection.modelId` resolves correctly
- explicit mode with conflicting `model` and `modelSelection.modelId` returns deterministic validation error
- `auto-provider` filters candidates to one provider only
- `auto-global` may choose across providers
- `auto-provider` ignores contradictory client `model`
- `auto-global` ignores contradictory client `model` and `preferredProvider`
- provider ID is authoritative; stale provider name is ignored
- standard chat mode excludes responses-only models
- responses-mode requires `supportsResponses = true`
- continuity prefers last resolved family when multiple candidates qualify
- missing capability match fails clearly

#### Capability derivation tests

- web search requirement -> `supportsWebSearch = true`
- tool-calling requirement -> `supportsFunctionTools = true`
- structured output requirement -> `supportsStructuredOutputs = true`
- image-aware requirement -> `supportsVision = true`
- browser/computer-control requirement -> `supportsComputerUse = true`
- arbitrary raw client capability booleans alone are ignored or rejected

#### `apps/web/server/services/llmRoutesHandler` tests

- provider-auto result passes concrete `model` and pinned `preferredProvider` into downstream execution
- explicit OpenRouter selection still behaves as before
- Kie provider-auto result inherits Kie routing behavior through existing runtime

#### Existing Kie regression tests

- auto-selected Kie GPT/Codex requiring responses does not enter the wrong chat route
- auto-selected Kie Claude stays on messages path
- auto-selected Kie Gemini stays on chat-completions path

### Conversation persistence tests

- conversation preference persists `auto-global`
- conversation preference persists `auto-provider`
- conversation preference persists explicit model without being overwritten by last resolved model
- `lastResolvedModelId` and `lastResolvedProviderId` update after each run

## Suggested command loop

- `npm --prefix apps/web test -- apps/web/client/src/components/agency/ModelPicker*.test*`
- `npm --prefix apps/web test -- server/services/chatModelSelection.test.ts`
- `npm --prefix apps/web test -- server/services/llmRoutesHandler*.test.ts`
- `npm --prefix apps/web test -- server/_core/llmRoutes.kie.test.ts`
- targeted chat UI tests after integration

## Expected first failures

- the picker can only return a flat string model value
- `ChatView` request body has no `modelSelection`
- the server has no unified chat selection resolver
- explicit/auto precedence is inconsistent
- route-family compatibility is not applied before model ranking
- conversation storage only understands a single `model`

## Regression checks

- explicit OpenRouter model selection remains unchanged
- current Kie runtime guardrails remain unchanged
- current skill auto-selection logic remains reusable and unchanged for skills
- legacy clients sending only `model` still work

## Fixtures and mocking notes

- prefer unit tests for resolver logic
- reuse `EnabledLlmModelRow` fixtures from current multi-provider tests where practical
- keep provider-auto tests deterministic by fixing `priority` and capability flags in fixtures
- do not depend on network calls
