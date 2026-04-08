# 067 - Chat Provider-Aware Auto Model Selection

Version: 1.0
Date: 2026-04-01
Status: Proposed
Depends-on: 041 (multi-provider admin catalog), 032 (Responses API), 065 (Kie.ai LLM provider chat expansion), existing chat page model picker, existing skill auto-selection logic

---

## 1. Executive summary

The current chat page already lets a user pick an LLM model manually, and the skills/runtime stack already contains capability-aware model selection logic.

What is missing is a chat-native provider-aware auto-selection mode that:

- preserves the current explicit model picker
- adds provider-level automatic selection such as `Kie AI - Auto Model` and `OpenRouter - Auto Model`
- detects when the selected provider is `kie_ai` and automatically follows the Kie routing and validation behavior introduced in feature 065
- chooses the best enabled model at run time based on capability requirements and provider-local priority
- does not break or silently change current OpenRouter-oriented chat behavior

This feature keeps manual selection fully available while adding a safer, lower-effort auto mode for users who care about outcomes more than exact model names.

---

## 2. Problem statement

Today the chat system has a gap between two worlds:

1. The chat UI already lets users pick a model manually.
2. The skills/runtime stack already knows how to choose models automatically from capability requirements.

But chat does not yet combine those two ideas in a provider-aware way.

That creates these concrete problems:

1. Users who want to stay on one provider must still switch models manually when requirements change.
2. Kie.ai has provider-specific behavior now, but chat does not yet expose a clean user-facing way to say:
   - use Kie
   - pick the best Kie model automatically for this run
3. The current global auto concept is too generic for users who want:
   - automatic selection
   - but only within one provider such as Kie or OpenRouter
4. Chat capability needs can change by run:
   - web search
   - computer control / browser automation
   - image-aware or photo-search-style reasoning
   - tool use
   - responses-only model requirements

Without provider-aware auto selection, users must manually know which model supports which features and keep switching themselves.

---

## 3. Goals

### 3.1 Preserve both selection modes

The chat page must support both:

- explicit specific-model selection
- automatic model selection

Neither mode replaces the other.

### 3.2 Provider-aware automatic selection

The chat page must support at least:

- `Auto (best overall)`
- `OpenRouter - Auto Model`
- `Kie AI - Auto Model`

and should be extensible to other enabled providers where useful.

### 3.3 Kie-aware chat behavior

If the user picks:

- an explicit Kie model
- or `Kie AI - Auto Model`

the request path must automatically use Kie-aware runtime behavior from feature 065, including:

- provider pinning
- model-family-aware routing
- Kie-specific validation
- Kie-specific request transformation
- Kie-specific responses/messages/chat-completions behavior

### 3.4 Capability-aware resolution

For auto mode, chat should choose a model that satisfies the run’s real requirements, such as:

- `supportsWebSearch`
- `supportsComputerUse`
- `supportsVision`
- `supportsFunctionTools`
- `supportsStructuredOutputs`
- `supportsResponses`

### 3.5 Cost-aware practicality

Within the set of eligible models, the system should choose using existing priority rules so users do not need to overpay or over-provision manually.

### 3.6 No regression for current users

Users who still choose explicit OpenRouter or other existing models must continue to work as they do today.

---

## 4. Non-goals

- no forced migration of existing conversations into auto mode
- no removal of explicit model picking
- no silent provider switching when the user intentionally pins a provider
- no attempt to infer every possible intent from arbitrary free text with perfect accuracy
- no requirement that all providers expose provider-auto entries on day one

---

## 5. User-facing behavior

### 5.1 Chat picker options

The existing chat LLM picker should evolve from a flat model-only view into a mixed picker that can contain:

- `Auto (best overall)`
- `OpenRouter - Auto Model`
- `Kie AI - Auto Model`
- `Provider X - Auto Model` for future providers where enabled
- explicit model rows such as:
  - `OpenRouter / anthropic/claude-3.5-sonnet`
  - `Kie AI / gemini-3-pro`
  - `Kie AI / claude-sonnet-4-6`

The user must still be able to select a specific model directly.

### 5.2 Selection semantics

There are three distinct chat selection modes:

1. Global auto
   - system may choose the best enabled model across providers
