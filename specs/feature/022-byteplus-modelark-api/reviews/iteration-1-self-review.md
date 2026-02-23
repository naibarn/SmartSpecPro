# Implementation Plan Review: Feature 022 -- BytePlus ModelArk API Integration

**Reviewer:** Claude Opus 4.6 (subagent review)
**Plan file:** `specs/feature/022-byteplus-modelark-api/claude-plan.md`
**Spec file:** `specs/feature/022-byteplus-modelark-api/spec.md`
**Date:** 2026-02-23

---

## Critical Architectural Mismatch (HIGH-1)

### The plan's routing strategy fundamentally misunderstands the existing media pipeline

**What the plan says (Phase 3):**
The plan proposes adding `elif provider_name == "byteplus_modelark":` branches directly inside `generate_image_task` and `generate_video_task` Celery tasks in `python-backend/app/tasks/media_tasks.py`.

**What the code actually does:**
The existing Celery tasks (`generate_image_task`, `generate_video_task`) do NOT contain any provider-name branching logic. They route everything through `LLMGateway`:

```python
request = ImageGenerationRequest(**request_data)
gateway = LLMGateway(db)
response = await gateway.generate_image(request, user)
```

And `LLMGateway.generate_image()` in `python-backend/app/llm_proxy/gateway_unified.py` is **hardcoded to use `kie_ai_client`** — it does not have any provider routing logic. It calls `self.unified_client.kie_ai_client.generate_image(...)` directly.

**Why this matters:**
The plan says "add an `elif provider_name == "byteplus_modelark":` branch after the existing Kie.ai branch" — but there IS no existing Kie.ai branch in the Celery tasks. There is no `provider_name` variable in those tasks at all.

Similarly, the `recover_stuck_tasks` function is hardcoded to use `get_media_provider_key("kie_ai")` for ALL stuck tasks. There is no per-task provider detection.

**Recommendation:**
The plan must be rewritten for one of two approaches:

**Option A (Smaller scope, recommended):** Modify `LLMGateway.generate_image()` and `LLMGateway.generate_video()` to check the model name against `BytePlusModelArkProvider.IMAGE_MODELS` / `VIDEO_MODELS` and route accordingly. The `recover_stuck_tasks` function must also be extended to look up which provider a task belongs to (by reading the model and checking which provider's model set it belongs to, or by storing `provider_name` in the `MediaTask` record).

**Option B (Bigger refactor):** Add a `provider_name` field to the `MediaTask` model and to the Celery task arguments so that routing can be done explicitly. This is cleaner but requires a database migration.

Without addressing this, the implementation will not work at all.

---

## HIGH Severity Findings

### HIGH-2: Node.js MEDIA_MODELS registry not updated

**What:** The plan does not mention updating the `MEDIA_MODELS` constant in `apps/web/server/services/mediaGenerationService.ts`. This hardcoded registry maps model IDs to their provider, type, credit cost, and capabilities.

**Why it matters:** The Node.js `mediaGenerationService` uses `MEDIA_MODELS[modelId]` to determine the provider for rate limiting. If BytePlus models are not in this registry, they will fall back to `provider: "kie.ai"` for rate limiting, and their rate limits will be mixed with Kie.ai's.

**Recommendation:** Add all 6 BytePlus models to `MEDIA_MODELS` with `provider: "byteplus_modelark"` and appropriate metadata. Also add BytePlus model IDs to the `ImageModel` and `VideoModel` union types.

### HIGH-3: No provider identifier stored on MediaTask for polling

**What:** The `recover_stuck_tasks` function currently assumes all stuck tasks belong to Kie.ai. The plan says to "add a branch for `provider_name == "byteplus_modelark"`" but does not explain how the function will determine which provider a task belongs to.

**Why it matters:** When `recover_stuck_tasks` runs, it iterates over ALL tasks with status `PROCESSING`. There is no column or field on the `MediaTask` record that stores which provider was used. The function cannot distinguish BytePlus tasks from Kie.ai tasks without this information.

**Recommendation:** Either:
1. Store the provider name in `MediaTask.parameters` or a new column, and read it in `recover_stuck_tasks`.
2. Look up the model in a provider-to-model mapping (fragile but works without schema changes).
3. Add a `provider` column to `MediaTask` (safest, requires DB migration, follows the Database Safety Protocol).

### HIGH-4: httpx.AsyncClient timeout configuration is insufficient

**What:** The plan specifies "90s read for image generation, 30s for polling" in a single `httpx.AsyncClient` instance. But a single `httpx.AsyncClient` can only have one timeout configuration.

**Why it matters:** BytePlus image generation is synchronous and could take up to 90 seconds. Polling requests should be fast (5-10s). If you use 90s for both, a hung polling request wastes 90s before timing out.

**Recommendation:** Either use two separate `httpx.AsyncClient` instances (one for generation, one for polling), or use per-request timeout overrides via `httpx.Timeout` passed to individual requests.

### HIGH-5: Cost calculation architecture conflict

**What:** The plan proposes a `calculate_cost_usd(total_tokens)` method. However, the existing credit pipeline works differently: `LLMGateway` handles cost estimation, credit checking, and credit deduction. The Celery tasks do not perform cost calculations — they receive credit deductions from the gateway.

**Why it matters:** If the BytePlus routing is done at the `LLMGateway` level (as it should be per HIGH-1), the cost calculation needs to happen inside `LLMGateway.generate_image()` and `generate_video()`, not in the Celery task.

**Recommendation:** Integrate cost calculation into the gateway layer. For image generation (synchronous), the response includes `usage.total_tokens` which can be used for actual cost. For video generation (async), estimate cost upfront and reconcile after polling completes.

---

## MEDIUM Severity Findings

### MEDIUM-1: Spec and plan disagree on configJson approach

**What:** The spec (Section 4.3) suggests an "alternative approach (preferred)" using `apiQueryEndpoint` in `configJson` to reuse existing polling infrastructure. The plan (Phase 3.4) describes building custom polling logic. These are two different approaches and the plan does not explain the deviation.

**Why it matters:** The existing KieAI polling code expects Kie.ai response shapes, so it will not work for BytePlus responses without modification.

**Recommendation:** Be explicit about why custom normalization is needed — the BytePlus response format (top-level `status`, `content[].video_url.url`) is fundamentally different from Kie.ai's format. Document this decision clearly.

### MEDIUM-2: Missing handling for video cost/token tracking

**What:** For async video generation, the initial task creation response does NOT include token usage — tokens are only reported in the completed status response.

**Why it matters:** Credits are deducted upfront. The actual token-based cost is only known after the video completes (potentially minutes later). There is no reconciliation mechanism.

**Recommendation:** Document whether BytePlus video tokens are in the task creation or completion response, and address credit reconciliation.

### MEDIUM-3: `_build_inline_params` prompt injection risk partially addressed

**What:** The plan validates `resolution` and `duration` against allowlists, which is correct. However, user-provided prompt text concatenated with inline params could allow users to embed their own `--resolution` flags.

**Recommendation:** Strip `--` prefixed tokens from user prompt text before concatenation, or document as an accepted risk if BytePlus's parsing is safe.

### MEDIUM-4: R2 reference image URL assumption for I2V

**What:** The plan assumes R2 returns permanent public URLs for reference images. But signed/expiring URLs could expire before BytePlus fetches them (especially for queued tasks).

**Recommendation:** Verify R2 returns permanent public URLs. If it returns signed URLs, check expiry time against maximum BytePlus processing time.

### MEDIUM-5: Missing error handling for 4xx responses

**What:** The plan mentions handling HTTP 429 (rate limit) specifically but not 400, 403, or 500-series errors.

**Recommendation:** Add comprehensive HTTP error mapping: don't retry on 4xx (except 429), do retry on 5xx, log quota warnings on 403.

### MEDIUM-6: Connection test endpoint may fail for new accounts

**What:** The connection test via `GET /contents/generations/tasks` verifies auth but not model activation.

**Recommendation:** Document that model activation must be verified separately in BytePlus console.

---

## LOW Severity Findings

### LOW-1: SIZE_MAP completeness

**What:** The plan defines SIZE_MAP for pixel sizes but if input is already `"2K"`, the lookup would miss it.

**Recommendation:** Add identity mappings: `"1K" -> "1K"`, `"2K" -> "2K"`, `"4K" -> "4K"` to the SIZE_MAP.

### LOW-2: Pricing constant may be inaccurate

**What:** `BYTEPLUS_USD_PER_1M_TOKENS = 2.5` is used as a flat rate for all models. BytePlus may have different pricing for image vs video, or different tiers.

**Recommendation:** Verify pricing and consider making configurable per-model via `configJson`.

### LOW-3: Test file location

**What:** Tests placed in `python-backend/tests/providers/` — verify this directory exists and matches existing test conventions.

### LOW-4: Duplicate status normalization code

**What:** The plan duplicates normalization logic in `media_tasks.py`. Multiple copies already exist across the codebase.

**Recommendation:** Consider a shared normalization module to reduce code duplication.

### LOW-5: Effective polling interval vs spec

**What:** The plan says `recover_stuck_tasks` runs every 2 minutes. BytePlus spec suggests polling every 5 seconds.

**Recommendation:** Document that the effective polling interval will be 2 minutes (the beat schedule), not 5 seconds. This is a reasonable trade-off but should be noted.

---

## Overall Assessment

The plan demonstrates good understanding of the BytePlus API surface and security requirements (SSRF prevention, inline param validation, API key handling). The test plan is comprehensive.

However, the plan has a **critical architectural flaw**: it proposes modifying code paths that do not match the actual codebase structure. The actual media generation pipeline routes through `LLMGateway` which is hardcoded to Kie.ai. The `recover_stuck_tasks` function has no per-task provider identification. These issues must be resolved before implementation begins.

**Recommendation: Revise the plan** with the implementer reading the actual `gateway_unified.py` and `media_tasks.py` code paths end-to-end before rewriting Phases 2-3.
