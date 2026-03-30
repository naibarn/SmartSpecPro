# Review Report — FalAIProvider Quality & Completeness

**File under review:** `python-backend/app/llm_proxy/providers/fal_ai_provider.py`
**Reference provider:** `python-backend/app/llm_proxy/providers/byteplus_modelark_provider.py`
**Callers reviewed:** `gateway_unified.py`, `media_tasks.py`
**Date:** 2026-03-23

---

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `fal_ai_provider.py:136-147` | `generate_audio`: `response` is potentially unbound after the `try/except`. If `_handle_http_error` somehow does not raise (e.g., a future refactor removes `NoReturn`), line 143 reads an undefined name. Same pattern exists in `generate_image` (line 160-163), `_submit_queue` (line 182-187), `get_queue_status` (line 196-200), `get_queue_result` (line 209-213). | Move `data = response.json()` inside the `try` block, or assign `response = None` before the `try` and add a post-try guard. |
| HIGH | `fal_ai_provider.py:214-225` | `get_queue_result` hard-codes the video result shape (`data.get("video", {}).get("url", "")`). When polled for an `AUDIO_MODELS` task (the recover loop at `media_tasks.py:1459` includes `FalAIProvider.AUDIO_MODELS`), `result.get("video", {})` is always `{}`, `video_url` is `""`, and `actual_duration`/`actual_resolution` are both meaningless. The `_extract_fal_result_url` helper in `media_tasks.py` correctly handles audio vs video shapes — but `get_queue_result` in the provider does not. | Add a `model_id` parameter so the method can branch on whether it is servicing a video or audio task. Audio tasks should extract `data["audio"]["url"]` and return `None` for `actual_resolution`. Alternatively, move all shape-branching to the provider and remove the parallel helper functions in `media_tasks.py`. |
| HIGH | `fal_ai_provider.py:176-188` | `_submit_queue` uses the class-level constant `QUEUE_BASE_URL` instead of any injected base URL. The `__init__` parameter `base_url` only overrides `self.base_url` which is used by `generate_audio`/`generate_image` sync paths. Tests cannot mock the queue endpoint without monkey-patching the class constant, which also broke the prior section-03 finding noted in memory. | Store an injectable queue base URL: `self.queue_base_url = (queue_base_url or self.QUEUE_BASE_URL).rstrip("/")` in `__init__` and use `self.queue_base_url` in `_submit_queue`, `get_queue_status`, and `get_queue_result`. |
| HIGH | `fal_ai_provider.py:228-234` | `_derive_resolution` defaults to `"1080p"` for anything below 2560px wide, including widths of 0 (the default when `width` is missing). Width 0 is not 1080p content. More critically, the provider method uses `video.get("width", 0)` with a default of `0`, which feeds `_derive_resolution(0, 0)` — always returns `"1080p"` silently. The duplicate helper `_derive_fal_resolution` in `media_tasks.py:1291` has a slightly different shape-extraction path and does a `isinstance(width, (int, float))` guard missing from the provider. Two divergent implementations of the same logic will drift. | Consolidate to one implementation in the provider. Add a guard: if `width == 0` (i.e., field was absent) return `None` rather than `"1080p"`, so callers can distinguish "not measured" from "1080p confirmed". |
| MEDIUM | `fal_ai_provider.py:40-47` | `httpx.AsyncClient` is created with a 300-second timeout that applies uniformly to all operations including queue status polls. A status poll that takes 300 seconds before timing out will block the Celery polling batch for 5 minutes per stuck task. `BytePlusModelArkProvider` uses a 90-second default and overrides to 30 seconds on status polls (line 268 in byteplus file). | Apply a 30-second timeout override on `get_queue_status` calls: `response = await self.client.get(url, headers=self._headers, timeout=30.0)`. Keep the 300s default for `generate_video`/`_submit_queue` which are creation operations. |
| MEDIUM | `fal_ai_provider.py:76-88` | `_check_video_size` silently swallows all `httpx.RequestError` and `httpx.HTTPStatusError` exceptions. This means a redirect-based SSRF bypass is possible: if the HEAD request to an evil URL redirects to an internal service, the size check passes silently (noted in prior section-03 review). `follow_redirects=False` prevents redirect-following but the exception handler catches the resulting `httpx.HTTPStatusError` (3xx treated as error when not following), discards it, and allows the video through. | Narrow the exception handler. Catch only `httpx.TimeoutException` for best-effort skip. Let `httpx.RequestError` (network errors other than timeout) propagate or at least log at WARNING. Consider logging the suppressed error at DEBUG level to aid future debugging. |
| MEDIUM | `fal_ai_provider.py:99-109` | `_handle_http_error` does not log the HTTP status before re-raising as `ValueError`. The caller (gateway_unified.py) catches all `Exception` and logs only `str(e)` — which for `ValueError("fal.ai error (HTTP 500)")` is useful, but for `ValueError("fal.ai rate limit exceeded")` drops the original response body that may contain a `Retry-After` value. `BytePlusModelArkProvider` re-raises the original `httpx.HTTPStatusError` and lets callers decide, giving the caller full access to the response. | Follow BytePlus's pattern: log the status code here, then re-raise `exc` (the original `httpx.HTTPStatusError`) rather than converting to `ValueError`. The Celery polling path (`media_tasks.py:1514-1527`) already handles `httpx.HTTPStatusError` specifically. The gateway's catch-all will remain functional. |
| MEDIUM | `fal_ai_provider.py:18-38` | The `VIDEO_MODELS`, `AUDIO_MODELS`, and `IMAGE_MODELS` frozensets on the class are also duplicated/referenced in `gateway_unified.py` to build routing sets, and `media_tasks.py` uses them directly for polling dispatch (`task.model in FalAIProvider.VIDEO_MODELS or task.model in FalAIProvider.AUDIO_MODELS`). However, `get_queue_result` only handles video shape. If `AUDIO_MODELS` is ever expanded to include a queue-based audio model (not sync TTS), the polling branch at `media_tasks.py:1459` will call `get_queue_result` for it and silently return an empty audio URL. | Add an assertion or docstring to `get_queue_result` explicitly noting it is for video queue results only. Alternatively, gate the polling branch in `media_tasks.py` to `FalAIProvider.VIDEO_MODELS` only until an audio queue method is implemented. |
| LOW | `fal_ai_provider.py:143` | `generate_audio` returns `audio_url = data.get("audio", {}).get("url", "")` — empty string on missing fields. An empty string URL stored as `task.result_url` is silently indistinguishable from a valid result in the DB. `generate_image` has the same pattern (`img.get("url", "")` per image). | Return `None` for missing URLs (or raise `ValueError`) so callers can detect and fail the task properly instead of storing an empty result URL. |
| LOW | `fal_ai_provider.py:227-234` | `_derive_resolution` accepts `width` and `height` but never uses `height`. The method signature implies landscape orientation; portrait videos (height > width) would be mis-classified. | Either use `max(width, height)` for dimension lookup, or rename the parameter to `width_px` and document the landscape assumption. |
| LOW | `fal_ai_provider.py:46` | The `httpx.AsyncClient` is created in `__init__` but there is no `__del__` safeguard or context-manager support (`__aenter__`/`__aexit__`). If a caller fails to call `aclose()`, the connection pool leaks silently. `BytePlusModelArkProvider` has the same gap, but the gateway and Celery paths both use `try/finally` blocks correctly. Still, if a third call site is added without the pattern it will be invisible. | Implement `__aenter__`/`__aexit__` so the class can be used as `async with FalAIProvider(...) as client:`, making resource cleanup automatic. |
| LOW | `fal_ai_provider.py` (entire file) | No module-level or class-level docstring explaining authentication format (`Key <api_key>` not `Bearer`), the sync vs queue split (sync for audio/image, queue for video), or the three distinct base URL domains (`fal.run`, `queue.fal.run`). `BytePlusModelArkProvider` has a comprehensive class docstring. | Add a class docstring matching the BytePlus pattern. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `generate_video(model_id, params)` signature | PASS | Returns `{"id": request_id, "status": "PROCESSING"}`. Gateway reads `result["id"]` at line 977. |
| `generate_audio(model_id, params)` signature | PASS | Returns `{"data": [{"url": ...}], "status": "COMPLETED"}`. Gateway reads `result.get("data", [])` at line 1270. |
| `generate_image(model_id, params)` signature | PASS | Returns `{"data": [{"url": ...}], "status": "COMPLETED"}`. Gateway reads `result.get("data", [])` at line 681. |
| `get_queue_status(model_id, request_id)` signature | PASS | Polling code at `media_tasks.py:1481` calls with correct args; status string `"COMPLETED"` matched at line 1483. |
| `get_queue_result(model_id, request_id)` signature | CONDITIONAL PASS | Called correctly for video tasks; **semantically wrong for audio tasks** (HIGH finding above). |
| `aclose()` present and called | PASS | All three gateway routing blocks use `try/finally` to call `aclose()`. Celery polling block does likewise. |
| `VIDEO_MODELS`, `AUDIO_MODELS`, `IMAGE_MODELS` class attributes | PASS | All three routing blocks in gateway import and use these sets for dispatch. |
| SSRF validation on URL params | PASS | `_validate_urls` runs for all three media types before any HTTP call. `host.docker.internal` blocked. `validate_uri_no_ssrf` called for all `_URL_FIELDS`. |
| Prompt sanitization | PASS | HTML/XML tags stripped from `prompt` field before submission. |
| Auth header format `Key <token>` (not `Bearer`) | PASS | Correct per fal.ai docs. |
| Error messages do not leak response body | PASS | `_handle_http_error` raises `ValueError` with static strings only. |
| `_derive_resolution` output contract (`"1080p"` / `"1440p"` / `"2160p"`) | CONDITIONAL PASS | Contract met for valid widths; silently returns `"1080p"` for missing/zero width — callers cannot distinguish. |
| Duplicate resolution/duration helpers in `media_tasks.py` vs provider | FAIL | `_derive_fal_resolution` and `_extract_fal_duration` in `media_tasks.py` duplicate logic from `get_queue_result`. The polling path at line 1488-1490 calls the `media_tasks` helpers on the raw `get_queue_result` dict, then `get_queue_result` *also* computes those values internally. Net result: `actual_duration` and `actual_resolution` are set twice from potentially different code paths. |

