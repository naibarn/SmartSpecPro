---
name: FalAI Provider Completeness Audit
description: Full security audit of FalAIProvider, media_job_validators, rate limiting, API key handling, and call sites — 2026-03-23
type: project
---

# FalAIProvider Security Audit — 2026-03-23

**Branch:** `codex/feature-044-multimodal-chat-memory`
**Scope:** `fal_ai_provider.py`, `media_job_validators.py`, `gateway_unified.py` (all three FalAI call sites), `media_tasks.py` (polling branch)

---

## Summary

The provider itself is well-hardened (model allowlist, request_id regex, prompt sanitisation, `follow_redirects=False`, structured logging, no secret leakage in error messages). One CRITICAL SQL injection issue was found in a closely related method (`_check_fal_concurrent_limit`) that is called on every video generation request through the FalAI path. Two HIGH findings and two MEDIUM findings round out the audit. No prompt injection or `os.environ` serialisation issues were found.

---

## Findings

| ID  | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|-----|----------|-----------|--------------|-------------|-----------------|
| F01 | HIGH | `python-backend/app/llm_proxy/gateway_unified.py:1622-1625` | SQL injection via raw `text(f"…")` | `_check_fal_concurrent_limit` builds the `IN (…)` clause by f-string-joining model names from `FalAIProvider.VIDEO_MODELS` — a frozenset of string literals — directly into a `sa_text()` query. Although the values are currently compile-time constants, the pattern is identical to the injection-prone anti-pattern and will silently stay unsafe if the frozenset ever contains a value derived from any dynamic source. The `user_id` bind param `:uid` is correct, but the `model IN ({model_list})` fragment is not parameterised. | Replace with a fully parameterised form: use `ANY(:models)` with a typed array bind, or generate numbered params (`IN (:m0, :m1, …)` with a dict). Alternatively query `FalAIProvider.VIDEO_MODELS` as an application-side set filter after fetching all in-progress rows by `userId` and `status`, removing the dynamic SQL entirely. |
| F02 | HIGH | `python-backend/app/llm_proxy/gateway_unified.py:976` | Missing SSRF validation on `extra_params` before passing to `generate_video` | The `extra` dict is built from `request.extra_params` (user-supplied dict) before being forwarded to `generate_video`. `generate_video` calls `_validate_urls` which only inspects keys in `_URL_FIELDS = {"image_url", "end_image_url", "audio_url", "video_url"}`. Any user-supplied URL key that does not exactly match one of those four names (e.g., `reference_url`, `style_url`, `overlay_url`, `mask_url`) passes through unvalidated and is included in the payload sent to fal.ai. If fal.ai performs server-side fetching of arbitrary URL fields, a user could supply an internal-network URL under an unrecognised field name. Same pattern is present at lines 672 (image) and 1269 (audio). | Extend `_URL_FIELDS` to cover all URL-bearing keys accepted by fal.ai models, or add a catch-all validation pass that checks any `extra_params` key whose value matches `^https?://` against `validate_uri_strict`. |
| F03 | MEDIUM | `python-backend/app/llm_proxy/gateway_unified.py:1251-1295` | Missing concurrent-request guard on fal.ai audio path | `generate_video` (line 964) calls `await self._check_fal_concurrent_limit(user.id)` before submitting a fal.ai job, preventing per-user DoS. The fal.ai audio path (lines 1258-1295) and the fal.ai image path (lines 661-706) have no equivalent guard. A user can submit an unbounded number of synchronous audio/image requests in parallel, exhausting the httpx connection pool and/or fal.ai API quota without any back-pressure. | Add a `_check_fal_concurrent_limit` call (or a lighter-weight Redis-based counter) before the audio and image `generate_*` invocations, similar to the video path. |
| F04 | MEDIUM | `python-backend/app/llm_proxy/gateway_unified.py:1447` | Unvalidated URL from fal.ai response stored and returned as `result_url` | In `media_tasks.py` (polling recovery branch, line 1447) and in `get_queue_result` (fal_ai_provider.py line 318), the `url` value from fal.ai's response JSON is accepted and stored directly as `task.result_url` without any validation. If fal.ai returns a `file://`, `javascript:`, or internal-network URL (e.g., due to compromise or misconfiguration), it could propagate into the database and be served to clients as a download link, enabling open-redirect or SSRF on the client side. | Apply `validate_uri_strict` to `result_url` before storing it. If validation fails, mark the task as failed rather than storing the bad URL. A lightweight check (`if result_url and not result_url.startswith(("https://", "http://")): raise ...`) is the minimum; `validate_uri_strict` is preferred. |
| F05 | LOW | `python-backend/app/llm_proxy/fal_ai_provider.py:129-135` | Fail-open on non-timeout network errors in `_check_video_size` | `httpx.RequestError` (connection refused, SSL error, DNS failure to a known-bad domain) causes the size check to be silently skipped rather than raising. An attacker who controls a URL pointing to a server that deliberately resets connections could bypass the 500 MB video size guard. This is a defence-in-depth gap rather than a critical path, since the underlying API will still time out. | Change the `except httpx.RequestError` branch to raise `ValueError` (blocking the upload) for cases where the URL previously passed SSRF validation — i.e., the host resolved to a public IP. Only truly transient errors (e.g., a well-classified timeout subclass) should be fail-open. |

