# Integration Notes: Opus Review Feedback

**Date:** 2026-02-23
**Review source:** iteration-1-opus-review.md

---

## Integrating

### H1 — Nginx exposure + incomplete localhost check
**Integrate: YES**
Critical security issue. Nginx's catch-all `location /` would proxy the internal route to the public. Must add `location /internal/ { deny all; }` to Nginx config explicitly. Also update Section 5.1 to use `req.socket.remoteAddress` and check all three loopback variants (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`). Adding Nginx change as a required step in Section 5.

### H2 — JWT in query param leaks to logs
**Integrate: YES**
Project rules explicitly forbid secrets in URL query params. Switching to `X-Internal-Token` header in Section 5 (Node.js validation) and Section 7 (Python Playwright header injection). Low implementation cost, removes a valid log-leakage risk.

### H3 — Implementation order: Section 14 must precede Section 7
**Integrate: YES**
Logically correct. Moving Section 14 (Dockerfile) to position 6. Python render code cannot be imported without Playwright/Chromium in the container.

### H4 — Celery queue not registered
**Integrate: YES**
Without explicit queue registration and task_routes, the worker may silently ignore tasks on the new queue. Adding an explicit sub-step to Section 7 (and a modification to `celery_app.py`) covering: `Queue("presentation_export")`, `task_routes` entry, and worker startup command.

### M3 — Wrong storage function
**Integrate: YES**
`storagePut` is an upload function, not a URL generator. Replacing with `storagePresignGet`. Also correcting the 48h → 1h (3600s) presign TTL for audio files during rendering (well within the 12-min task timeout), keeping 24h for the output download URL.

### M5 — Python JWT signing not specified
**Integrate: YES**
Without this detail, the implementer will need to guess the correct library and claims. Adding PyJWT dependency note, JWT_SECRET env var requirement, and exact claims structure to Section 7.2.

### M8 — Docker networking: localhost:3000 unreachable
**Integrate: YES**
This is a guaranteed runtime failure. Adding `INTERNAL_RENDER_BASE_URL` environment variable (default: `http://localhost:3000` for dev, `http://host.docker.internal:3000` for Docker) to both Section 7.2 and Section 14.

### M1 — JSON vs JSONB
**Integrate: YES (use json() for consistency)**
No technical reason to deviate from the existing `slideContent` pattern. Using `json()` in Drizzle for `audioTrack` and `projectAudioTrack`. Clarifying the column helper in Section 1.2.

### M2 — Breaking exportId type change
**Integrate: YES (document breaking change)**
Adding an explicit note listing all files that need simultaneous update when `exportId` changes from `string` to `number`. The change itself is correct (DB ID should be a number) but needs proper callout.

### M4 — FK onDelete behavior
**Integrate: YES**
Clear and unambiguous: `deckId` cascade, `userId` set null. Adding to Section 1.1.

### M6 — Dual deduplication interaction
**Integrate: YES (document clarification)**
Adding a clarifying note to Section 3.2 describing the layered approach explicitly.

### L1 — Slide render route needs slideContent
**Integrate: YES**
Section 5.2 is ambiguous about this. Making it explicit that the route must query and inline `slideContent` (not just slideshow metadata) in the rendered HTML.

### L3 — FPS default mismatch
**Integrate: YES**
Changing DB schema default and FFmpeg `r=` value to 30 to match existing `buildPresentationRenderSpec()`. One consistent value.

### L6 — Missing tenantId index
**Integrate: YES**
Low-cost addition, prevents future slow admin queries.

### L7 — Expired presigned URL in DB
**Integrate: YES**
Adding `outputStorageKey` column to `presentation_exports` alongside `outputUrl`, so expired URLs can be regenerated. Small additive schema change.

---

## NOT Integrating

### M7 — PDF via PNG→PDF instead of page.pdf()
**Skip**
`page.pdf()` is the correct Playwright API and produces text-selectable PDFs which is a genuine UX advantage. PNG→PDF conversion discards text layer. Documenting the potential visual differences as a known limitation is sufficient. The reviewer's concern about visual fidelity is valid but the trade-off favors `page.pdf()`.

### L2 — window.__slideReady polling failure mode
**Partial**: Adding a per-slide warning log when timeout is reached but NOT adding a hard-abort-on-timeout (that would cause an incomplete export which is worse than a slow one). Logging the warning and continuing is the right behavior.

### L4 — Web Audio API for fade
**Skip**
`audio.volume` ramping is a known pattern and the implementation complexity of Web Audio API is not justified for a 0.5-second fade-out. Documenting as a known limitation.

### L5 — Credit tracking
**Skip**
This is a product decision outside the scope of this technical plan. Adding a note that credit tracking integration is deferred to a follow-up spec.

### L8 — cancelled status comment
**Partial**: Adding an inline code comment `// Reserved for future cancellation feature` in the schema. No code change needed.
