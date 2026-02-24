# Implementation Plan Review: Presentation Export, Audio Support & Video Playback (023)

**Reviewer:** Claude Opus 4.6 Architect Review
**Plan file:** `claude-plan.md`
**Date:** 2026-02-23
**Iteration:** 1

---

## Overall Assessment

The plan is well-structured, demonstrates good knowledge of the existing codebase, and correctly identifies the stub `defaultEnqueueExportJob()` as the bridge to replace. The section ordering and dependency chain are mostly sound. However, there are several high-severity issues around security, a critical gap in infrastructure dependency ordering, and multiple medium-severity concerns that could cause implementation failures or production incidents if not addressed.

**Verdict:** Needs revision before implementation. The security issues in Section 5 and the infrastructure ordering problem are blocking.

---

## HIGH Severity Findings

### H1. Internal Slide Render Route: Localhost Check is Bypassable and Incomplete (Section 5.1)

**Problem:** The plan says to check `req.connection.remoteAddress === '127.0.0.1'` for localhost-only enforcement. This has multiple issues:

1. `req.connection` is deprecated in Node.js. The correct property is `req.socket.remoteAddress`.
2. IPv6 loopback `::1` and IPv4-mapped IPv6 `::ffff:127.0.0.1` are not handled. The existing codebase at `apps/web/server/routes/tasks.ts` correctly checks all three variants.
3. The Nginx config has a catch-all `location /` block that **will proxy `/internal/slide-render/...` requests from the public internet** to port 3000. The plan's risk register mentions this but proposes only "verify Nginx config" as mitigation. The plan must **explicitly require** adding a `location /internal/` deny block in the Nginx config, not just rely on application-layer localhost checks.

**Recommendation:**
- Use `req.ip || req.socket.remoteAddress` (consistent with existing code in `tasks.ts`).
- Check `127.0.0.1`, `::1`, AND `::ffff:127.0.0.1`.
- Add explicit Nginx deny rules: `location /internal/ { deny all; return 403; }` in **both** the HTTP (port 80) and HTTPS (port 443) server blocks in `nginx/conf.d/dev-host.conf`. Add this as a required implementation step in Section 5 or Section 14.
- The JWT token validation is a good secondary defense, but should not be the primary one.

### H2. JWT Token in Query Parameter Leaks to Logs and Referrer Headers (Section 5.1)

**Problem:** The plan sends the JWT as `?token={jwt}` in the Playwright URL. This means:
1. The token will appear in Nginx access logs (full URL is logged by default).
2. The token will appear in Node.js server logs if request logging is enabled.
3. If the rendered page loads any external resources, the token leaks via the `Referer` header.

Since this is an internal route only accessed by Playwright from localhost, the risk is lower than a user-facing endpoint, but it still violates the project rule: "NEVER pass secrets as URL query parameters -- use request headers instead."

**Recommendation:** Since Playwright controls the navigation, use a custom HTTP header instead of a query parameter. Playwright supports setting extra HTTP headers per page:
```python
page.set_extra_http_headers({"X-Internal-Token": jwt_token})
```
This avoids log leakage entirely. Update Section 5.1 to validate `req.headers['x-internal-token']` instead of `req.query.token`.

### H3. Infrastructure Section (14) Must Come Before Python Task (Section 7), But Implementation Order Puts It Last

**Problem:** The implementation order lists Section 14 (Dockerfile changes for Playwright) at position 14 out of 15, but Section 7 (Python Celery task that uses Playwright) is at position 7. The plan itself notes in the final paragraph that "Section 14 needs to be built before Section 7 can be tested end-to-end." However, the numbered order implies Section 7 is built first.

The Celery worker runs inside the Docker container built from `docker/Dockerfile.video-job-runner`. If Playwright and its Chromium dependencies are not in the image, the entire render task will fail at import time — not just at test time.

**Recommendation:** Move Section 14 (Infrastructure/Dockerfile) to position 6, immediately before Section 6 (Python API) and Section 7 (Python Task). The Dockerfile must be updated and the image rebuilt before any Python render code can be tested. Updated implementation order:
```
1. Section 1 (Database)
2. Section 2 (Shared Contracts)
3. Section 3 (Export Service)
4. Section 4 (tRPC Router)
5. Section 5 (Slide Render Route)
6. Section 14 (Infrastructure -- Dockerfile)  <-- moved up
7. Section 6 (Python API)
8. Section 7 (Python Task)
...remaining frontend sections...
```

### H4. New Celery Queue `presentation_export` Not Registered in Celery Config (Section 7.1)

