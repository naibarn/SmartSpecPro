# Review Summary: Iteration 1

**Date:** 2026-02-23
**Source:** Claude Opus 4.6 architectural review
**Plan:** claude-plan.md (15 sections, 648 lines)

---

## Prioritized Improvements

### HIGH IMPACT (blocking — must address before implementation)

| # | Finding | Sections Affected | Classification |
|---|---------|-------------------|---------------|
| H1 | Nginx exposes `/internal/slide-render/` publicly; localhost check is incomplete (missing IPv6, deprecated API) | 5.1, 14 | **high-impact** |
| H2 | JWT passed as query parameter (`?token=`) leaks to access logs; use `X-Internal-Token` header instead | 5.1, 7.2 | **high-impact** |
| H3 | Section 14 (Dockerfile/Playwright) listed last but must precede Section 7 (Celery task); Python import fails without Chromium | Implementation Order | **high-impact** |
| H4 | `presentation_export` Celery queue not registered in `celery_app.py`; tasks will be misrouted or silently dropped | 7.1, celery_app.py | **high-impact** |

### HIGH IMPACT (non-blocking — should address before implementation)

| # | Finding | Sections Affected | Classification |
|---|---------|-------------------|---------------|
| M3 | Wrong storage function: `storagePut` → should be `storagePresignGet`; 48h URL exceeds 24h cap | 3.2, 3.3 | **high-impact** |
| M5 | Python JWT signing not specified: missing `JWT_SECRET` env var, PyJWT dependency, claims structure | 7.2 | **high-impact** |
| M8 | Playwright uses `localhost:3000` which is unreachable from Docker container; need `host.docker.internal` | 7.2 | **high-impact** |

### LOW IMPACT (nice-to-have, integrate where easy)

| # | Finding | Sections Affected | Classification |
|---|---------|-------------------|---------------|
| M1 | JSONB vs JSON column type inconsistency with existing `slideContent` | 1.2 | **low-impact** |
| M2 | `exportId` type change (string→number) is a breaking contract change; needs all affected files listed | 2.4 | **low-impact** |
| M4 | FK `onDelete` behavior not specified for `deckId` and `userId` | 1.1 | **low-impact** |
| M6 | Dual deduplication (in-memory + DB) interaction not documented | 3.2 | **low-impact** |
| M7 | `page.pdf()` may not match visual editor output; PNG→PDF conversion more reliable | 7.2 | **low-impact** |
| L1 | Slide render route must fetch and inline `slideContent` (not just slideshow metadata) | 5.2 | **low-impact** |
| L3 | FPS default mismatch: plan says 25, existing code uses 30 | 1.1 | **low-impact** |
| L6 | Missing `tenantId` index on `presentation_exports` | 1.1 | **low-impact** |
| L7 | Expired presigned URL stored in DB; store S3 key for re-presigning | 3.2, 1.1 | **low-impact** |

### SKIP (out of scope or cosmetic)

| # | Finding | Reason |
|---|---------|--------|
| L2 | `window.__slideReady` no failure mode | Acceptable timeout; log warning sufficient |
| L4 | AudioTrackPlayer Web Audio API for smoother fade | Implementation detail, `audio.volume` is acceptable |
| L5 | Credit tracking for exports | Out of scope for this feature unless owner decides otherwise |
| L8 | `cancelled` status unreachable | Reserve comment is sufficient; no code change needed |

---

## Recommendations Summary

1. **Fix Nginx + localhost check (H1):** Add `location /internal/ { deny all; return 403; }` to Nginx config; update route to use `req.socket.remoteAddress` checking all three loopback variants.
2. **Fix JWT transport (H2):** Switch from `?token=` query param to `X-Internal-Token` request header in both Section 5 (Node.js) and Section 7 (Python).
3. **Reorder implementation (H3):** Move Section 14 to position 6 in the implementation order.
4. **Register Celery queue (H4):** Explicit step to add `Queue("presentation_export")` and `task_routes` entry to `celery_app.py`.
5. **Fix storage API (M3):** Replace `storagePut`/`getSignedUrl` with `storagePresignGet(key, 3600)`.
6. **Specify Python JWT signing (M5):** Add PyJWT dependency, `JWT_SECRET` env var, and exact claims structure.
7. **Fix Docker networking (M8):** Use `INTERNAL_RENDER_BASE_URL` env var defaulting to `host.docker.internal:3000` in Docker.
8. **Clarify JSON column type (M1):** Use `json()` for consistency, or explicitly choose `jsonb()` with rationale.
9. **Document breaking exportId change (M2):** List all affected files for simultaneous update.
10. **Add FK onDelete (M4):** `cascade` for `deckId`, `set null` for `userId`.
