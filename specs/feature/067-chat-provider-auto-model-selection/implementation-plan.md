# Feature 067: Chat Provider-Aware Auto Model Selection

## Objective

Extend the existing chat page and chat runtime so users can choose either:

- a specific explicit model
- `Auto (best overall)`
- `Provider - Auto Model` such as `Kie AI - Auto Model` or `OpenRouter - Auto Model`

while preserving current explicit OpenRouter behavior and automatically applying feature 065 Kie routing rules whenever the resolved provider is `kie_ai`.

The implementation should reuse the repository’s existing capability-aware selection stack instead of creating a second model-selection engine.

## Current-codebase fit

The repo already has the right primitives:

- chat UI currently sends `model` and optional `preferredProvider` in [ChatView.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/ChatView.tsx)
- `ModelPicker` already has a global `AUTO_MODEL = "__auto__"` concept in [ModelPicker.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ModelPicker.tsx)
- the chat runtime already passes `preferredProvider` into the router path in [llmRoutesHandler.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRoutesHandler.ts)
- enabled model rows already expose capability flags and priority in [enabledLlmModels.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/enabledLlmModels.ts)
- capability-aware selection already exists in [intelligentModelSelector.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/intelligentModelSelector.ts)
- feature 065 already enforces Kie route-family correctness, request validation, and mixed-family behavior in [llmRoutes.ts](/home/dev/projects/SmartSpecPro/apps/web/server/_core/llmRoutes.ts) and [responsesRoutes.ts](/home/dev/projects/SmartSpecPro/apps/web/server/_core/responsesRoutes.ts)

The main missing pieces are:

1. a chat-native selection contract richer than `model` string only
2. provider-scoped auto entries in the picker
3. a dedicated server-side chat resolver that translates chat selection + chat requirements into a concrete model/provider choice
4. conversation persistence that distinguishes `selection preference` from `last resolved model`

## In-scope outcomes

1. Preserve explicit model selection exactly as a first-class mode.
2. Add provider-aware auto selection to the chat picker.
3. Add a server-side chat model resolver that:
   - normalizes selection mode
   - derives trusted capability requirements
   - filters by provider when needed
   - applies route-family compatibility before final ranking
   - returns a concrete `{ modelId, providerId, providerName }`
4. Persist chat selection preference separately from the last resolved model/provider.
5. Surface the resolved concrete model for observability in chat UX and audit paths.
6. Reuse existing capability/priority logic and admin-maintained model priorities.
7. Automatically apply Kie behavior from feature 065 whenever the resolved provider is `kie_ai`.

## Explicitly out of scope

- no removal of the current explicit model flow
- no forced migration of existing conversations
- no provider-auto entries for every possible provider on day one
- no free-text-only intent classifier for capability resolution
- no change to external provider websites or docs

## Primary design rule

Auto mode is additive and opt-in.

The safest implementation is:

- explicit users continue to work exactly as before
- auto users opt into provider-aware resolution
- the server remains the only source of truth for capability derivation, provider resolution, and Kie route-family behavior

## Delivery phases

### Phase 1. Selection contract and picker model

Goal:

- represent `explicit`, `auto-global`, and `auto-provider` cleanly in chat without breaking old clients

Primary deliverables:

- normalized `ChatModelSelection` contract in shared client/server types
- backward-compatible wire rules for `model`, `preferredProvider`, and `modelSelection`
- picker support for:
  - `Auto (best overall)`
  - `Kie AI - Auto Model`
  - `OpenRouter - Auto Model`
  - explicit grouped models
- authoritative provider-auto entry gating:
  - provider enabled
  - at least one enabled mapped model exists

Exit condition:

- the chat UI can express all three modes without ambiguity
- contradictory selector payloads are specified to fail closed

### Phase 2. Server-side chat resolution service

Goal:

- resolve chat selection into a concrete model/provider using existing capability-aware selection logic

Primary deliverables:

- a new server-side resolver, e.g. `resolveChatModelSelection(...)`
- provider-filtered and global candidate loading
- route-family compatibility filtering before final ranking
- authoritative provider reload by provider ID
- fail-closed selection precedence when `modelSelection`, `model`, and `preferredProvider` disagree

Exit condition:

- the resolver can deterministically produce:
  - resolved model
  - resolved provider
  - route-family-compatible selection
  - clear error when no eligible candidate exists