2. Provider auto
   - system chooses the best enabled model only within the selected provider
3. Explicit model
   - system uses the exact chosen model and follows provider-specific behavior for that model

### 5.3 Conversation semantics

If a conversation is created with:

- explicit model selection
  - preserve that explicit model unless the user changes it
- provider-auto selection
  - preserve the provider-auto mode as the conversation preference
  - resolve the concrete model per run, not only once at conversation creation
- global auto selection
  - preserve global auto as the conversation preference
  - resolve the concrete model per run

This allows the same chat to adapt to new models over time without the user reconfiguring it manually.

### 5.4 User visibility

When auto mode resolves a concrete model, the UI should show the resolved result in a lightweight, non-blocking way, for example:

- `Auto -> gemini-3-pro (Kie AI)`
- `OpenRouter Auto -> openai/gpt-4o-mini`

This improves trust and debugging without forcing users to care about implementation details.

---

## 6. Design decisions

### 6.1 Keep explicit model selection first-class

The safest and most user-respectful design is:

- explicit model selection remains untouched
- auto mode is additive

This avoids breaking users who intentionally choose a known model for tone, latency, or consistency reasons.

### 6.2 Reuse skill-style capability selection

The chat stack should reuse the same core capability-aware selection pattern already present in:

- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/capabilityRegistry.ts`

Do not build a second independent scoring engine for chat.

### 6.3 Provider auto must pin provider at resolution time

If the user picks `Kie AI - Auto Model`, model resolution must happen only among enabled Kie mappings.

If the user picks `OpenRouter - Auto Model`, model resolution must happen only among enabled OpenRouter mappings.

This avoids surprising cross-provider drift.

### 6.4 Kie detection must be automatic

Chat clients should not need special hardcoded Kie route logic in the page.

The page should send enough selection metadata that the server can determine:

- selected mode
- selected provider if any
- selected explicit model if any

If the resolved provider is `kie_ai`, the server should automatically use the Kie-aware behavior from feature 065.

### 6.5 Auto mode should resolve per run, not only per conversation

That is the only way to:

- adapt to new enabled models
- adapt to changed priority
- adapt to changed capability requirements for that one run

This is also the closest fit to the user goal of “don’t make me keep changing models manually.”

---

## 7. Chat capability resolution

### 7.1 Capability requirement sources

For chat, capability requirements may come from a combination of:

- explicit UI toggles or tools enabled for the run
- attached tool context
- planner or middleware hints already present in the chat/runtime stack
- structured request metadata added by the chat page

The system must not rely only on brittle natural-language guessing.

Trust boundary rule:

- server-derived requirements are authoritative
- client-provided capability hints are advisory only unless they map to an allowlisted chat feature flag or tool mode already supported by the server
- the server must ignore or reject arbitrary client attempts to request expensive capabilities directly by raw boolean injection alone

Best-fit initial design:

- derive requirements from server-known chat features, enabled tools, and validated request modes
- use client metadata only to select among allowlisted feature modes, not to set arbitrary capabilities directly

### 7.2 Required capability mapping

The initial mapping should be conservative and explicit.

| Chat need | Required capability hints |
|---|---|
| plain chat | no extra requirements |
| web search | `supportsWebSearch = true` |
| browser / computer control | `supportsComputerUse = true`, `supportsResponses = true` where the browser flow needs the responses path |
| tool calling | `supportsFunctionTools = true` |
| structured JSON response | `supportsStructuredOutputs = true` |
| photo search / image-aware reasoning | `supportsVision = true` |
| background / long-running tool orchestration | `supportsBackground = true` when the flow truly requires it |

If multiple needs are present, requirements are combined with AND logic.

### 7.3 Responses-aware requirement

If the run requires `/v1/responses` semantics, auto selection must filter to models with:

- `supportsResponses = true`

This is especially important for:

- Kie GPT/Codex
- future computer-use or browser-heavy flows that require the responses route

### 7.4 No silent downgrade of required capabilities

If the user requested a capability such as web search or computer use, the selector must:

- either find a model that supports it
- or fail clearly

It must not silently pick a cheaper model that lacks the required capability.

### 7.5 Route compatibility requirement

Capability-aware selection is not enough by itself. The resolved model must also be compatible with the route family used by the current chat run.

Rules:

- normal chat-completions requests must exclude responses-only models unless the run explicitly enters responses mode
- runs that require `/v1/responses` semantics must filter to `supportsResponses = true`
- provider-auto and global-auto must apply route-family filtering before final priority selection
- the resolver must never intentionally choose a model that would immediately be rejected by the downstream family guardrails from feature 065

Best-fit fallback:

- if the current run is a normal chat request and no non-responses model satisfies the requirements, fail clearly rather than resolving to a responses-only model and letting the request break later

---

## 8. Selection model and wire contract

### 8.1 New chat selector contract

The chat page should move from a single `model` string concept toward a richer selection object internally, while remaining backward-compatible on the wire.

Recommended normalized shape:

```ts
type ChatModelSelection =
  | { mode: "explicit"; modelId: string; providerId?: number }
  | { mode: "auto-global" }
  | { mode: "auto-provider"; providerId: number; providerName: string };
