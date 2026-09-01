# Feature 172 Implementation Plan

## Outcome and constraints

Implement Worker-backed Local LLM model configuration, inventory projection, actor-aware
catalog, group sharing, routing, and execution while preserving the existing local-client
Local AI lane, global provider routing, media model catalog, and legacy Worker jobs.
The implementation uses a new canonical `llm_invoke` Worker job type on the existing
polling/claim/event/lease control plane; `local_ai_task` remains a legacy compatibility
type only. It does not create synthetic rows in `llm_providers` or allow
browser-to-local-endpoint calls. Do not run npm typecheck, build, or restart services.

## Architecture and invariants

1. Worker-local provider profiles and credentials are authoritative for endpoint access;
   Cloud stores only safe model metadata and a stable `modelRef`.
2. `worker_llm_models` is a projection keyed by tenant, Worker, owner, local provider,
   provider model ID, inventory revision, status, enabled state, and tombstone.
3. The actor-aware catalog is the only source for Worker rows in Chat, Skill, Agent/Team,
   Plugin/MCP, workflow, and desktop LLM pickers. Existing local-client profiles remain
   distinct `local_client`/device entries.
4. Local LLM sharing permits private or selected Groups created by the Worker owner in the
   same tenant. Tenant mode is rejected for Local LLM v1. Sharing policy remains server-owned
   even though the current storage is under `workers.capabilitiesJson`.
5. Explicit `worker_app` model selection is pinned to the projection's Worker and fails
   closed. Only user-approved preference policies may fallback to Cloud, with provenance.
6. Worker claims require `llm_gateway`, task capability, pinned Worker/model binding,
   current inventory revision, lease, token scope, and live policy. Empty capability hints
   cannot claim LLM jobs.

## Section 1 — Shared contracts and compatibility

Extend `apps/web/shared/workerRuntime.ts` and the shared package contracts with versioned
inventory, model reference, invoke/result/error, event, capability, and cancellation schemas.
Expand provider identifiers from the fixed local-client set without weakening the old
loopback-only `localAiWorkerJobContractSchema`; add an explicit Worker-backed contract and
adapter capability mapping. Add `llm:inventory` scope in `apps/web/shared/workerAccessKeys.ts`.
Keep the existing device-local boundary unchanged: `apps/web/server/routers/localAi.ts`,
`apps/web/server/services/localAiPolicy.ts`, `localAiSkillPolicy.ts`,
`localAiRuntimeMetadata.ts`, `localAiCatalog.ts`, and `packages/local-ai-core/src/index.ts`.
Tests come first in `apps/web/shared/__tests__/workerRuntime.test.ts`
and new shared contract tests.

## Section 2 — Projection, inventory and authorization

Add Drizzle schema/migration for `worker_llm_models`, inventory sync state, and atomic
Worker-job-event identity fields/indexes. Implement an inventory service and routes near
`apps/web/server/routes/workerRuntime.ts` using authenticated Worker execution tokens,
`llm:inventory`, idempotency key/hash, canonical payload, monotonic revision, bounded body,
transactional upsert/tombstone, and server-issued `localModelId -> modelRef` mapping.
Protect `workerSharingPolicy` from heartbeat overwrite in `workerRegistryService.ts` and
tighten `users.updateConnectedWorkerSharing` to owner-created Groups for this feature only.
Add tests for tenant/owner/group ACL, replay/races, stale inventory, and secret rejection.

## Section 3 — Actor-aware catalog and routing

Create an actor-aware catalog service alongside `enabledLlmModels.ts` that merges global
models with visible Worker projections and preserves task capability filtering. Add a
discriminated `sourceType=worker_app` response to the existing LLM model API/router and
update all direct model-list consumers identified by `rg`, including Chat, Skill, Agency/
Team, Plugin/MCP, workflow selectors, and desktop-connected surfaces. Keep media selectors
separate. Update `llmRouter.ts`/`llmRoutes.ts` resolution so Worker refs create a pinned
`llm_invoke` job and never enter `model_provider_map` or cloud provider health. Add focused
catalog/routing tests and a guard that legacy model IDs remain global-only.

## Section 4 — Worker App local registry and control plane

Add local provider/model registry state to `apps/worker-app/src-tauri/src/settings.rs` using
atomic metadata persistence and OS keyring references patterned after Comfy profiles. Add
provider validation, discovery/manual model, capability probe/override, model mapping,
bounded local queue, adapter abstraction, and normalized result/error handling. Extend
`worker_control_plane.rs` for inventory publish, cancellation polling, and LLM events;
extend `worker_loop.rs`/`worker_executor.rs` for `llm_invoke` classification while keeping
legacy runtime execution intact. Implement OpenAI-compatible baseline plus Ollama-native
discovery; LocalAI/vLLM/LM Studio/llama.cpp use the baseline. Add Rust unit tests for
multiple profiles/models, keyring redaction, binding, unsupported capabilities, cancellation,
and retry/no-double-inference.

## Section 5 — UI and all model selectors