### Phase 3. Capability derivation and route-aware requirements

Goal:

- derive trusted capability requirements from chat behavior rather than arbitrary client booleans

Primary deliverables:

- server-owned capability derivation from:
  - allowlisted chat tools/features
  - validated browser/computer-use modes
  - structured-output modes
  - image-aware / vision signals where already supported by the chat surface
- route-aware requirement derivation:
  - filter out responses-only models in standard chat mode
  - require `supportsResponses = true` only when the run truly needs responses semantics
- cost-aware selection using existing priority ordering among eligible candidates

Exit condition:

- auto mode chooses only among valid, route-compatible, capability-compatible candidates

### Phase 4. Chat runtime integration and Kie behavior inheritance

Goal:

- integrate the resolver into chat execution without forking provider-specific client behavior

Primary deliverables:

- `ChatView` request building sends `modelSelection` metadata for new clients
- chat server and/or `llmRoutesHandler` resolve concrete model/provider before runtime execution
- `preferredProvider` is applied automatically for provider-auto and explicit provider-pinned flows
- Kie provider resolution inherits feature 065 behavior automatically

Exit condition:

- provider-auto Kie requests behave like Kie explicit requests without extra UI branching
- OpenRouter explicit requests remain unchanged

### Phase 5. Conversation persistence, observability, and rollout safety

Goal:

- preserve user intent and make auto resolution explainable

Primary deliverables:

- persist:
  - selection mode
  - explicit model when applicable
  - provider pin when applicable
  - last resolved model/provider metadata
- continuity rule:
  - prefer last resolved family when multiple eligible candidates exist
  - switch family only when new validated requirements require it or no compatible candidate remains
- resolved-model transparency in the chat UX
- audit metadata for selection mode, provider pin, requirements, and resolved model/provider

Exit condition:

- users can understand what auto selected
- conversations do not silently lose their chosen selection mode

## Implementation approach

### 1. Introduce a normalized chat selection model

Recommended normalized shape:

```ts
type ChatModelSelection =
  | { mode: "explicit"; modelId: string; providerId?: number }
  | { mode: "auto-global" }
  | { mode: "auto-provider"; providerId: number };
```

Recommended rules:

- `providerId` is authoritative
- `providerName` may be carried only as display metadata if needed
- when `modelSelection` is present, it is authoritative
- `model` remains for backward compatibility only

Fail-closed validation:

- `explicit` mode with both `modelSelection.modelId` and `model`
  - must match
- `auto-provider` mode
  - ignore client `model`
  - ignore mismatched `preferredProvider`
- `auto-global` mode
  - ignore client `model`
  - ignore client `preferredProvider`

### 2. Add a dedicated chat resolver service

Create a dedicated helper service rather than embedding all logic into `ChatView` or `llmRoutesHandler`.

Suggested file:

- `apps/web/server/services/chatModelSelection.ts`

Suggested responsibilities:

- parse and normalize incoming selection mode
- load enabled models with capability metadata and provider IDs
- derive trusted capability requirements
- enforce provider filter where needed
- enforce route-family compatibility
- rank candidates using existing priority logic
- return:

```ts
{
  selectionMode: "explicit" | "auto-global" | "auto-provider";
  resolvedModelId: string;
  resolvedProviderId?: number;
  resolvedProviderName?: string;
  requirements: Partial<CapabilityRequirements>;
  routeFamily: "chat-completions" | "messages" | "responses" | "unknown";
  continuityApplied: boolean;
}
```

### 3. Reuse, don’t fork, selection logic

The resolver should reuse:

- `loadEnabledLlmModelRows()`
- `selectBestLlmModel()`
- capability-filter helpers from `capabilityRegistry.ts` where useful

Only add the missing chat-specific layers:

- provider filtering
- route-family compatibility
- selection precedence
- continuity

### 4. Trusted capability derivation

Do not let the client send raw arbitrary `supportsX = true`.

Best-fit trusted derivation model:

- derive from explicit, allowlisted server-understood chat features
- examples:
  - web search toggle -> `supportsWebSearch = true`
  - browser/computer-control feature -> `supportsComputerUse = true`
  - structured output mode -> `supportsStructuredOutputs = true`
  - image-aware mode or image attachment policy -> `supportsVision = true`
  - responses-only flow -> `supportsResponses = true`

