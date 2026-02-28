# Section 10 Code Review Interview

## Auto-Fix: Revert follow_redirects change
**Finding:** `follow_redirects=False` breaks legitimate Google CDN 302 redirects.
**Decision:** Auto-fix — revert to `follow_redirects=True`. The `url.startswith("https://")` check at the function entry is the actual SSRF defense. Google Slides contentUrls are trusted HTTPS endpoints that may legitimately redirect.
**Status:** Applied.

## Auto-Fix: Update redirect test
**Finding:** Test mocked incorrect httpx behavior (httpx doesn't raise on 3xx).
**Decision:** Auto-fix — replace with test verifying `follow_redirects=True` and `timeout=30.0` are passed to httpx. The HTTPS scheme check test already exists.
**Status:** Applied.

## Auto-Fix: Adjust macro safety comment
**Finding:** Comment implies .pptm is a supported format.
**Decision:** Auto-fix — clarify that python-pptx targets .pptx format.
**Status:** Applied.

## Let Go: Missing Content-Length guard test
The plan's `test_start_endpoint_rejects_large_content_length` is N/A — the endpoint accepts JSON metadata, not file uploads. PPTX files are downloaded from S3 by the Celery task, where `MAX_PPTX_SIZE` enforces the limit.

## Let Go: Missing callback body size test
The global Express json limit (10mb) already protects the callback route. A dedicated test would test Express middleware, not our feature code.
