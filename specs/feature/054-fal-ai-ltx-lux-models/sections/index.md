<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-provider-template
section-02-seed-script
section-03-python-provider
section-04-gateway-routing
section-05-celery-polling
section-06-security-ssrf
section-07-rate-limiting
section-08-credit-reconciliation
section-09-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-provider-template | - | section-02 | Yes |
| section-02-seed-script | section-01 | - | No |
| section-03-python-provider | - | section-04, section-05 | Yes |
| section-04-gateway-routing | section-03 | section-05, section-08 | No |
| section-05-celery-polling | section-03, section-04 | section-08 | No |
| section-06-security-ssrf | - | - | Yes |
| section-07-rate-limiting | - | - | Yes |
| section-08-credit-reconciliation | section-04, section-05 | - | No |
| section-09-tests | section-03, section-04, section-05 | - | No |

## Execution Order

1. **Batch 1** (parallel): section-01-provider-template, section-03-python-provider, section-06-security-ssrf, section-07-rate-limiting
2. **Batch 2** (sequential): section-02-seed-script (after 01), section-04-gateway-routing (after 03)
3. **Batch 3**: section-05-celery-polling (after 03, 04)
4. **Batch 4**: section-08-credit-reconciliation (after 04, 05)
5. **Batch 5**: section-09-tests (after 03, 04, 05)

## Section Summaries

### section-01-provider-template
Update `PROVIDER_TEMPLATES` in `mediaProviders.ts` and `DEFAULT_PROVIDERS` in `seed-media-providers.ts` to add LTX-2.3 video models, Lux TTS audio, and Flux image models. Fix `testFalAI()` to use authenticated POST probe.

**Files:** `apps/web/server/routers/mediaProviders.ts`, `apps/web/scripts/seed-media-providers.ts`

### section-02-seed-script
Create `seed-media-models-fal-ai.ts` with 12 model definitions (7 LTX-2.3 video, 1 Lux TTS, 4 Flux image) including composite pricing tier keys, inputFields, and all metadata.

**Files:** `apps/web/scripts/seed-media-models-fal-ai.ts`

### section-03-python-provider
Create `fal_ai_provider.py` with FalAIProvider class: generate_video (queue), generate_audio (sync TTS), generate_image (sync Flux), queue status/result polling, SSRF validation with host.docker.internal rejection, prompt sanitization, error message sanitization, video file size limit, and aclose(). Export in `providers/__init__.py`.

**Files:** `python-backend/app/llm_proxy/providers/fal_ai_provider.py`, `python-backend/app/llm_proxy/providers/__init__.py`

### section-04-gateway-routing
Add fal_ai to `_normalize_provider_id()`. Add routing blocks in `generate_video()`, `generate_audio()`, `generate_image()`. Include concurrent task limit check (max 3 per user).

**Files:** `python-backend/app/llm_proxy/gateway_unified.py`

### section-05-celery-polling
Add fal.ai branch in `_recover_stuck_tasks_async()`: detect by model ID, poll queue status, store actual_duration/actual_resolution in result_data, handle COMPLETED/FAILED states, implement 30-min queue timeout.

**Files:** `python-backend/app/tasks/media_tasks.py`

### section-06-security-ssrf
Add tRPC-level SSRF defense-in-depth: Zod `.refine()` on `extraParams` that validates URL-like string values don't target internal hosts. Applies to all media providers.

**Files:** `apps/web/server/routers/media.ts`

### section-07-rate-limiting
Implement Redis-based rate limiter for Lux TTS: 5 requests per 10 minutes per user. Wire into media router for `fal-ai/lux-tts` model.

**Files:** `apps/web/server/services/rateLimiter.ts`, `apps/web/server/routers/media.ts`

### section-08-credit-reconciliation
Add post-completion credit reconciliation in Node.js media status handler. When task completes with actual_duration in result_data: compute actual cost, compare to pre-reserved, refund or charge difference.

**Files:** `apps/web/server/routers/media.ts`

### section-09-tests
Write Python unit tests for FalAIProvider (provider methods, SSRF, error handling) and TypeScript tests for pricing calculator (composite tier keys, per-unit TTS pricing).

**Files:** `python-backend/tests/unit/services/test_fal_ai_provider.py`, `python-backend/tests/unit/services/test_fal_ai_ssrf.py`
