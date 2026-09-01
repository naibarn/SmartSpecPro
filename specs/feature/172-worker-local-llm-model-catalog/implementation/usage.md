# Worker Local LLM usage guide

## Quick start

1. In the Worker App Settings screen, add one or more local providers (Ollama,
   LM Studio, LocalAI, vLLM, llama.cpp, or OpenAI-compatible).
2. Set a credential reference if needed, then use **Set secret**. The secret is
   written to the OS keyring and is never saved in the registry or sent to Web.
3. Add each model with its provider binding, model ID, capabilities, and context
   window. The Worker publishes the inventory after its next heartbeat.
4. In Web Settings → Workers, set the Worker to Private or select Groups created
   by the Worker owner. Members of those Groups can select the published models.

## Main entry points

- Tauri commands: `worker_app_get_local_llm_registry`,
  `worker_app_save_local_llm_provider`, `worker_app_save_local_llm_model`,
  delete commands, and keyring credential commands.
- Inventory API: `POST /api/workers/:workerId/llm/inventory` with
  `Idempotency-Key` and the `llm:inventory` scope.
- Web catalog APIs: `llmProviders.availableModels`,
  `llmProviders.workerLocalModels`, and
  `multiProvider.getAvailableModelsWithProviders`.
- Explicit model IDs use the opaque `wllm_...` model reference and enqueue the
  pinned `llm_invoke` Worker job. They do not fall back to cloud providers.

## Operational notes

- Inventory rows become unavailable when the Worker is offline, stale, disabled,
  tombstoned, or missing the requested capability.
- Local inference is zero-cost by default; existing skill/platform fee policy is
  still applied where the caller already requires it.
- Browser/live-provider/deployed migration verification was not run in this task.