```

### 8.2 Backward-compatible wire rules

The existing chat routes currently accept:

- `model`
- optional `preferredProvider`

The feature should preserve backward compatibility while adding explicit auto metadata such as:

```ts
{
  modelSelection?: {
    mode: "explicit" | "auto-global" | "auto-provider";
    providerId?: number;
    providerName?: string;
    modelId?: string;
  };
}
```

Compatibility rules:

- old clients sending only `model` keep working
- explicit model selection may still send `model` + optional `preferredProvider`
- provider-auto and global-auto should use the richer `modelSelection` metadata

Precedence and validation rules:

- when `modelSelection` is present, it is the authoritative source of selection intent
- in `explicit` mode, `modelSelection.modelId` must match `model` if both are sent; otherwise reject with deterministic 4xx validation
- in `auto-provider` mode, the server must ignore any client-supplied explicit `model` value
- in `auto-global` mode, the server must ignore any client-supplied explicit `model` and `preferredProvider` values
- `preferredProvider` may continue to work for old clients, but new clients should prefer `modelSelection`
- mixed or contradictory selector payloads must fail closed rather than be resolved heuristically

### 8.3 Conversation persistence

Conversation state should persist:

- selection mode
- provider pin for provider-auto
- explicit model when explicit mode is chosen

It should not overwrite provider-auto mode with the last resolved concrete model.

Store both:

- `selection preference`
- `last resolved model/provider` for observability

Authoritative persistence rule:

- persist provider identity by internal provider ID, not by client-supplied provider name
- provider names are display metadata only and must always be reloaded from current database state when needed

---

## 9. Provider-aware resolution algorithm

### 9.1 Global auto

For `auto-global`:

1. gather enabled models across providers
2. filter by route compatibility for the current run
3. filter by capability requirements
4. apply existing priority ordering
5. choose the best match
6. resolve provider-specific routing from the chosen model

The resolver must not choose a responses-only model for a standard chat run unless the run has already been elevated into responses mode.

### 9.2 Provider auto

For `auto-provider`:

1. gather enabled models only for that provider
2. reload the provider by authoritative provider ID from the database
3. filter by route compatibility for the current run
4. filter by capability requirements
5. apply existing priority ordering within that provider
6. choose the best match
7. send `preferredProvider` or equivalent provider pin downstream

The server must treat provider ID as authoritative and ignore stale or mismatched client-provided provider names.

### 9.3 Explicit model

For explicit selection:

1. keep the requested model
2. preserve optional provider pin
3. resolve provider-specific routing normally
4. if the resolved provider is Kie, let feature 065 behavior apply automatically

If the explicit selection conflicts with validated route-family requirements for the current run, return a direct user-facing error rather than silently switching models.

### 9.4 Kie-specific auto resolution

If provider-auto resolves within `kie_ai`, then:

- `supportsResponses = true` should naturally select Kie GPT/Codex family when required
- `supportsWebSearch = true` and chat-completions constraints may select the eligible Gemini family where appropriate
- Claude models should remain eligible only for requests whose route family and capabilities match

The selector must not bypass Kie family guardrails introduced in feature 065.

### 9.5 Conversation continuity

Provider-auto and global-auto resolve per run, but the conversation should still avoid unnecessary family churn.

Continuity rules:

- if multiple candidates satisfy the current requirements, prefer a candidate compatible with the last resolved route family for the conversation
- only switch route family when the new run’s validated requirements require it or when no compatible candidate remains enabled
- when switching family, the resolved model/provider should be surfaced in conversation metadata for transparency

This reduces surprising oscillation between chat-completions, messages, and responses families inside one conversation.

---

## 10. Chat runtime behavior changes

### 10.1 Chat page

Update the chat model picker so it can show:

- global auto
- provider-auto entries
- explicit models grouped by provider

### 10.2 Chat request building

When the user selects:

- explicit model
  - send explicit model as today
- provider auto
  - send provider-auto metadata and provider pin
- global auto
  - send global-auto metadata

### 10.3 Server-side chat execution

Before calling the existing LLM route handler:

1. normalize selection mode
2. derive capability requirements for the run
3. resolve a concrete model using capability-aware selection
4. apply provider pinning where needed
5. pass the concrete model into the existing runtime

This keeps provider-specific routing in the server, not in the page.

### 10.4 Kie provider behavior

If the resolved provider is `kie_ai`, the server must automatically follow feature 065 behavior:

- route to `/v1/responses` for Kie responses models
- use messages-style transformation for Kie Claude
- use Kie Gemini chat-completions path when relevant
- enforce Kie request-field validation and conflicts

No extra per-provider UI branching should be required beyond the selection metadata.

---

## 11. UX requirements

### 11.1 Picker wording

Use wording that is understandable to normal users:

- `Auto (best overall)`
- `Kie AI - Auto Model`
- `OpenRouter - Auto Model`

Avoid exposing implementation-only terms such as `apiStyle` in the main picker.

### 11.2 Resolved-model transparency

During or after a run, the UI should surface the resolved model in a subtle way.

Examples:

- message metadata tooltip
- conversation header badge
- debug panel

### 11.3 Capability mismatch feedback

If the user selects provider-auto and no model in that provider can satisfy the request:

- show a clear user-facing message
- do not silently fall back to another provider

Example:

- `No enabled Kie AI model currently supports computer control for this chat request.`

### 11.4 Explicit model errors remain explicit

If the user explicitly selected a Kie model and the request needs unsupported features, the system may return a direct validation error rather than auto-switching to another model.

That respects user intent.

### 11.5 Picker availability rules

The picker should show provider-auto entries only when:

- the provider is enabled
- at least one mapped model for that provider is enabled

Do not show provider-auto entries for empty or disabled providers.

---

## 12. Safety and compatibility

### 12.1 OpenRouter users must not regress

If a user continues using:

- explicit OpenRouter model
- current chat flow without provider-auto

behavior must remain unchanged.

### 12.2 Auto mode is opt-in

Provider-auto behavior should only activate when the user explicitly chooses it.

Do not reinterpret an existing explicit model selection as provider-auto.

### 12.3 Fail closed on missing capability match

If no provider-local model satisfies the requested capabilities:

- return a clear error
- do not silently downgrade requirements

### 12.3a Cost guardrails for auto mode

Auto mode should remain cost-aware without making hidden quality sacrifices.

Rules:

- priority remains the primary selector among eligible models
- capability satisfaction is a hard requirement, not a soft preference
- the resolver must never choose a higher-cost capability tier unless the run requires it
- future tenant or user budget policies may add stricter ceilings, but this feature should already be compatible with that extension

Best-fit interpretation:

- among all eligible models, choose the highest-priority configured option
- do not upshift to a more expensive model just because it exists if a cheaper eligible model already satisfies the request

### 12.4 Respect provider family constraints

Auto selection must still honor:

- Kie responses-only restrictions
- Kie messages/chat-completions family restrictions
- future provider-specific route constraints

### 12.5 Auditability

Log enough metadata to explain each auto resolution:

- selection mode
- requested provider pin if any
- capability requirements used
- resolved model
- resolved provider
- whether the run used explicit or automatic resolution

---

## 13. File-level scope

### Client

- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/components/agency/ModelPicker.tsx`
- chat-related model picker helpers where needed

