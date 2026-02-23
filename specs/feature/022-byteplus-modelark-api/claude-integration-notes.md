# Integration Notes: External Review Feedback

**Date:** 2026-02-23
**Review source:** Claude Opus 4.6 subagent
**Review file:** `reviews/iteration-1-self-review.md`

---

## What We're Integrating

### HIGH-1: Routing Architecture Rewrite ✅ INTEGRATING

**Finding:** The plan proposed `elif provider_name` branches in the Celery tasks (`media_tasks.py`), but the actual codebase routes through `LLMGateway` which is hardcoded to Kie.ai. No `provider_name` variable exists in the Celery tasks.

**Decision: Integrate fully.**

After reading the actual code:
- `generate_image_task` / `generate_video_task` Celery tasks call `LLMGateway(db).generate_image/video(request, user)`
- `LLMGateway.generate_image()` (in `gateway_unified.py:182`) checks `self.unified_client.kie_ai_client` and calls it directly
- The correct integration point is `LLMGateway.generate_image()` and `LLMGateway.generate_video()` — add routing based on `request.model` being in `BytePlusModelArkProvider.IMAGE_MODELS` or `VIDEO_MODELS`
- `recover_stuck_tasks` can detect the provider by checking if `task.model` is in the BytePlus model sets (no schema change needed — a model-based lookup is reliable and avoids a DB migration)

**Plan changes:**
- Phase 3 is rewritten: "Task Routing via LLMGateway" (not Celery task branches)
- `recover_stuck_tasks` extended with model-based provider detection

### HIGH-2: Node.js MEDIA_MODELS Registry ✅ INTEGRATING

**Finding:** `MEDIA_MODELS` in `mediaGenerationService.ts` is hardcoded to Kie.ai. BytePlus models must be registered there for correct provider selection and rate limiting.

**Decision: Integrate.** This is clearly correct — without it, BytePlus model IDs would fall back to `provider: "kie.ai"` at rate limiting.

**Plan changes:**
- Add new Node.js Phase: "Update MEDIA_MODELS registry and TypeScript types"
- Add all 6 BytePlus models with `provider: "byteplus_modelark"`, correct `type`, `creditCost`, and capabilities

### HIGH-3: Provider Detection for Polling ✅ INTEGRATING (model-based approach)

**Finding:** `recover_stuck_tasks` is hardcoded to `get_media_provider_key("kie_ai")` for all tasks, with no way to detect which provider a task belongs to.

**Decision: Integrate, using model-name detection** (not a schema change). The `MediaTask` record has a `model` column. We can check if `task.model` is in `BytePlusModelArkProvider.VIDEO_MODELS` to route to BytePlus, otherwise default to Kie.ai. This avoids a DB migration.

**Plan changes:** `recover_stuck_tasks` extension in Phase 3 describes model-based provider detection.

### HIGH-4: httpx Timeout Configuration ✅ INTEGRATING

**Finding:** A single `httpx.AsyncClient` cannot have different timeouts for image generation (90s) vs status polling (30s).

**Decision: Integrate.** Use per-request timeout overrides via `httpx.Timeout` on individual calls, keeping a single client instance (simpler than two clients).

**Plan changes:** §2.1 updated to describe per-request timeout overrides.

### HIGH-5: Cost Calculation Architecture ✅ INTEGRATING (partially)

**Finding:** Cost calculation needs to integrate with the LLMGateway credit pipeline, not the Celery task layer.

**Decision: Integrate partially.** After reading `LLMGateway.generate_image()`, the credit pipeline calls `_estimate_cost()` upfront and `_deduct_credits()` after. For BytePlus, we'll use the same mechanism: estimate credits from model config upfront (like Kie.ai does), then after the call, update the usage log with actual tokens if available. The `calculate_cost_usd()` helper on the adapter is still useful for the update step.

**Plan changes:** Cost tracking is noted as happening at the gateway layer, with the adapter's `calculate_cost_usd()` feeding the usage log update after the call.

---

## What We're NOT Integrating

### MEDIUM-3: Prompt injection via user `--` flags

**Not integrating.** BytePlus's API puts the text prompt and inline params in the same string. Sanitizing user prompts to strip `--` would change intended behavior (a legitimate prompt like "set --mode creative" would be broken). The inline params we add at the end will take precedence as they are appended after user text. We document this as an accepted trade-off.

### MEDIUM-4: R2 signed URL expiry for I2V

**Not integrating as a plan change.** The gateway already resolves R2 URLs via `r2_service.resolve_reference_urls()`. This same mechanism is used for the BytePlus I2V reference image. If the existing flow already returns public URLs, BytePlus will work the same as Kie.ai. We note this assumption and verify it during implementation.

### MEDIUM-6: Connection test deep test

**Not integrating.** The connection test using `GET /contents/generations/tasks?page_size=3` is sufficient for verifying auth. Model activation is a BytePlus console operation, documented in the admin setup guide.

### LOW-3: Test directory convention

**Not integrating as a plan change.** We verify the test path during implementation (Phase 4). If `tests/providers/` doesn't exist, we create it or use the existing top-level path.

### LOW-4: Shared normalization module

**Not integrating.** Creating a shared normalization module is a refactoring concern beyond this feature's scope. We note the pattern could be unified later.

---

## Summary of Plan Changes

The revised plan restructures Phase 3 entirely:

**Before:** Modify Celery task functions to add `elif provider_name` branches (wrong)

**After:**
- Phase 3.1: Extend `LLMGateway.generate_image()` with model-name-based BytePlus routing
- Phase 3.2: Extend `LLMGateway.generate_video()` with model-name-based BytePlus routing
- Phase 3.3: Extend `recover_stuck_tasks` with model-name-based BytePlus detection
- Phase 3.4: Add status normalization helpers `_normalize_byteplus_task_state()` and `_extract_byteplus_result_url()` to `media_tasks.py`

New Node.js item added:
- Phase 1.4: Update `MEDIA_MODELS` registry and TypeScript union types in `mediaGenerationService.ts`
