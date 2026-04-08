# Research notes

## Scope

This planning round focused on repo-grounded research only.

The feature depends primarily on existing chat, multi-provider, and Kie runtime behavior already present in the codebase.

## Codebase findings

### 1. Chat request shape today

The current chat client sends:

- `model`
- optional `preferredProvider`
- `messages`
- `stream`
- `conversationId`
- `skillUsed`

Reference:

- [ChatView.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatView.tsx#L1233)

This is enough for explicit provider-pinned behavior, but not enough to represent:

- provider-auto
- global-auto distinct from explicit model
- fail-closed precedence when legacy and new fields both appear

### 2. Model picker already has a global auto sentinel

`ModelPicker` already uses:

- `AUTO_MODEL = "__auto__"`

Reference:

- [ModelPicker.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ModelPicker.tsx#L21)

This is useful because the UI already understands the concept of “system selects best model,” but it is currently global only and not provider-aware.

### 3. Chat runtime already supports provider pinning

The existing handler passes `preferredProvider` into downstream model execution.

Reference:

- [llmRoutesHandler.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRoutesHandler.ts#L61)
- [llmRoutesHandler.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRoutesHandler.ts#L189)

That means provider-auto does not need a brand-new downstream execution mechanism. It mostly needs a better resolver upstream.

### 4. Enabled model rows already expose the capabilities we need

`EnabledLlmModelRow` already carries:

- `supportsVision`
- `supportsThinking`
- `supportsFunctionTools`
- `supportsStructuredOutputs`
- `supportsWebSearch`
- `supportsCodeExecution`
- `supportsComputerUse`
- `supportsBackground`
- `supportsResponses`
- `priority`
- `providerName`

Reference:

- [enabledLlmModels.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/enabledLlmModels.ts#L5)

This is enough to support provider-aware auto selection without additional provider metadata scraping.

### 5. The repo already has a reusable selector

`selectBestLlmModel()` already provides:

- capability filtering
- context-length filtering
- priority-based ranking

Reference:

- [intelligentModelSelector.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/intelligentModelSelector.ts#L146)

This should be reused rather than duplicated.

### 6. Skill execution policy already solves a similar problem

`resolveSkillExecutionPolicy()` already demonstrates:

- requirements-based matching
- fallback behavior
- preference vs resolved model concepts

Reference:

- [skillExecutionPolicy.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/skillExecutionPolicy.ts#L112)

Feature 067 should mirror this pattern for chat but with chat-specific selection semantics.

### 7. Kie family routing is already implemented and must be inherited, not duplicated

Feature 065 already added:

- Kie provider detection
- mixed family routing
- route-family guardrails
- request validation

References:

- [llmRoutes.ts](/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts#L655)
- [responsesRoutes.ts](/home/dev/projects/SmartSpecPro/apps/web/server/_core/responsesRoutes.ts#L609)

This means feature 067 should resolve provider/model first, then delegate to existing Kie-aware runtime behavior.

## Planning implications

1. The feature does not need a new ranking engine.
2. The feature does need a new chat selection contract.
3. The highest-risk implementation area is not ranking. It is route-family compatibility and precedence between old and new request fields.
4. Conversation persistence likely needs a new distinction between:
   - selection preference
   - last resolved concrete model

## Testing context

Existing tests relevant to this feature include:

- Kie runtime tests near [llmRoutes.kie.test.ts](/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.kie.test.ts)
- multi-provider and provider template tests
- handler tests near `llmRoutesHandler` and `llmRouter`

Best test strategy:

- unit-test the new resolver heavily
- keep route/socket tests focused on Kie inheritance and explicit OpenRouter non-regression