---

## What validate_uri_strict Does

`validate_uri_strict` in `media_job_validators.py` is an alias for `validate_uri_no_ssrf(uri, allow_docker_internal=False)`. It:
1. Blocks URIs containing shell metacharacters (`;|&\`$(){}><`).
2. Rejects `file://` and any scheme other than `http`/`https`.
3. Rejects `localhost`, `0.0.0.0`, and `host.docker.internal`.
4. Performs a **DNS resolution** of hostname to detect DNS-rebinding attacks — unresolvable hostnames are blocked by default.
5. Blocks any hostname that resolves to a private, loopback, link-local, or reserved IP range.

This is strong SSRF coverage for the fields it is applied to.

---

## API Key Storage and Retrieval — Assessment: SECURE

The fal.ai API key flow is:
1. Stored in the `media_providers` table as `apiKeyEncrypted` (AES-256-GCM, encrypted by the Node.js `crypto.ts` layer using `LLM_ENCRYPTION_KEY`).
2. Retrieved by `get_media_provider_key("fal_ai")` in `media_provider_service.py`, which decrypts using `smartspecweb_crypto.py` (same key, AES-256-GCM). A 300-second cache sits in front to reduce DB round trips.
3. Passed directly as `api_key=provider_config["apiKey"]` into `FalAIProvider.__init__`, which stores it only in `self._headers` and never logs it.
4. `_headers` is commented as secret and is never passed to `logger.*` calls. The `fal_ai_provider_init` log emits only `base_url`.

No `print()` leakage, no API key in error messages, no serialisation in response bodies.

---

## Rate Limiting — Assessment: PARTIAL

| Path | Guard |
|------|-------|
| `generate_video` (fal.ai queue) | `_check_fal_concurrent_limit`: DB count of in-progress tasks per user (max 3) — **present** |
| `generate_audio` (fal.ai LUX TTS) | None — **missing** (F03) |
| `generate_image` (fal.ai Flux) | None — **missing** (F03) |
| Queue status polling (`recover_stuck_tasks`) | 429 is caught and `continue`d — graceful back-off — **present** |

---

## Scope of SQL Injection Risk in F01 (detail)

```python
# gateway_unified.py:1622-1625
model_list = ",".join(f"'{m}'" for m in _FalProvider.VIDEO_MODELS)
query = sa_text(
    f'SELECT count(*) FROM media_tasks WHERE "userId" = :uid '
    f"AND status = 'PROCESSING' AND model IN ({model_list})"
)
```

`VIDEO_MODELS` is a compile-time `frozenset` of string literals (no user input reaches it today), so **there is no current exploitable injection path**. However the pattern violates the project's parameterised-query requirement and is one inadvertent change away from being exploitable. It is rated HIGH (not CRITICAL) on that basis.

**Why:** Matches the project's HIGH severity definition for raw `text(f"…")` queries even when the interpolated values are currently constants.