Reuse `WorkerAccessKeysPanel.tsx`, existing Local AI settings patterns, and
`LLMModelSelector.tsx` rather than inventing a parallel design system. Add Worker Local AI
provider/model management and group-sharing controls with the approved UI/UX contract
below. Add Worker source badges, disabled/offline/stale/missing states, privacy disclosure,
retry/change-model actions, and task-capability filtering. Local-client Gemma/LiteRT controls
remain separate. Add component tests and focused authenticated browser evidence at the
required viewports without building or restarting services.

### UI/UX Contract

#### Target User / JTBD

- Role: Worker owner and an active member of an explicitly shared Group.
- Goal: Configure local providers/models once, find them in any LLM picker, and run a model
  on the selected Worker with clear privacy and availability status.
- Entry point: Worker settings/Local AI and existing LLM model selectors.
- Success: owner/member can select an enabled model, see Worker provenance, and receive a
  terminal result or actionable failure without silent cloud fallback.

#### Existing Pattern Reference

- Searched via targeted `rg` because SocratiCode was unavailable: `WorkerAccessKeysPanel.tsx`,
  `LocalAiSettingsSection.tsx`, `LLMModelSelector.tsx`, `AdminLLMProviders.tsx`, and
  existing group-sharing procedure/tests.
- Decision: reuse existing settings cards, dialogs, selector grouping, i18n, and status-copy
  patterns; diverge only to add multi-provider/model rows and Worker-specific badges.

#### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Worker Local AI | existing Worker settings surface | provider/model inventory and sharing |
| LLM selector | `LLMModelSelector.tsx` and direct consumers | unified actor-aware rows |
| Catalog API | existing LLM model routes/tRPC | `sourceType=worker_app` rows |
| Worker API | `/api/workers/:workerId/llm/inventory` and job events | sync/invoke/cancel |

#### Component Map

| Component | Ownership | Consumes |
|---|---|---|
| WorkerLocalAiPanel | settings UI | inventory/share queries and mutations |
| WorkerModelRow | settings UI | model status/capabilities |
| WorkerSharingControl | settings UI | owner Groups and sharing mutation |
| LLMModelSelector | shared selector | actor-aware catalog |
| WorkerModelBadge | shared UI | Worker/provider/privacy metadata |

#### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton/disabled controls | component test |
| empty | add provider/model guidance | component test |
| error | sanitized error and retry | component test |
| success | provider/model rows and sync revision | component/browser test |
| partial | per-provider discovery/status errors | component test |
| disabled/offline | visible but unselectable with reason | browser evidence |
| selected | Worker badge and privacy indicator | selector test |
| hover/focus | existing tokenized focus/hover styles | accessibility/browser |

#### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked provider/model rows, no horizontal clipping | screenshot/manual |
| tablet 768x1024 | two-column metadata where space allows | screenshot/manual |
| desktop 1440x900 | grouped table/card layout with sharing panel | screenshot/manual |
| small-mobile 360x800 | compact labels and scrollable details | manual if risk appears |
| laptop 1024x768 | selector/dialog remains usable | manual |
| wide-desktop 1280x800 | no overflow in data-dense rows | manual |

#### Accessibility Acceptance

Keyboard-only operation, visible focus, labelled controls, semantic list/table structure,
status text not conveyed by color alone, contrast matching existing tokens, and reduced
motion behavior are required. Group selection must expose selected/unselected state to a
screen reader. Privacy disclosure must be readable before invocation.

#### Copy Contract

Thai is primary with English fallback. Use existing terminology: “Local Worker”, “Private”,
“Selected groups”, “Worker relay”, “Cloud can see this prompt”, “Offline”, “Model missing”,
“Capability changed”, “Retry”, and “Change model”. Never expose endpoint, path, credential,
or raw provider error. Empty/loading/success/error copy must be localized in existing locale
files.

#### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`; capture authenticated
owner and member flows at mobile 390x844, tablet 768x1024, and desktop 1440x900. Report
browser unavailable separately from unit-test results.

## Section 6 — Billing, lifecycle, observability and rollout

Connect `llm_invoke` to existing credit reservation/reconciliation exactly once per logical
request, with zero local inference cost by default and optional platform/skill fees. Define
terminal state behavior, stale/revoked queued-job re-evaluation, cancellation, retention /
deletion/export, audit events, rate limits, quotas, feature flags, cache invalidation, and
old Worker compatibility. Add end-to-end tests for owner, shared member, revoke race,
offline model, explicit no-fallback, and local endpoint smoke behavior (reported separately).

## Implementation order

1. Section 1 shared contracts/tests.
2. Section 2 schema, migration, inventory and ACL tests.
3. Section 3 catalog/routing and selector contract tests.
4. Section 4 Worker registry/control plane and Rust tests.
5. Section 5 UI wiring/component tests/browser evidence.
6. Section 6 billing/lifecycle/observability integration and final focused gates.

## Non-goals and forbidden verification

Do not add synthetic global providers, browser direct Local AI calls, tenant-wide Local LLM
sharing, broad network discovery, secret persistence in Cloud, npm typecheck, any build
command, or service restart.