---

### Pattern Comparison: FalAIProvider vs BytePlusModelArkProvider

| Dimension | BytePlusModelArkProvider | FalAIProvider | Gap |
|---|---|---|---|
| Class docstring | Full explanation of two API flows | None | Missing |
| `__init__` key storage | `self._api_key` stored (useful for logging guard) | Not stored separately | Minor |
| httpx timeout strategy | 90s default, 30s override on polls | 300s flat for all calls | Polls too slow to timeout |
| HTTP error handling | Re-raises `httpx.HTTPStatusError` with structured log | Converts to `ValueError`, drops HTTP context | Loses retry-after, status code |
| `httpx.RequestError` handling | Logged at ERROR and re-raised | Not caught (falls through to caller) | Acceptable, but inconsistent |
| Response validation after HTTP success | Checks `data[0]` exists and has `url`, raises `ValueError` with key list on failure | Returns empty string `""` on missing URL | Callers cannot detect failures |
| Provider task ID fallback | Generates stable fallback ID for sync responses | N/A (async queue always returns ID) | N/A |
| Per-request timeout override | Yes (30s on GET polls) | No | Celery polling can stall 300s |
| Async context manager support | No (same gap) | No | Both providers have this gap |
| Module-level helper functions | Yes (outside class, clearly named) | No (all private methods) | Minor style inconsistency |

---

### Summary

The provider is structurally complete and correctly wired into both the gateway and the Celery polling path for the normal video queue flow. The core security controls (SSRF validation, prompt sanitization, key-not-logged) are correct. The four HIGH findings all cluster around the same theme: the provider was written with video-only queue semantics but is also used for audio polling and tested via queue mock — the `get_queue_result` method hardcodes video response shape and will silently return empty URLs for audio tasks; `_submit_queue` uses a hardcoded queue base URL that cannot be overridden for testing; the unbound `response` variable pattern is present across all five HTTP methods; and `_derive_resolution` conflates a missing width field with genuine 1080p content. The MEDIUM findings are quality-of-life and testability issues that mirror gaps the prior section-03 review already called out on an earlier version of this file — some of those gaps remain unaddressed.
