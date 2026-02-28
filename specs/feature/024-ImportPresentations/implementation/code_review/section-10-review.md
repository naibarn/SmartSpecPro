# Section 10 Code Review

## CRITICAL: follow_redirects=False breaks legitimate redirects
Changed `follow_redirects=True` → `follow_redirects=False` could cause silent data corruption when Google CDN returns 302 redirects. httpx's `raise_for_status()` doesn't trigger on 3xx, so the function would return the redirect HTML body instead of the actual image.

**Action:** Revert to `follow_redirects=True`. The initial `url.startswith("https://")` check is the primary SSRF control. Google CDN URLs are trusted HTTPS endpoints.

## MEDIUM: Test mocks incorrect httpx behavior
The redirect test simulates `HTTPStatusError` for 302, but httpx doesn't raise on 3xx.

**Action:** Replace with a test that verifies the HTTPS URL scheme check is the primary defense.

## LOW: pptx_importer.py macro comment is slightly misleading about .pptm
**Action:** Adjust wording to say python-pptx parses .pptx format only.

## N/A items from plan
- Content-Length guard: Not applicable — the endpoint accepts JSON metadata, not file uploads. The PPTX is downloaded from S3 in the Celery task.
- MIME type validation: Same — no file upload to the API endpoint.
- test_security_checks.py: The SSRF test already exists in test_gslides_importer.py.
