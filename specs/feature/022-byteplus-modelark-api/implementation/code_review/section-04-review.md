# Code Review: section-04-python-adapter-tests

## Summary

57 tests pass. Several issues found.

---

## HIGH Severity

### 1. Test file location (non-issue — existing convention wins)
Plan said `tests/providers/` but that doesn't exist. Existing convention places provider tests
in `tests/unit/llm_proxy/` (test_ollama_provider.py, test_openrouter_provider.py etc.).
The choice made in section 03 is correct. Let go.

### 2. SSRF "public URL allowed" test bypasses actual validator
Patching `validate_uri_no_ssrf` in `test_public_reference_image_url_is_allowed` means the
test doesn't prove the real validator passes public URLs. Fix: use `https://1.1.1.1/img.jpg`
(Cloudflare public IP) which resolves without DNS and passes the validator.

### 3. `_normalize_byteplus_task_state` has no mixed-case test
`.lower()` is called before comparison but all test inputs are already lowercase.
A `"Succeeded"` -> `"success"` case is needed to pin that behavior.

---

## MEDIUM Severity

### 4. Trivially-guessable secret in video task api_key_not_in_logs test
`secret = "test-key"` is unlikely to appear in logs anyway. Should use a UUID-like sentinel.

### 5. `_extract_byteplus_result_url` missing iteration test
No test verifies that a non-matching first item is skipped and the second item's URL is returned.

---

## LOW Severity

### 6. 500 error test missing from generate_image
Plan mentioned both 401 and 500; the new suite only tests 401.

### 7. Timeout assertion else-branch only checks attribute existence (not value)
Acceptable for now since the float path works correctly.

---

## Auto-Fix Plan

- Fix SSRF "allowed" test to use 1.1.1.1 instead of patching
- Also fix I2V content tests to use IP-based reference URL
- Add mixed-case test for _normalize_byteplus_task_state
- Strengthen api_key_not_in_logs secret in video task test
- Add multi-item iteration test for _extract_byteplus_result_url
- Add 500 error test for generate_image
