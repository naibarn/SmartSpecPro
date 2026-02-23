# Review Summary: Feature 022 — BytePlus ModelArk Integration

**Date:** 2026-02-23
**Plan:** `claude-plan.md`
**Review source:** Claude Opus 4.6 subagent

---

## High-Impact Items (must address)

| # | Finding | Category | Impact |
|---|---------|----------|--------|
| 1 | **Routing architecture mismatch** — Plan proposes `elif provider_name` branches in Celery tasks, but actual code routes through `LLMGateway` which is hardcoded to Kie.ai. No `provider_name` variable exists in the Celery tasks. | HIGH-1 | Blocks all of Phase 3 |
| 2 | **Provider identification for polling** — `recover_stuck_tasks` cannot distinguish BytePlus tasks from Kie.ai tasks without provider stored on MediaTask. | HIGH-3 | Blocks video polling |
| 3 | **Node.js MEDIA_MODELS registry not updated** — BytePlus models must be added to the hardcoded `MEDIA_MODELS` registry in `mediaGenerationService.ts` or rate limiting will misroute. | HIGH-2 | Blocks Node.js routing |
| 4 | **Cost calculation architecture conflict** — Cost tracking needs to integrate with LLMGateway credit pipeline, not the Celery task layer where plan proposes it. | HIGH-5 | Breaks credit accounting |
| 5 | **httpx timeout misconfiguration** — Cannot have 90s and 30s timeouts on a single client instance; need separate clients or per-request timeouts. | HIGH-4 | Runtime error potential |

---

## Medium-Impact Items (should address)

| # | Finding | Category | Impact |
|---|---------|----------|--------|
| 6 | Spec/plan disagree on polling approach (configJson vs custom); needs explicit justification | MEDIUM-1 | Clarity |
| 7 | Video token cost only known at completion, but credits deducted upfront — reconciliation unaddressed | MEDIUM-2 | Credit accuracy |
| 8 | User prompt can contain `--resolution` flags that could conflict with programmatically added inline params | MEDIUM-3 | Security |
| 9 | R2 signed URL expiry vs BytePlus fetch timing for I2V reference images | MEDIUM-4 | Correctness |
| 10 | Missing 400/403/500 error handling (only 429 addressed) | MEDIUM-5 | Reliability |

---

## Low-Impact Items (address during implementation)

| # | Finding | Recommendation |
|---|---------|---------------|
| 11 | SIZE_MAP missing identity mappings for `"1K"`, `"2K"`, `"4K"` inputs | Add identity mappings |
| 12 | Pricing constant `$2.50/1M` unverified for all model tiers | Verify or make configurable |
| 13 | Test directory `tests/providers/` may not exist | Follow existing test convention |
| 14 | Duplicate status normalization code | Consider shared module |
| 15 | 2-minute beat vs 5-second spec polling interval | Document as deliberate trade-off |

---

## Key Decision Required

**HIGH-1 requires an architectural decision:**

**Option A (Recommended):** Modify `LLMGateway.generate_image()` and `LLMGateway.generate_video()` to route by model name — checking against `BytePlusModelArkProvider.IMAGE_MODELS`/`VIDEO_MODELS`. Requires reading and modifying `gateway_unified.py`.

**Option B:** Add `provider_name` field to `MediaTask` (requires DB migration, Database Safety Protocol applies). Gives explicit routing at the task level — no model-set lookups.

This decision must be made before Phase 2/3 implementation begins.
