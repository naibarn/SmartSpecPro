# Responses Runtime Turn Plan

## Purpose

`executeResponsesRuntimeTurn()` currently exists as a shared-runtime bridge, but it has no production caller. This plan defines how to wire it into the correct structured-output execution path without breaking the generic `/v1/responses` proxy route or the existing OpenRouter/provider routing policy.

The goal is to make Responses runtime behavior:

- explicit
- replayable
- traceable
- schema-safe
- compatible with existing gateway/provider selection

This plan is an addendum to Feature 101 section 08 and should be implemented without changing the behavior of unrelated raw Responses proxy traffic.

## Problem Summary

Current state:

- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts` exports `executeResponsesRuntimeTurn()`
- `apps/web/server/_core/responsesRoutes.ts` logs runtime selection but never calls the runtime bridge
- the route still behaves like a generic upstream proxy for all responses traffic
- there is no clear eligibility gate that decides when a request should use the shared runtime versus the legacy proxy path

Result:

- `executeResponsesRuntimeTurn()` is effectively dead code
- structured-output or skill-driven Responses work cannot use the shared runtime boundary yet
- raw proxy traffic and runtime-driven traffic are not separated clearly enough

## Design Decision

Do not wire `executeResponsesRuntimeTurn()` into the raw `/v1/responses` proxy path unconditionally.

Instead:

1. Keep the current proxy path for legacy/raw Responses requests.
2. Introduce an explicit runtime-eligibility gate for Responses requests that need structured-output enforcement or skill-driven execution.
3. Call `executeResponsesRuntimeTurn()` only for eligible requests.
4. Preserve Node-owned provider/model resolution so OpenRouter continues to work when the selected model supports Responses.

This keeps the abstraction correct:

- generic proxy traffic stays generic
- shared-runtime traffic uses the shared runtime bridge

## Eligibility Rule

The runtime bridge should be used only when all of the following are true:

- the request is a structured-output or skill-driven Responses turn
- the caller has a valid runtime envelope
- the request can supply a `skillSlug`
- the request can build a valid `contextPackRequest`
- the request has a deterministic `executionPolicy`
- feature flags allow Responses runtime selection

If any of those are missing, the route must remain on the legacy proxy path.

## Proposed Runtime Flow

### 1. Normalize the request

In `apps/web/server/_core/responsesRoutes.ts`, build a normalized runtime envelope from:

- tenant and user context
- requested model/provider
- structured-output schema requirements
- approval requirements
- allowed tools and allowed agents
- Feature 099 context-pack request
- runtime feature flags

### 2. Decide the execution path

Add a small decision helper that returns one of:

- `legacy_proxy`
- `shared_runtime`

The decision should be explicit and logged.

### 3. Call the runtime bridge when eligible

For runtime-eligible requests:

- resolve `skillSlug`
- resolve `executionPolicy`
- build `contextPackRequest`
- pass the current legacy proxy behavior as `legacyExecute`
- call `executeResponsesRuntimeTurn()`

The runtime bridge must remain responsible for:

- shadow vs active behavior
- structured comparison
- trace metadata
- runtime result normalization

### 4. Preserve provider routing

Do not hardcode OpenRouter or any provider-specific path.

Use the existing Node-side selection and routing utilities:

- `resolveProviderRouteModel`
- `getProviderForModel`
- the existing Responses api-style checks

The runtime bridge should accept the already-resolved gateway/model config.

### 5. Handle failures without silent fallback

When runtime execution is selected:

- schema failure must fail closed
- policy failure must fail closed
- runtime errors must be structured and explicit
- the code must not silently retry into legacy prose behavior

Legacy proxy fallback is allowed only when the runtime-eligibility gate says the request was never runtime-eligible in the first place.

## Implementation Phases

### Phase 1: Add a structured eligibility gate

Files:

- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts`

Work:

- add a helper such as `shouldUseResponsesRuntimeTurn(...)`
- make the helper inspect:
  - runtime flags
  - structured-output needs
  - skill capability selection
  - context-pack availability
  - approval requirements
- log the decision and the reason

Exit criteria:

- the route can clearly explain why a request stays on legacy proxy or moves to shared runtime

### Phase 2: Build the runtime input envelope

Files:

- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts`

Work:

- map the existing request body into `ResponsesRuntimeTurnInput`
- ensure `skillSlug` is populated from a manifest-backed selection, not from ad hoc prompt text
- carry `requestLabel`, `roomId`, `runId`, and `messageId` when available
- keep `modelConfig` Node-owned

Exit criteria:

- the runtime bridge can be called with a deterministic, validated request object

### Phase 3: Wire the shared runtime into the eligible path

Files:

- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts`

Work:

- invoke `executeResponsesRuntimeTurn()` for the eligible branch
- keep the existing `proxyResponsesStream` / `proxyResponsesJson` path for non-eligible requests
- preserve stream vs non-stream behavior
- keep audit logging intact

Exit criteria:

- eligible requests use the runtime bridge
- ineligible requests continue to behave like the current route

### Phase 4: Make OpenRouter compatibility explicit

Files:

- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/services/llmRouter.ts`
- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts`

Work:

- keep current provider/model resolution unchanged
- ensure Responses-compatible models remain eligible
- preserve structured-output guards for providers that require special `response_format` handling

Exit criteria:

- runtime-driven Responses still work with OpenRouter when the selected model supports the route

### Phase 5: Add tests before rollout

Files:

- `apps/web/server/services/__tests__/responsesOpenAiAgentsRuntime.test.ts`
- `apps/web/server/services/__tests__/responsesOpenAiAgentsRuntimeShadow.test.ts`
- `apps/web/server/services/__tests__/responsesOpenAiAgentsReplay.test.ts`
- `apps/web/server/_core/__tests__/responsesRoutes.runtimeEligibility.test.ts`

Coverage:

- legacy proxy request remains proxy-only
- eligible structured-output request enters `executeResponsesRuntimeTurn()`
- shadow mode keeps legacy visible output while recording comparison traces
- active mode returns runtime output
- invalid runtime schema fails closed
- OpenRouter-compatible model still routes correctly

### Phase 6: Logging and observability

Files:

- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/services/agentRuntime/responsesRuntimeOrchestrator.ts`

Work:

- log selected path: `legacy_proxy` or `shared_runtime`
- log selected skill slug, model id, provider name, trace id, and runtime mode
- log eligibility rejection reasons
- keep logs redaction-safe

Exit criteria:

- a failed request can be debugged from logs without guessing which branch ran

## Acceptance Criteria

- `executeResponsesRuntimeTurn()` has a real caller
- the caller is the correct structured-output or skill-driven Responses path
- raw `/v1/responses` proxy behavior still works for legacy requests
- OpenRouter remains supported through existing provider routing
- schema-invalid runtime output fails closed
- shadow mode records comparison data without duplicate side effects
- the route can explain why a request used runtime or stayed on proxy

## Risks

- Wiring the runtime bridge into every Responses request would break the generic proxy contract
- Hardcoding provider selection would reduce OpenRouter compatibility
- Calling the runtime bridge without a valid `skillSlug` or context pack would make the behavior less deterministic
- Silent fallback from runtime error to proxy output would hide failures and make debugging harder

## Recommended Next Step

Implement Phase 1 first, then add tests for the eligibility gate before touching the runtime invocation branch.
