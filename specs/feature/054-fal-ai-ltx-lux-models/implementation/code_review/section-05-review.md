## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `media_tasks.py:1461` | **`result["data"][0]["url"]` crashes for audio models.** The branch condition routes both `VIDEO_MODELS` and `AUDIO_MODELS` into this path, but the result URL extraction hard-codes the video response shape `{"data": [{"url": "..."}]}`. fal.ai audio models (e.g., `fal-ai/lux-tts`) return `{"audio": {"url": "..."}}`. Any stuck audio task will crash with `KeyError: 'data'`, be caught by the outer `except Exception as task_error` handler (line 1611), and be left for the next recovery cycle indefinitely — it will never time out because the timeout check runs before the API call. | Add a helper `_extract_fal_result_url(result: dict) -> str` that tries `result["data"][0]["url"]` first, then `result.get("audio", {}).get("url")`, then `result.get("url")`. Raise a descriptive `ValueError` if none is found. |
| HIGH | `media_tasks.py:1489–1497` | **Non-429 `HTTPStatusError` is re-raised to the outer generic handler** (line 1611), which logs `recover_stuck_task_error` with no HTTP status code and leaves the task for re-try. A persistent 401 (expired/invalid API key) will silently skip the task on every recovery cycle forever because the timeout check only fires if `task.created_at` is old, but the task never transitions away from PROCESSING — it accumulates in the stuck-task batch until the generic `cutoff_time` query stops returning it. | For 4xx errors other than 429 (e.g., 401, 404), mark the task FAILED immediately inside the `except httpx.HTTPStatusError` block with a sanitized message. For 5xx, retain the re-raise-to-retry behavior but add `http_status=http_err.response.status_code` to the outer log call so it is distinguishable in production. |
| MEDIUM | `media_tasks.py:1293` | **`_derive_fal_resolution` uses `or` chaining, treating `width=0` as falsy.** `result.get("video", {}).get("width") or result.get("width")` — if `video.width` is `0` (pathological but valid in a malformed response), the expression silently falls through to `result.get("width")`. More important: any future fal.ai response format where `video.width` is `None` but a top-level `width` key exists will produce a different result than intended. | Use explicit `is None` checks: `width = result.get("video", {}).get("width"); width = width if width is not None else result.get("width")`. |
| MEDIUM | `media_tasks.py:1304` | **`_extract_fal_duration` has the same `or`-falsy bug for `duration=0`** and an unguarded `float()` conversion. `float(duration)` raises `ValueError` if `duration` is a non-numeric string (e.g., `"unknown"` or `"N/A"`), which would bubble up to the COMPLETED handler and abort the entire completion path. | Use `is None` checks and wrap conversion: `try: return float(duration) except (ValueError, TypeError): return None`. |
| MEDIUM | `test_fal_ai_celery_polling.py:421–451` | **`TestFalAiPollingBranch` re-implements the production branch inline rather than exercising production code.** Every test in this class manually invokes mock methods and sets `task.*` fields directly, mirroring the production logic but never calling it. This means the `KeyError` for audio URLs (HIGH finding above) would pass all existing tests. | Factor the fal.ai polling branch out of `_recover_stuck_tasks_async()` into a standalone coroutine `_handle_fal_task(task, db)` that can be called with a mock DB session, or at minimum add a test that passes an audio-model task and asserts the URL is extracted without a `KeyError`. |
| MEDIUM | `test_fal_ai_celery_polling.py:586–593` | **`test_provider_not_configured_continues` is a tautology.** The test directly evaluates `assert not provider_config or ...` after assigning `provider_config = None` — it asserts a Python boolean expression, not any production code. Removing this test would have zero effect on production coverage. | Replace with a test that patches `get_media_provider_key` to return `None` and verifies that `FalAIProvider.__init__` is never called (e.g., using `unittest.mock.patch` on the constructor). |
| MEDIUM | `test_fal_ai_celery_polling.py:512–527` | **`test_aclose_called_in_finally` calls `aclose()` in the test's own `finally` block**, not in production code's. The assertion `mock_provider.aclose.assert_awaited_once()` passes because the test itself calls `await mock_provider.aclose()` unconditionally. If the production `finally` block were deleted, this test would still pass. | Refactor to call the production coroutine with a mock that raises on `get_queue_status`, then assert that `mock_provider.aclose` was awaited exactly once by the production code path. |
| LOW | `media_tasks.py:1447` | **`FAL_QUEUE_TIMEOUT_MINUTES = 30` is defined as a loop-local variable on every task iteration** rather than as a module-level constant. This is harmless but inconsistent with the style of other provider-level constants in the file. | Move to module level, adjacent to other timeout constants. |
| LOW | `media_tasks.py:1349–1351` | **`FalAIProvider` and `httpx` are imported inside the `for task` loop body**, causing a module-cache lookup on every iteration. The BytePlus import follows the same pattern (existing tech debt), so this is consistent — but worth noting as the right place to fix both when the loop is next refactored. | No immediate action required. Track for future refactor. |
| LOW | Diff scope | **The diff bundles out-of-scope section-18 files**: `ParallelFanOutNodeCard.tsx`, `parallelFanOutValidation.test.ts`, `test_parallel_fan_out.py`, and `section-18-diff.md` are all Agency Swarm spec-052 section-18 artefacts with no relation to fal.ai Celery polling. Mixing them into this diff makes git history misleading and complicates bisect for future regressions. | Commit section-18 artefacts in a separate PR under spec-052. |

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| Branch detection: `task.model in FalAIProvider.VIDEO_MODELS or AUDIO_MODELS` | PASS | Matches spec §1 exactly |
| Provider config fetch via `get_media_provider_key("fal_ai")` | PASS | Line 1437 |
| Timeout check runs before API call | PASS | Spec §2 "Check timeout first" — line 1447 precedes `get_queue_status` call |
| 30-minute queue timeout | PASS | `FAL_QUEUE_TIMEOUT_MINUTES = 30` |
| `get_queue_status` → conditional `get_queue_result` | PASS | Lines 1456–1468 match spec §2 pattern |
| `actual_duration` written to `result_data` | PASS | `_extract_fal_duration(result)` at line 1464 |
| `actual_resolution` written to `result_data` | PASS | `_derive_fal_resolution(result)` at line 1465 |
| Resolution thresholds (≥3840→"2160p", ≥2560→"1440p", else→"1080p") | PASS | Lines 1295–1299 match spec §3 exactly |
| `aclose()` in `finally` block | PASS | Lines 1498–1500 |
| 429: log warning and continue | PASS | Lines 1489–1496 |
| Non-429 HTTPStatusError: re-raise | PASS | Line 1497 |
| Error message sanitized to 200 chars | PASS | `str(error_msg)[:200]` at line 1478 |
| `task.completed_at` set on COMPLETED and FAILED | PASS | Lines 1452, 1467, 1479 |
| Audio result URL extraction | FAIL | Hard-codes video shape `result["data"][0]["url"]`; crashes for `AUDIO_MODELS` tasks |
| Output contract for section-08 (`actual_duration`, `actual_resolution` always present) | PASS | Both keys written unconditionally |
| Tests: detection routing (video, audio, non-fal) | PASS | `TestFalAiDetection` covers all 3 cases |
| Tests: COMPLETED with actual_duration/actual_resolution | PASS | `test_completed_status_sets_result` |
| Tests: FAILED with sanitized error | PASS | `test_failed_status_sets_error` |
| Tests: IN_QUEUE / IN_PROGRESS no change | PASS | `test_in_queue_no_change` |
| Tests: queue timeout >30min marks FAILED | PASS | `test_queue_timeout_marks_failed` |
| Tests: queue timeout <30min no change | PASS | `test_queue_no_timeout_within_limit` |
| Tests: provider not configured continues | FAIL | `test_provider_not_configured_continues` is a tautology — tests no production code |
| Tests: aclose() in finally | FAIL | `test_aclose_called_in_finally` calls aclose in the test's own finally, not production's |
| Tests: 429 rate limit | PASS | `test_429_rate_limited_continues` |
| Tests: generic exception skips task | PASS | `test_generic_exception_skips_task` |

### Summary

The core polling implementation is structurally sound: branch detection, timeout logic, the COMPLETED/FAILED/IN_QUEUE state machine, and the section-08 output contract (`actual_duration`, `actual_resolution`) all match the spec. The blocking defect is that `result["data"][0]["url"]` hard-codes the video response shape while the branch also routes audio models — every stuck `fal-ai/lux-tts` task will crash silently on every recovery cycle and never complete. Two tests are tautologies that verify no production behaviour (`test_provider_not_configured_continues`, `test_aclose_called_in_finally`). The diff also bundles unrelated section-18 artefacts that should be in a separate commit.
