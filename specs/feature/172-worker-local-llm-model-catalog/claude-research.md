# Deep-plan Research — Feature 172

## Research decision

- Codebase research: required because this is an existing git repository with
  Worker, LLM, Local AI, group-sharing, billing, and UI code.
- Web research: required because the feature depends on runtime/API behavior for
  Ollama, vLLM, LM Studio, llama.cpp, and LocalAI.
- Testing research: required; the repository uses Vitest for Web/shared tests and
  Rust unit tests under `apps/worker-app/src-tauri/tests`.
- SocratiCode: unavailable in this session. Targeted `rg` and bounded file reads
  were used as the fallback; all implementation decisions must be verified again
  against exact symbols before editing shared modules.

## Codebase findings

### Existing Local AI contracts

- `apps/web/shared/workerRuntime.ts` already defines `local_ai_task`, the local AI
  job families `local_ai_text`, `local_ai_vision`, and `local_ai_multimodal`, and a
  `localAiWorkerJobContractSchema`.
- The existing contract is narrow: provider IDs are only `ollama` and `lm_studio`,
  one provider config carries one model, and local-only loopback validation is the
  default. Feature 172 must preserve compatibility while adding arbitrary provider
  profiles and many model records.
- `packages/local-ai-core` and `apps/web/server/services/localAiCatalog.ts` model a
  separate device/browser Local AI catalog (Gemma/LiteRT-style profiles). This is
  not the same as Worker-backed server-routed models; the unified catalog must
  distinguish `sourceType=worker_app` from existing local-client profiles.
- `apps/web/server/routers/localAi.ts`, `localAiPolicy.ts`,
  `localAiSkillPolicy.ts`, and `localAiRuntimeMetadata.ts` already govern local
  client policy and disclosure. New Worker model selection must not silently
  change those local-client semantics.

### Existing Worker control plane

- Worker registration, heartbeat, claim, event, lease, and job-summary routes live
  in `apps/web/server/routes/workerRuntime.ts` and use bearer worker execution
  tokens plus scopes such as `workers:heartbeat`, `workers:claim`, and
  `workers:report`.
- `apps/web/server/services/workerRegistryService.ts` owns claim filtering,
  owner/group sharing checks, lease enforcement, status transitions, event
  persistence, and terminal billing reconciliation.
- `apps/web/shared/workerRuntime.ts` and `apps/worker-app/src-tauri/src/worker_control_plane.rs`
  are the shared protocol boundary. Existing job status values include
  `queued`, `claimed`, `preparing`, `running`, `completed`, `failed`, `canceled`,
  and `expired`.
- Worker runtime types currently include `remotion_executor` but not a dedicated
  LLM runtime. Keep the registered runtime type and add a capability family/model
  readiness contract; do not force an enum migration unless exact registration
  validation requires it.
- Existing event deduplication is not uniformly assignment-scoped for every job
  type. `llm_invoke` needs explicit assignment-scoped, database-atomic sequence
  deduplication.

### Existing data and authorization

- `workers` has `tenantId`, nullable `registeredByUserId`, `runtimeType`, status,
  capabilities, health, and `lastSeenAt`.
- `worker_jobs` already supports arbitrary `jobType`, pinned `workerId`, runtime
  type, capability requirements, input/instructions/output JSON, idempotency,
  lease, and retry state.
- `user_groups` has `tenantId`, `ownerId`, and `deletedAt`; `group_members` carries
  active/removed membership status.
- `users.updateConnectedWorkerSharing` currently permits a selected Group when the
  owner is either the group owner or an active member. Feature 172's approved
  product policy is stricter: only the Worker owner who created the Group may share
  the Worker to it. The implementation must tighten this without breaking other
  connected-worker sharing modes.
- Existing sharing policy is stored under
  `workers.capabilitiesJson.runtimeMetadata.workerSharingPolicy`. It must become a
  server-owned subdocument so heartbeat-reported capabilities cannot overwrite ACL.
- `workerAccessKeys.ts` has worker scopes and permission presets. Feature 172 needs
  a dedicated `llm:inventory` publication scope and job-type-specific `llm:chat`
  enforcement.

### Existing LLM catalog/routing

- `apps/web/server/services/enabledLlmModels.ts`, `llmRouter.ts`,
  `llmProviders.ts`, and consumers of `availableModels` are global/provider-centric.
- `apps/web/server/_core/llmRoutes.ts` and `localAi` paths already carry local-client
  runtime metadata. Worker-backed model references must be discriminated by
  `sourceType` and must not enter global `model_provider_map` or provider health.
- All LLM selectors require an audit of direct consumers, including Chat, Skill,
  Agent/Team, Plugin/MCP, Story/script/translation/planning workflows, and desktop
  surfaces. Media model pickers remain separate.

## Web research findings

- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility):
  usable through a partial OpenAI-compatible API; adapter must probe capabilities
  instead of assuming full compatibility.
- [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/):
  exposes multiple OpenAI-style endpoints and requires model-specific chat-template
  and capability handling.
- [LM Studio OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat):
  exposes model discovery and common completion endpoints; capability remains
  model/runtime-specific.
- [llama.cpp server API](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md):
  supports OpenAI-style endpoints but a server instance may expose one loaded model;
  catalog identity must therefore be independent of endpoint count.
- [LocalAI documentation](https://localai.io/docs/index.html): LocalAI presents an
  OpenAI-compatible surface over multiple backends and capabilities, so it fits the
  baseline adapter with per-model probing.

## Architecture decision

Use the existing Worker control plane and local AI job namespace as the transport,
but introduce a Cloud `worker_llm_models` projection and a single actor-aware LLM
catalog. Store endpoint/credentials only in Worker local storage; publish safe
metadata plus a stable `modelRef`. Explicit Worker selections are pinned and fail
closed; only preference policies may opt into visible fallback.

## Testing conventions

- Web/shared schema and service behavior: Vitest from repo root with workspace
  targeting; use focused test paths only.
- Worker protocol/adapter behavior: Rust unit tests in the existing Tauri test
  modules, with no service restart or package build.
- Database changes: Drizzle schema/migration tests and migration-order checks.
- Browser behavior: focused authenticated Playwright/browser tests only if an
  existing harness is available; do not claim browser proof from unit tests.
- Forbidden for this task: npm typecheck, build commands, and service restart.