**Problem:** The task decorator specifies `queue="presentation_export"`, but the existing Celery configuration at `python-backend/app/core/celery_app.py` only declares three queues: `celery`, `video`, and `media`. While `task_create_missing_queues=True` is set, existing workers configured with default queue consumption may or may not pick up tasks from an auto-created queue depending on how they are started.

Additionally, the `task_routes` dict needs an entry for the new render task, or the queue specified in the decorator may be ignored in certain Celery configurations.

**Recommendation:** The plan must explicitly require:
1. Adding `Queue("presentation_export")` to the `task_queues` list in `python-backend/app/core/celery_app.py`.
2. Adding a `task_routes` entry: `"app.tasks.presentation_render.render_presentation": {"queue": "presentation_export"}`.
3. Updating worker startup commands to consume from the new queue (e.g., `-Q celery,video,media,presentation_export`), or run a dedicated worker: `celery -A app.core.celery_app worker -Q presentation_export -c 2`.
4. Documenting that the `presentation_export` worker should have limited concurrency (as noted in the risk register) by running it as a separate worker process.

---

## MEDIUM Severity Findings

### M1. JSONB vs JSON Column Type Inconsistency (Section 1.2)

**Problem:** The plan specifies "JSONB columns" for `audioTrack` and `projectAudioTrack`, but the existing `presentation_slides.slideContent` column uses `json()` (not `jsonb()`). Mixing `json` and `jsonb` in the same table family creates inconsistency.

**Recommendation:** Clarify which Drizzle column helper to use. If JSONB is desired for potential future indexing on audio metadata, state this explicitly and note the deviation from the existing `json()` pattern in the same table. Otherwise, use `json()` for consistency with `slideContent`.

### M2. `exportId` Type Change is a Breaking Contract Modification (Section 2.4)

**Problem:** The plan proposes changing `exportId` from `string` to `number` in `PresentationExportStatusResult`. The existing `contracts.ts` defines `exportId: z.string().min(1).max(128)`, and the existing `presentationPlaybackExport.ts` generates string-based export IDs like `presentation-export-{uuid}`. Changing this to `number` will break the existing test suite and any frontend code that stores export IDs as strings.

**Recommendation:** Either:
- Keep `exportId` as string and return it as `String(record.id)` in responses (preserves backward compatibility).
- Or document this as a breaking change and list all affected files that need simultaneous update: both contract schemas, the router input schema, the existing `triggerPresentationExport` function, frontend components, and all tests.

### M3. Audio URL Resolution Uses Wrong Storage Function (Sections 3.2 and 3.3)

**Problem:** Section 3.2 says to "get the presigned download URL via `storagePut` utilities" and Section 3.3 says "calls `storagePut`/`getSignedUrl`". The correct function is `storagePresignGet()` which generates presigned GET URLs for downloading existing files. `storagePut()` is for **uploading** new files and returns a storage key, not a presigned download URL.

Additionally, the plan says to generate 48-hour presigned URLs, but `MAX_PRESIGN_EXPIRY_S` in `storage.ts` is capped at 86400 seconds (24 hours). The `storagePresignGet` function clamps expiry to this maximum.

**Recommendation:** Replace all references to `storagePut`/`getSignedUrl` with `storagePresignGet(storageKey, expiresIn)`. Use 3600 seconds (1 hour) for audio files during rendering (sufficient for a 12-minute task).

### M4. `presentation_exports` Table Missing FK `onDelete` Behavior (Section 1.1)

**Problem:** The plan does not specify `onDelete` behavior for `userId` or `deckId` foreign keys, which could leave orphaned records or cause FK constraint violations during cascades.

**Recommendation:**
- `deckId`: `onDelete: "cascade"` — if the deck is deleted, export records are meaningless.
- `userId`: `onDelete: "set null"` — preserve export audit trail even if user is deleted (make userId nullable).

### M5. Python JWT Signing for Internal Render Route — Not Specified (Section 7.2)

**Problem:** Section 7.2 says "Generate a JWT for the internal slide render endpoint via an internal `signBearerToken` equivalent in Python." The plan does not address how the Python Celery worker gets `JWT_SECRET`, which Python JWT library to use, or the exact claims structure needed.

**Recommendation:** Add a sub-step specifying:
- Worker needs `JWT_SECRET` as an environment variable.
- Use PyJWT: `jwt.encode({"sub": "internal-render", "scopes": ["internal:slide-render"], "deckId": deck_id, "slideIndex": idx, "exp": now + 300}, JWT_SECRET, algorithm="HS256")`.
- Add `PyJWT` to `requirements.txt` if not already present.
- Ensure Dockerfile and worker startup pass `JWT_SECRET`.

### M6. Dual Deduplication Systems Create Confusion (Sections 3.2 vs 1.1)