### Server

- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/llmRoutesHandler.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/capabilityRegistry.ts`
- conversation persistence or metadata files that store chat model preference
- any shared model-selection utilities reused from skills

### Existing runtime integration points

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`

No new provider-specific route fork should replace these.

---

## 14. Recommended solution shape

### 14.1 Introduce provider-auto selector entries

The best-fit UX is:

- keep explicit models
- add provider-auto entries above each provider group
- keep the existing global auto entry

### 14.2 Introduce a shared chat auto-resolution service

Add a small dedicated resolver for chat, for example:

- `resolveChatModelSelection(...)`

Responsibilities:

- normalize chat selection mode
- derive capability requirements
- query enabled models
- filter by provider when required
- choose the best model via existing selector logic
- return `{ modelId, providerId?, providerName?, requirements, mode }`

### 14.3 Reuse priority ordering, do not reinvent it

Use the current priority/capability stack already established in the repo.

This keeps admin-maintained model priorities meaningful for chat auto mode too.

### 14.4 Add selection metadata to conversations

Persist:

- `selectionMode`
- `preferredProviderId`
- `preferredProviderName` if needed for convenience
- `explicitModelId`
- `lastResolvedModelId`
- `lastResolvedProviderId`

The exact schema can vary, but the separation between preference and resolved result is important.

