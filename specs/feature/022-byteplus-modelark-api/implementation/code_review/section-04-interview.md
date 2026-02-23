# Code Review Interview: section-04-python-adapter-tests

## Triage Summary

All review findings were either auto-fixed or let go. No user decisions required.

---

## Auto-Fixes Applied

### HIGH-2: SSRF "public allowed" test — use real validator
**Finding:** `test_public_reference_image_url_is_allowed` patched `validate_uri_no_ssrf` instead of
proving the real validator passes public IPs.
**Fix:** Changed all three tests that patched the validator to use `https://1.1.1.1/img.jpg`
(Cloudflare public IP). This IP passes `validate_uri_no_ssrf` without DNS resolution, so the test
now exercises the real validator and proves the security contract holds.
**Affected tests:**
- `test_create_video_task_i2v_content_array_has_text_and_image_url`
- `test_create_video_task_i2v_image_url_matches_reference`
- `test_public_reference_image_url_is_allowed`

### HIGH-3: Mixed-case test for `_normalize_byteplus_task_state`
**Finding:** All parametrize inputs were already lowercase. The `.lower()` call before comparison
was not exercised with a mixed-case input.
**Fix:** Added `("Succeeded", "success", "Succeeded")` to the parametrize table. Raw value is
preserved while normalized value is lowercased — both assertions confirmed.
**Test count:** 6 → 7 status variants (now 60 total tests from 57).

### MEDIUM-4: Trivially-guessable secret in video task API key log test
**Finding:** `secret = "test-key"` is unlikely to appear in logs accidentally, making the test weak.
**Fix:** Changed to `secret = "bp-sk-sentinel-7f3a9d2c1e4b8f6a"` and moved provider construction
into the test body so the fixture key isn't used. The provider's `_api_key` is now the sentinel.

### MEDIUM-5: Missing multi-item iteration test for `_extract_byteplus_result_url`
**Finding:** No test verified that a non-matching first item is skipped and the second item is returned.
**Fix:** Added `test_skips_non_matching_first_item_and_returns_second` — content array has a `text`
item followed by a `video_url` item; asserts the video URL is returned.

### LOW-6: Missing 500 error test for `generate_image`
**Finding:** Plan mentioned both 401 and 500; only 401 was tested.
**Fix:** Added `test_generate_image_raises_on_500_server_error` with status_code=500.

---

## Let Go

### LOW-7: Timeout else-branch only checks attribute existence (not value)
Acceptable for now. The float path is covered by the existing assertion. Attribute existence check
correctly handles `httpx.Timeout` objects which expose `.read`/`.connect` attributes.

---

## Final Test Count

60 tests, all passing. Up from 57 (3 new tests added by fixes).
