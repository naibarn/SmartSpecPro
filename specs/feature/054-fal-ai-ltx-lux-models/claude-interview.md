# Interview Transcript — 054 fal.ai LTX-2.3 & Lux TTS Integration

Date: 2026-03-22

---

## Q1. Pricing tier key approach — composite keys vs per-second rates?

**Answer:** Composite keys (pre-computed).

Use composite keys like `"1080p-6s": 360` matching the BytePlus pattern. No changes needed to `pricingCalculator.ts`. More tier entries but zero risk of calculation bugs affecting other providers.

---

## Q2. Post-generation credit reconciliation — pre-reserve only or full reconciliation?

**Answer:** Full reconciliation.

Implement full reconciliation: pre-reserve credits based on user-selected params, then reconcile after completion based on actual output duration from fal.ai response. Store `actual_duration` in `result_data` and add reconciliation logic in media status handler.

---

## Q3. Re-hosting fal.ai CDN URLs to R2/S3?

**Answer:** Direct URL (no re-hosting).

Store fal.ai CDN URLs directly, same as BytePlus pattern. Simpler, faster. fal.ai URLs are long-lived. Re-hosting can be added later as a cross-provider improvement.

---

## Q4. fal.ai API key availability?

**Answer:** Has key, will configure via admin UI after implementation.

Plan focuses on code only. User will add FAL_KEY via admin UI after implementation is complete.

---

## Q5. Should fal_ai_provider.py include generate_image() for Flux models?

**Answer:** Include image routing.

Implement `generate_image()` for Flux models in `fal_ai_provider.py` and add `fal_ai` routing in gateway `generate_image()`. Makes the fal.ai provider complete.

---

## Q6. TTS rate limiting — in-memory or Redis-based?

**Answer:** Redis-based.

Use Redis-based rate limiting for Lux TTS due to voice cloning abuse concerns. Diverges from existing in-memory pattern but provides more robust protection.

---

## Q7. SSRF validation scope — Python only or both tRPC + Python?

**Answer:** Both layers (defense-in-depth).

Add SSRF validation in both:
1. Python `FalAIProvider._validate_urls()`
2. tRPC Zod `.refine()` on `extraParams`

The tRPC check benefits all providers as defense-in-depth.

---

## Q8. Credit overcharge policy — cap at pre-reserved or charge actual?

**Answer:** Charge actual amount.

Always charge based on actual output duration/resolution. If actual > estimated, charge the difference. More accurate cost recovery, even if it could surprise users slightly.

---

## Q9. Seed script scope — 8 new models only or include Flux images?

**Answer:** All 8 + Flux images.

Include Flux Schnell, Flux Dev, Flux Pro, SD3 Medium in `seed-media-models-fal-ai.ts` alongside the 7 LTX-2.3 video + 1 Lux TTS. Complete fal.ai model catalog in one script.

---

## Q10. Per-user concurrent fal.ai task limit?

**Answer:** Include it.

Add the per-user concurrent task limit (max 3 in-flight fal.ai tasks) in gateway `generate_video()`. Simple SQL count query, low effort, prevents abuse.

---

## Summary of Key Decisions

| Decision | Choice | Impact |
|----------|--------|--------|
| Pricing keys | Composite (`"1080p-6s": 360`) | No pricingCalculator changes |
| Credit reconciliation | Full (actual vs reserved) | Need media status handler changes |
| URL re-hosting | Direct URL (no re-hosting) | Simpler polling branch |
| Image routing | Include Flux models | Expand fal_ai_provider scope |
| TTS rate limit | Redis-based | New pattern, diverges from existing |
| SSRF validation | Both layers | tRPC + Python defense-in-depth |
| Overcharge policy | Charge actual | May charge more than estimated |
| Seed scope | 8 new + 4 Flux = 12 models | Complete fal.ai catalog |
| Concurrent limit | Include (max 3) | Added to gateway |
