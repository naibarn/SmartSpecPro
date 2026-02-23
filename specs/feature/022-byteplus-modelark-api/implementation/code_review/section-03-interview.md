# Code Review Interview: section-03-python-adapter

## Triage Decision

No user interview needed — all items were either clearly auto-fixable or let go.

---

## Auto-Fixed Items

### 1. [HIGH] Defensive response parsing in generate_image and create_video_task

**Issue:** Bare dict access (`resp["id"]`, `data[0]["url"]`, `resp["usage"]["total_tokens"]`) would
raise KeyError on malformed BytePlus 200 responses.

**Fix applied:** Changed to defensive `.get()` with explicit `ValueError` raised when required
fields are absent. Added bounds check for `data` list being non-empty.

### 2. [MEDIUM] Missing error-path structlog events

**Issue:** No try/except around HTTP calls — errors propagated silently without logging.
KieAIProvider pattern requires error logging before re-raise.

**Fix applied:** Added try/except for `httpx.HTTPStatusError` and `httpx.RequestError` in
all three async methods (`generate_image`, `create_video_task`, `get_task_status`), logging
`*_http_error` and `*_request_error` events respectively (no API key in any log event).

### 3. [LOW] Bare frozenset type annotations

**Issue:** `IMAGE_MODELS: frozenset` and `VIDEO_MODELS: frozenset` lacked type parameter.

**Fix applied:** Changed to `frozenset[str]` and `dict[str, str]` per spec.

---

## Let Go Items

### [LOW] Leaked AsyncClient in sync stub tests

Sync tests that create `BytePlusModelArkProvider(api_key="k")` without closing the client.
Section 04 will use proper pytest fixtures with `async with` or `aclose()` in teardown.

### [LOW] Redundant @pytest.mark.asyncio decorators

`asyncio_mode = "auto"` makes them unnecessary. Harmless; section 04 will write cleaner tests.

### [LOW] Tautological API key test

`test_init_api_key_not_in_headers_value` checks for absence in `X-API-Key` (never set),
which is trivially true. Section 04 will implement proper structlog capture test.

### [LOW] Double-space between inline flags

Matches the spec exactly. BytePlus parser behavior is unknown but spec-compliant.
