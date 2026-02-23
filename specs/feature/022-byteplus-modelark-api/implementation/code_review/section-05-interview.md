# Section 05 Code Review Interview

## Items Triaged

### Auto-Fix: FAIL-1 — Error message sanitization
**Issue**: `raise HTTPException(detail=f"...{str(e)}")` could leak httpx.HTTPStatusError details including request URL/auth info.
**Decision**: Auto-fix — replace with sanitized fixed string, log raw error via structlog.
**Applied**: Yes — both image and video exception handlers now use fixed strings.

### Auto-Fix: FAIL-2 — client= inside try block
**Issue**: `client = BytePlusModelArkProvider(...)` was outside the `try` block. If `__init__` raises, `finally: await client.aclose()` would NameError.
**Decision**: Auto-fix — initialize to `client = None` before try, assign inside try, guard `finally` with `if client is not None:`.
**Applied**: Yes — both image and video routing blocks fixed.

### Auto-Fix: CONCERN-1 — Missing video 503 test for empty apiKey
**Issue**: `test_raises_503_when_api_key_missing` existed only for image path, not video.
**Decision**: Auto-fix — add `test_raises_503_when_video_api_key_missing`.
**Applied**: Yes — 16 tests now pass.

### Let Go: CONCERN-3 — R2 URL resolution for video reference images
**Rationale**: This is a known plan gap. The Celery task layer that calls generate_video is responsible for resolving R2 URLs before calling the gateway. Not a regression vs existing Kie.ai behavior.

### Let Go: CONCERN-4 — Local import on every request
**Rationale**: Python sys.modules cache makes this a negligible overhead. The architectural constraint comes from needing IMAGE_MODELS for the routing check without making BytePlus a hard top-level dependency.