Client hints may request a known feature mode, but the server converts that into validated capability requirements.

### 5. Route-family compatibility must be a first-class filter

This is the most important guardrail for not regressing chat behavior.

Rules:

- a standard chat run must not resolve to a responses-only model unless the server has already determined the run is a responses-mode run
- responses-mode runs must filter to `supportsResponses = true`
- Kie family guardrails from feature 065 remain authoritative

Implementation preference:

- derive a `requiredRouteFamily` or `allowResponsesFamily` flag during chat requirement derivation
- filter candidates before ranking

### 6. Conversation persistence changes

The current system primarily persists conversation `model`.

Feature 067 should distinguish:

- `selectionPreference`
  - explicit model
  - auto-global
  - auto-provider
- `lastResolved`
  - resolved model
  - resolved provider
  - resolved family

If schema changes are needed, keep them minimal and backward-compatible.

If no schema change is desired in the first slice, a transitional approach may store these in conversation metadata/config JSON before later normalization.

### 7. Continuity policy

When multiple candidates satisfy the current request:

- prefer candidates compatible with the last resolved family
- only switch family when requirements force it

This is especially important for Kie where the family may imply:

- `responses`
- `messages`
- `chat-completions`

without this continuity rule, provider-auto could oscillate across model families and feel random.

### 8. Picker implementation detail

The current `ModelPicker` only understands a flat string value and a single global auto sentinel.

Recommended implementation path:

- keep `AUTO_MODEL = "__auto__"` for backward compatibility
- add provider-auto sentinel values in the picker layer, e.g.:
  - `__auto_provider__:9`
- normalize those sentinel values into `modelSelection` before sending requests

Do not rely on sentinel parsing alone on the server. The final server contract should use structured `modelSelection`.

### 9. Kie inheritance path

Feature 067 should not duplicate feature 065 logic.

The correct path is:

1. resolve a concrete model and authoritative provider
2. if provider is `kie_ai`
3. pass through the existing Kie-aware runtime from feature 065

This avoids a second Kie-specific branch in the chat UI.

## Target files

### Client

- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/components/agency/ModelPicker.tsx`
- chat model picker helper types/utilities as needed

### Server

- `apps/web/server/services/chatModelSelection.ts` (new)
- `apps/web/server/services/llmRoutesHandler.ts`
- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/enabledLlmModels.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- conversation persistence files or metadata utilities as needed

### Existing runtime integration points

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`

## Security and safety requirements

### Trusted input boundaries

- `modelSelection.providerId` is authoritative; `providerName` is never authoritative
- arbitrary client capability booleans are not authoritative
- contradictory legacy and new selection fields fail closed

### Provider isolation

- provider-auto never silently crosses to another provider
- explicit provider-pinned requests never silently reinterpret into provider-auto

### Cost and abuse guardrails

- among eligible models, priority ordering remains the selector
- the resolver does not upgrade to a more expensive capability tier unless required
- missing capability match fails clearly rather than downgrading silently

## Risks and mitigations

### Risk 1. Route-family mismatch in auto mode

- Symptom: auto picks a responses-only model for a standard chat run
- Mitigation: route-family compatibility filter before ranking

### Risk 2. Client spoofing expensive capability requests

- Symptom: users force costly models through raw request metadata
- Mitigation: derive requirements from allowlisted server-understood feature modes only

### Risk 3. Conversation instability

- Symptom: auto selection oscillates across incompatible families every run
- Mitigation: continuity rule based on last resolved family

### Risk 4. OpenRouter regressions

- Symptom: explicit OpenRouter users see changed behavior unintentionally
- Mitigation: auto mode is opt-in and explicit flows remain the legacy default

## Suggested rollout order

1. introduce selection contract and picker UI scaffolding
2. land server-side resolver and unit tests
3. integrate chat request building and chat runtime resolution
4. add continuity + observability metadata
5. turn on Kie/OpenRouter provider-auto entries

## Done criteria

- chat supports explicit model, auto-global, and provider-auto
- Kie provider-auto uses Kie behavior from feature 065 automatically
- OpenRouter explicit users see no behavioral regression
- selection intent, resolved model, and resolved provider are observable
- route-family mismatches and contradictory payloads fail closed
