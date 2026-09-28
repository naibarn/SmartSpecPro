# Section 03 — Actor Catalog and Routing

## Scope

Expose visible Worker model projections through one actor-aware catalog and route Worker
references through the existing Worker job control plane without touching global provider
routing.

## Files and ownership

- Add an actor-aware catalog service adjacent to `apps/web/server/services/enabledLlmModels.ts`.
- Update `apps/web/server/routers/llmProviders.ts` and relevant model-list APIs.
- Update `apps/web/server/services/llmRouter.ts` and `apps/web/server/_core/llmRoutes.ts` at
  the resolution boundary only.
- Audit/update direct consumers including `LLMModelSelector.tsx`, Chat, Skill, Agency/Team,
  Plugin/MCP, workflow selectors, and desktop-connected surfaces.
- Keep `apps/web/server/routers/localAi.ts`, `localAiPolicy.ts`, and device-local catalog
  behavior separate and backward compatible.

## Catalog contract

`listAvailableLlmModelsForActor({ tenantId, userId, task })` merges global rows and visible
Worker rows. Worker visibility is owner or active member of a selected owner-created Group;
tenant mode is excluded. Disabled/offline/stale rows may be returned as visible metadata but
are not selectable. Task capability filters apply after visibility: embedding-only rows do
not appear as Chat-selectable, while remaining visible in Local AI inventory.

Every consumer sends the canonical `modelRef` and `sourceType`; no display-name/prefix
inference or local-client profile substitution is allowed. Denied guessed refs must not leak
cross-tenant metadata.

## Routing contract

Resolve the request server-side. `sourceType=worker_app` validates feature flag, actor ACL,
status/readiness, provider relay opt-in, task capability, and exact Worker/model binding,
then creates a pinned canonical `llm_invoke` job with a server-generated request ID;
legacy `local_ai_task` jobs are not used for Worker-backed LLM dispatch.
It must not call `resolveProvidersWithRule`, `model_provider_map`, or cloud provider health.
Explicit Worker selection fails before job creation if unavailable; preference routing may
fallback only when policy says so and must record provenance.

## Tests first

Test owner/group visibility, task filtering, stale/offline display, cross-tenant denial,
legacy global routing, every direct selector's catalog source, pinned Worker dispatch,
explicit no-fallback, and visible policy-controlled fallback.

## Done when

The same enabled Worker models are available to every applicable LLM picker, global and
media catalogs remain unchanged, and a Worker request can be proven not to hit the gateway.

## UI/UX Contract

### Target User / JTBD
N/A — this section owns catalog/routing contracts; selector rendering is specified in Section 05.

### Existing Pattern Reference
N/A — no UI component is changed directly here; Section 05 records the selector patterns.

### Surface Inventory
N/A — catalog API and routing boundary only.

### Component Map
N/A — no UI components are owned here.

### State Matrix
N/A — catalog status fields are rendered by Section 05.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no rendered controls.

### Copy Contract
N/A — API reason codes are sanitized; localized copy is in Section 05.

### Browser Evidence Required
N/A — catalog/routing tests cover this section; selector browser evidence is required by Section 05.

## Implementation record

- Added actor-aware catalog rows with task capability filtering, Worker provenance,
  privacy mode, readiness, and stale/offline disabled states.
- Added Worker rows to both general LLM catalog endpoints used by chat, agency,
  workflow, skill, and settings consumers; media catalogs remain separate.
- Explicit `wllm_*` selections queue a pinned `llm_invoke` job and never enter cloud
  fallback or provider-health routing. Request idempotency includes a request hash.
