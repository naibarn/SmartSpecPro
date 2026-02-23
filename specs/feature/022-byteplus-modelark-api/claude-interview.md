# Interview Transcript: Feature 022 — BytePlus ModelArk API Integration

**Date:** 2026-02-23
**Interviewer:** Claude (deep-plan workflow)
**Topic:** Implementation decisions for BytePlus ModelArk adapter

---

## Q1: Provider routing layer

**Question:** The spec (§4.3) describes adding BytePlus routing directly in `media_tasks.py`, but the existing KieAI routing actually goes through `gateway_unified.py` (LLMGateway). Which approach should we follow for BytePlus?

**Answer:** Follow the spec — add routing in `media_tasks.py` (Recommended).

Avoids touching the complex gateway. More surgical change. Spec describes this approach explicitly.

---

## Q2: I2V reference image URL type

**Question:** For I2V (image-to-video), BytePlus requires a PUBLIC URL for the reference image. How are reference images currently stored in your system — are R2/S3 URLs public or signed (time-limited)?

**Answer:** Public URLs (no expiry).

R2/S3 configured for public bucket — URLs work forever. BytePlus can fetch them directly without any URL pre-processing needed.

---

## Q3: Failure error handling UX

**Question:** When a BytePlus video task fails (status: 'failed' or 'cancelled'), what error information should be shown to users vs. logged internally?

**Answer:** Match existing KieAI error handling (whatever that does).

Consistency with existing provider behavior is the priority.

---

## Q4: Credit tracking approach

**Question:** BytePlus returns `usage.total_tokens` in responses. How should credit consumption be tracked for BytePlus generation tasks?

**Answer:** Use BytePlus token usage to calculate actual cost dynamically.

Use `usage.total_tokens` with a rate formula to calculate actual USD cost and map to credits.

---

## Q5: Test connection endpoint

**Question:** The `testConnection` button in admin/media-providers needs a lightweight BytePlus API call. Which approach is preferred?

**Answer:** (User provided specific curl example):
```
GET https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks?page_size=3&filter.status=succeeded
Headers:
  Content-Type: application/json
  Authorization: Bearer $ARK_API_KEY
```

Use `GET /api/v3/contents/generations/tasks?page_size=3&filter.status=succeeded` with the Bearer token. A 200 or 401 response confirms connectivity and API key validity.

---

## Q6: Watermark control

**Question:** Should the watermark setting be controlled at the admin/model level (via configJson) only, or should MediaStudio users be able to toggle it per-generation?

**Answer:** Admin-only via `configJson.defaultWatermark` (Recommended).

Simpler UI. No per-generation toggle needed. Model configJson controls watermark default.

---

## Q7: BytePlus token cost rate

**Question:** What is the BytePlus token cost rate to use?

**Answer:** Dynamic calculation using `usage.total_tokens`:

**Formula:** `cost (USD) = (usage.total_tokens / 1,000,000) × 2.5`

**Rate:** $2.5 USD per 1M tokens

**Applies to:** Both Text-to-video and Image-to-video (same rate)

The field `usage.completion_tokens` counts video output tokens; `usage.total_tokens` covers everything. Use `total_tokens` for the cost calculation.

---

## Q8: Image token pricing

**Question:** What is the pricing for Seedream image generation?

**Answer:** Same as video — $2.5 USD / 1M tokens.

Use one unified rate constant for both image (Seedream) and video (Seedance) generation.

**Rate constant:** `BYTEPLUS_USD_PER_1M_TOKENS = 2.5`
**Formula:** `cost_usd = (usage.total_tokens / 1_000_000) * BYTEPLUS_USD_PER_1M_TOKENS`

---

## Q9: Credit reporting from Python task

**Question:** When `media_tasks.py` bypasses the gateway for BytePlus, credits are already deducted at the Node.js tRPC level. Does the Python task need to report actual credit usage back?

**Answer:** Match KieAI behavior — whatever it does for credit reporting.

Consistency is the priority. Study how KieAI returns credit usage from the Celery task and replicate that for BytePlus.

---

## Q10: Polling mechanism

**Question:** Should BytePlus integration be added to the existing `recover_stuck_tasks` periodic task, or get its own dedicated polling task/queue?

**Answer:** Extend existing `recover_stuck_tasks` (Recommended).

Consistent with KieAI. Single polling supervisor for all providers.

---

## Q11: Rate limits and edge cases

**Question:** Are there any other constraints or edge cases?

**Answer:**
- **RPM:** 300 requests per minute (rate limit)
- **Concurrency:** 5 concurrent tasks maximum

Implications:
- Must handle 429 (Too Many Requests) responses gracefully
- Polling calls for `recover_stuck_tasks` also count toward the 300 RPM limit
- 429 responses should trigger retry with backoff, not mark task as failed
- Concurrent generation should be tracked if possible (or trust BytePlus's 429 to manage this)

---

## Summary of Key Decisions

| Decision | Choice |
|----------|--------|
| Routing layer | `media_tasks.py` directly (not gateway) |
| I2V URL type | Public R2 URLs — no conversion needed |
| Error handling | Match KieAI pattern |
| Credit tracking | Dynamic: `(total_tokens / 1M) × $2.50` USD |
| Credit reporting | Match KieAI behavior |
| Test connection | `GET /contents/generations/tasks?page_size=3&filter.status=succeeded` |
| Watermark control | Admin-only via `configJson.defaultWatermark` |
| Token rate | $2.50 / 1M tokens (images + video same rate) |
| Polling mechanism | Extend `recover_stuck_tasks` |
| Rate limits | 300 RPM, 5 concurrent — handle 429 with backoff |
