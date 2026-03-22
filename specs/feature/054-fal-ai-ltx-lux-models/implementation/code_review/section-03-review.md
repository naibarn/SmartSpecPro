## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `fal_ai_provider.py:101-114` | `_check_video_size_sync` swallows `ValueError` silently. The `except` clause catches `httpx.RequestError` and `httpx.HTTPStatusError` but `ValueError` raised at line 110 (size limit exceeded) is NOT one of those types — so it will propagate correctly in normal use. However, if `validate_uri_no_ssrf` or the `hostname` check raises `ValueError` before reaching `_check_video_size_sync`, and a caller wraps with a broad `except Exception`, a future maintainer adding a size-check ValueError inside the except block would silently suppress it. The real bug is narrower: `_check_video_size_sync` opens a synchronous `httpx.Client` inside an async coroutine context (`generate_video`, `generate_audio`, `generate_image` all `await` their callers but `_validate_urls` is called synchronously within them). A blocking synchronous HEAD request on the event loop will stall all concurrent coroutines for up to 10 seconds on slow/unresponsive video hosts. Use `await self.client.head(url)` instead. | Replace `_check_video_size_sync` with an `async def _check_video_size(self, url: str)` that uses `self.client.head(url)` and make `_validate_urls` async, or perform the size check as a separate async step in `generate_video` before calling `_submit_queue`. |
| HIGH | `fal_ai_provider.py:162-168` (and identical pattern at 185-191, 208-215, 226-232) | `response` variable used after `except` block may be unbound. In `generate_audio`, `generate_image`, `get_queue_result`, and `get_queue_status`, the pattern is: `try: response = await ...; response.raise_for_status() except HTTPStatusError: _handle_http_error(exc)` — then `data = response.json()` is called unconditionally after the block. `_handle_http_error` always raises, so this is safe today. But the type checker cannot prove it, the `response` binding is technically conditional, and a future refactor that adds a non-raising error path will silently use an unbound variable. | Restructure as: `response = await ...; try: response.raise_for_status() except httpx.HTTPStatusError as exc: self._handle_http_error(exc); raise  # unreachable but type-safe` or assign `response` outside the try and re-raise unconditionally. |
| HIGH | `agencyToolsApi.ts:550` | `fetch(endpointUrl, ...)` makes an outbound HTTP call to a user-controlled URL (`endpoint_url` from `tool.config`) with no SSRF validation. The `endpointUrl` is stored at tool-creation time but is never validated before execution. A tenant admin could configure `endpoint_url = "http://169.254.169.254/latest/meta-data/"` or `http://localhost:5432` and read arbitrary internal services via the execute route. | Before calling `fetch`, run the same `validate_uri_no_ssrf` pattern (or the existing Node.js equivalent from the URL validation utilities) against `endpointUrl`. Return a 400 if the URL resolves to a private/loopback range. |
| MEDIUM | `fal_ai_provider.py:64-99` | SSRF check ordering: `host.docker.internal` is checked by hostname string comparison BEFORE `validate_uri_no_ssrf` is called. This means any URL whose `urlparse` returns a hostname not exactly equal to `"host.docker.internal"` passes the custom guard and goes to `validate_uri_no_ssrf`. A URL like `http://HOST.DOCKER.INTERNAL/` uses uppercased hostname — the `.lower()` call at line 86 handles this correctly, so the ordering is fine for this specific case. However, `_check_video_size_sync` calls `httpx.Client.head(url)` with the original URL that has already passed SSRF validation — but the HEAD request itself could redirect to a private IP. No redirect-follow control is set. | Pass `follow_redirects=False` to `httpx.Client` in `_check_video_size_sync` (line 104) to prevent redirect-based SSRF bypass during the size check. |
| MEDIUM | `fal_ai_provider.py:104` | Blocking `httpx.Client` used inside async context. Even though `_validate_urls` is a synchronous method, it is called directly inside `generate_video` which runs on the asyncio event loop. A 10-second blocking HEAD request will block the entire event loop. This is a distinct problem from the HIGH finding about using `await`; the synchronous client blocks at the OS level regardless of whether the ValueError propagation is correct. | Convert to async as described in the HIGH finding above, or at minimum run the synchronous client in `asyncio.get_event_loop().run_in_executor(None, ...)` to keep the event loop free. |
| MEDIUM | `agencyToolsApi.ts:477` | Rate-limit key uses `auth.apiKeyId` for `api_key` mode but `auth.sub` for JWT/session mode. The field `auth.apiKeyId` is not present in the auth shape shown in the test fixtures — the fixture uses `keyHash`. If the production auth object uses `keyHash` (not `apiKeyId`), the rate-limit key will always be `undefined`, meaning every `api_key` request will use key `"agency-tool-api:undefined"` and all tenants share a single counter. | Confirm the auth interface field name (`keyHash` vs `apiKeyId`) and use `auth.keyHash ?? auth.sub ?? "unknown"` consistently. Add a test case that verifies the rate-limit key is non-null for both auth modes. |
| MEDIUM | `test_fal_ai_provider.py` | `test_posts_to_sync_endpoint` for `generate_audio` (line 416) asserts `call_url.startswith("https://fal.run/")` but the implementation uses `self.base_url` which strips the trailing slash (line 752 of provider: `self.base_url = (base_url or self.BASE_URL).rstrip("/")`). The URL is constructed as `f"{self.base_url}/{model_id}"` producing `https://fal.run/fal-ai/lux-tts`. The assertion `startswith("https://fal.run/")` passes correctly. However `test_posts_to_queue_endpoint` (line 360) asserts `startswith("https://queue.fal.run/")` but the implementation uses the class-level constant `QUEUE_BASE_URL` directly (not `self.base_url`). This means a `base_url` override in tests does NOT affect queue calls — the custom base_url override only affects sync calls. This is architecturally inconsistent and the test for `test_custom_base_url` only verifies `self.base_url`, never testing whether queue calls use the override too. | Either expose a separate `queue_base_url` parameter in `__init__` or document explicitly that `base_url` override only affects sync calls. The current gap means integration tests cannot mock the queue endpoint via `base_url`. |
| MEDIUM | `toggleToolExposure` in `agency.ts:50-74` | Two-step SELECT-then-UPDATE with no transaction: the tool ownership check is done in a separate SELECT query and the UPDATE happens in a subsequent statement. A concurrent request could delete or reassign the tool between the SELECT and the UPDATE. This is the same TOCTOU pattern flagged in the section-14 review. | Combine into a single `UPDATE ... WHERE id = $id AND tenantId = $tenantId` and check `rowsAffected` to distinguish "not found" from "wrong tenant". |
| LOW | `fal_ai_provider.py:96` | Comment at line 96 says "see `_check_video_size`" (without `_sync` suffix), but the actual method is named `_check_video_size_sync`. | Correct the comment to reference `_check_video_size_sync`. |
| LOW | `test_fal_ai_provider.py` — `TestInit.test_httpx_timeout` (line 330) | The test asserts `provider.client.timeout.read == 300.0`. The httpx `Timeout` constructor with a scalar value sets all four timeout fields (`connect`, `read`, `write`, `pool`) to the same value. This assertion is correct but testing only the `.read` field is unnecessarily narrow — if the constructor were called with `httpx.Timeout(read=300.0)` (omitting connect timeout), the test would still pass while the connect timeout could be 5s (httpx default). | Assert `provider.client.timeout == httpx.Timeout(300.0)` to test the full timeout object. |
| LOW | `test_fal_ai_ssrf.py` — missing 169.254.x.x variant coverage | The SSRF test file covers `169.254.169.254` (AWS metadata) but does not test `169.254.0.1` or other link-local addresses in the `169.254.0.0/16` range. The spec requires "rejects http://169.254.169.254" specifically, and this is satisfied, but link-local coverage is narrower than what `validate_uri_no_ssrf` likely validates. | Add a test for `http://169.254.0.1/` to confirm full link-local range is blocked, not just the single AWS magic address. |
| LOW | Out-of-scope changes in diff | The diff includes changes to `apps/web/server/_core/index.ts`, `apps/web/server/routers/agency.ts`, `apps/web/server/routes/agencyToolsApi.ts`, `apps/web/server/routes/__tests__/agencyToolsApi.test.ts`, `python-backend/app/services/agency_orchestrator.py`, and `python-backend/app/services/agency_tools.py`. None of these files are listed in the section-03 spec's "Files to Create/Modify" table. Section-03 scope is strictly `fal_ai_provider.py` and `providers/__init__.py`. These appear to be bundled from a different section (likely section-16 or a standalone tool API section). | Split out-of-scope changes into their own section diff and review separately. Review of the `agencyToolsApi.ts` SSRF issue (HIGH above) and `toggleToolExposure` TOCTOU (MEDIUM above) must be tracked against whichever section owns those files. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `VIDEO_MODELS` frozenset with exactly 7 LTX-2.3 model IDs | PASS | All 7 IDs match spec exactly |
| `AUDIO_MODELS` == frozenset({"fal-ai/lux-tts"}) | PASS | Correct |
| `IMAGE_MODELS` contains 4 Flux model IDs as frozenset | PASS | Correct |
| `BASE_URL == "https://fal.run"` | PASS | |
| `QUEUE_BASE_URL == "https://queue.fal.run"` | PASS | |
| Auth header format `"Key {api_key}"` (not Bearer) | PASS | Line 754 |
| httpx client timeout 300.0 seconds | PASS | Line 757 |
| `base_url` override works for sync calls | PASS | Line 752 |
| `base_url` override affects queue calls | FAIL | `_submit_queue` uses class-level `QUEUE_BASE_URL` constant, not `self.base_url` or any instance queue_base_url — queue endpoint is not overridable |
| `generate_video` POSTs to `queue.fal.run/{model_id}` | PASS | |
| `generate_video` returns `{id, status: "PROCESSING"}` | PASS | |
| `generate_video` calls `_validate_urls` before HTTP | PASS | Line 143 |
| `generate_video` sanitizes prompt | PASS | Lines 145-146 |
| `generate_audio` POSTs to `fal.run/{model_id}` synchronously | PASS | |
| `generate_audio` returns `{data: [{url}], status: COMPLETED}` | PASS | |
| `generate_audio` calls `_validate_urls` for audio_url | PASS | Line 154 |
| `generate_image` POSTs to `fal.run/{model_id}` synchronously | PASS | |
| `generate_image` returns normalized result with image URL | PASS | |
| `_submit_queue` returns `request_id` from fal.ai response | PASS | |
| `get_queue_status` returns `{status: IN_QUEUE\|IN_PROGRESS\|COMPLETED}` | PASS | |
| `get_queue_result` normalizes `url`, `actual_duration`, `actual_resolution` | PASS | |
| Resolution: width >= 3840 → "2160p" | PASS | |
| Resolution: width >= 2560 → "1440p" | PASS | |
| Resolution: else → "1080p" | PASS | |
| 401 → `ValueError("Invalid fal.ai API key")` from None | PASS | |
| 422 → `ValueError("Content policy rejection")` from None | PASS | |
| 429 → `ValueError("fal.ai rate limit exceeded")` from None | PASS | |
| 500 → `ValueError("fal.ai error (HTTP 500)")` — no body in message | PASS | |
| `aclose()` closes httpx client | PASS | |
| SSRF: rejects 169.254.169.254, localhost, 127.0.0.1, 10.x, 192.168.x | PASS | All 5 tests present |
| SSRF: rejects `host.docker.internal` | PASS | |
| SSRF: allows https://example.com, https://v3b.fal.media/... | PASS | |
| SSRF: validates all 4 URL fields | PASS | |
| SSRF: None URL fields skipped | PASS | |
| Prompt sanitization: strips `<script>` and `<img>` tags | PASS | |
| video_url > 500MB rejected (HEAD check) | PASS | Test present; runtime has event-loop-blocking issue (HIGH) |
| Missing Content-Length handled gracefully | PASS | |
| Import added to `providers/__init__.py` | PASS | |
| `"FalAIProvider"` added to `__all__` | PASS | |
| Test files at spec-required paths (`test_fal_ai_provider.py`, `test_fal_ai_ssrf.py`) | PASS | |

---

### Summary

The `FalAIProvider` Python implementation is structurally complete and matches nearly every spec requirement: all model set definitions, URL constants, auth header format, error sanitization contract, response normalization, SSRF validation coverage, and prompt sanitization are correctly implemented. There are two runtime correctness problems requiring fixes: the synchronous `httpx.Client.head()` call inside an async context will block the entire event loop for up to 10 seconds on slow video hosts, and the `response` variable is technically unbound after the try/except blocks in all four HTTP methods (safe today only because `_handle_http_error` always raises, but fragile). The out-of-scope `agencyToolsApi.ts` bundled in this diff introduces a genuine SSRF vulnerability (no validation of the outbound `endpoint_url` before `fetch()`), which must be fixed in whatever section owns that file before merge.