**Problem:** The plan maintains both in-memory `dedupeRegistry` and DB `idempotencyKey` unique constraint without clearly specifying how they interact, which could cause confusing code paths.

**Recommendation:** Document explicitly that: the in-memory check is a fast-path optimization for rapid double-clicks; the DB idempotency key is the durable guarantee. In-memory check first; DB check as fallback (catches post-restart duplicates).

### M7. PDF Rendering Strategy May Not Match Visual Output (Section 7.2)

**Problem:** `page.pdf()` generates a PDF from the HTML DOM, which may not produce pixel-perfect output matching the canvas editor (CSS rendering differences, font metrics).

**Recommendation:** Consider converting PNG screenshots (already captured in Stage 1) to PDF pages using Pillow or `reportlab`. This reuses existing screenshot logic and guarantees PDF matches editor preview. If `page.pdf()` is preferred for text selectability, document this as an explicit design choice.

### M8. Docker Networking: Celery Worker Cannot Reach `localhost:3000` (Section 7.2)

**Problem:** Inside a Docker container, `localhost:3000` refers to the container's own network, not the host machine where Node.js is running. The existing Nginx config uses `host.docker.internal` to reach host services from Docker.

**Recommendation:** Use `http://host.docker.internal:3000` or a configurable `INTERNAL_RENDER_BASE_URL` environment variable (defaulting to `http://localhost:3000` for local dev, `http://host.docker.internal:3000` for Docker). Document this clearly in Section 7.2.

---

## LOW Severity Findings

### L1. `presentationSlideshowSlideSchema` Does Not Include Element Data (Section 5.2)

The internal render route needs full `slideContent` to render elements, but the slideshow schema only includes metadata. Section 5.2 step 1 should explicitly state that `slideContent` must be fetched from the DB and inlined in the HTML page.

### L2. `window.__slideReady` Polling Has No Failure Mode (Section 7.2)

If the flag never becomes true (e.g., broken image URL, JS error), the task waits the full 10 seconds per slide. For a 50-slide deck, this adds 500 seconds of wasted time. Add a per-slide hard timeout with a warning rather than silently waiting the maximum.

### L3. FPS Default Mismatch Between Plan and Existing Code (Section 1.1 vs Existing)

The plan defaults `fps` to 25 in the DB schema and FFmpeg command (`r=25`), but the existing `buildPresentationRenderSpec()` defaults to `fps: 30`. Align on one value across both paths.

### L4. AudioTrackPlayer Fade-Out Timing (Section 13.2)

The 0.5-second fade-out via `audio.volume` manipulation may produce audible clicks or stepping artifacts. The Web Audio API (`AudioContext.createGain()`) would produce smoother fades. Document this as a known limitation or switch to Web Audio API.

### L5. No Credit/Usage Tracking for Export Operations (Sections 3–7)

The codebase has credit-based usage tracking. Presentation exports consume significant compute resources but the plan does not mention credit deduction or `provider_usage_log` entries. If exports are free, state this explicitly. If not, add credit check/deduction before enqueueing.

### L6. Missing `tenantId` Index on `presentation_exports` (Section 1.1)

An index on `tenantId` is missing. Multi-tenant admin queries will be slow without it. Add `index("presentation_exports_tenant_idx").on(t.tenantId)`.

### L7. Presigned URLs Stored in DB Expire But Records Persist (Section 3.2)

After the presigned URL expires, `getExportStatus` returns a dead `outputUrl`. Consider storing the S3 storage key alongside the presigned URL so a fresh URL can be generated on demand.

### L8. `cancelled` Export Status is Reserved But Unreachable (Section 1.1)

The `cancelled` status is included in the schema but no code path sets it (cancellation is out of scope). Add a note that it is reserved for future use.

---

## Summary: Top 3 Findings

1. **SECURITY (H1 + H2):** The internal slide render route at `/internal/slide-render/` is exposed through Nginx's catch-all proxy, the localhost check is incomplete (missing IPv6, using deprecated API), and the JWT is passed as a query parameter leaking to logs. **Fix:** Add Nginx deny block, check all loopback variants, use `X-Internal-Token` HTTP header.

2. **INFRASTRUCTURE ORDERING (H3 + H4):** The Dockerfile with Playwright must be built before the Python Celery task can run, yet it is listed last. The new `presentation_export` Celery queue is not registered in `celery_app.py`. **Fix:** Move Dockerfile step to position 6, register queue and task routes.

3. **WRONG STORAGE API + DOCKER NETWORKING (M3 + M8):** The plan references `storagePut` instead of `storagePresignGet` for generating download URLs, and `localhost:3000` is unreachable from inside a Docker container. **Fix:** Use `storagePresignGet()`, make render URL configurable with `host.docker.internal` as Docker default.