---

## 15. Acceptance criteria

- The existing chat page still supports explicit specific-model selection.
- The chat page adds provider-level auto entries at least for `OpenRouter` and `Kie AI`.
- The chat page still supports a global auto option.
- Explicit model selection and auto selection coexist without replacing each other.
- Provider-auto selection resolves models only within the chosen provider.
- Global auto selection may resolve across providers.
- Auto selection reuses existing capability-aware priority logic rather than introducing a disconnected scoring path.
- Route-family compatibility is enforced before final auto selection so standard chat runs do not accidentally resolve to responses-only models.
- Chat requests that require web search automatically choose a model with `supportsWebSearch = true` when using auto mode.
- Chat requests that require computer control automatically choose a model with `supportsComputerUse = true` and other required capabilities when using auto mode.
- Chat requests that require image-aware reasoning or photo-search-style handling automatically choose a model with `supportsVision = true` when using auto mode.
- Server-derived capability requirements are authoritative over arbitrary client-supplied boolean capability hints.
- If the resolved provider is `kie_ai`, feature 065 Kie-specific routing and validation behavior applies automatically.
- Users who explicitly select OpenRouter models continue to behave as before.
- Contradictory `model`, `preferredProvider`, and `modelSelection` payloads fail closed with deterministic validation.
- Provider-auto does not silently switch to another provider when no eligible model exists in the chosen provider.
- Provider identity is resolved from authoritative provider ID and current database state, not from client display names.
- Provider-auto entries are shown only for enabled providers with at least one enabled mapped model.
- Auto resolution prefers conversation-family continuity when multiple eligible candidates exist.
- The system records or exposes the concrete resolved model for observability.
- The design remains extensible to future providers beyond OpenRouter and Kie.

---

## 16. Implementation notes

### 16.1 Best-fit staged rollout

The safest rollout order is:

1. add selection contract and provider-auto UI entries
2. add server-side resolution service
3. integrate capability derivation for chat needs
4. wire resolved-model observability
5. enable provider-auto entries for Kie and OpenRouter first

### 16.2 Capability derivation should start explicit, not magical

Use explicit runtime hints first, such as:

- selected tools
- known browser/computer-use flows
- image attachments or explicit image-analysis mode
- structured-output mode

If free-text inference is ever added later, it should remain a secondary hint rather than the sole source of truth.

### 16.3 Provider-auto should respect admin enablement

Only models that are:

- enabled in `model_provider_map`
- and belong to an enabled provider

may participate in auto selection.

### 16.4 Auto mode should benefit from new models automatically

Because resolution happens per run, newly enabled higher-priority models should become eligible without requiring users to edit each conversation manually.

---

## 17. Sources inside the repo

- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/components/agency/ModelPicker.tsx`
- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/capabilityRegistry.ts`
- `apps/web/server/services/skillExecutionPolicy.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- feature `065-kie-ai-llm-provider-chat-expansion`
