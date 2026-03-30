---
name: Feature 054 FalAIProvider deep security audit
description: Deep audit of FalAIProvider for SSRF, URL path injection, error handling, timeout, and prompt sanitisation issues
type: project
---

Audit of `python-backend/app/llm_proxy/providers/fal_ai_provider.py` plus call sites in `gateway_unified.py` and recovery loop in `media_tasks.py`.

**Why:** Pre-merge security gate for feature/054-fal-ai-ltx-lux-models branch.

**How to apply:** If `FalAIProvider` is modified, re-run this audit against F01–F04 (the four HIGH findings) before merging.

## Critical findings (must fix before merge)

- **F02 HIGH** — `model_id` interpolated into fal.ai URLs without allowlist check. Original `request.model` is passed from gateway to provider without sanitisation. Fix: validate against `VIDEO_MODELS | AUDIO_MODELS | IMAGE_MODELS` frozensets at top of each public method.
- **F03 HIGH** — `request_id` from fal.ai API response interpolated into polling URLs without regex validation. Also replayed from DB in recovery loop. Fix: `^[a-zA-Z0-9_\-]{8,128}$` regex before URL construction.
- **F01 HIGH** — `follow_redirects` not explicitly set to `False` on `client.post` and `client.get` calls (only the HEAD check sets it). httpx POST default may follow redirects depending on version.
- **F08 MEDIUM** — `data["request_id"]` in `_submit_queue` is unguarded; KeyError bypasses `_handle_http_error` on malformed provider response.

## Lower-priority findings

- F04 HIGH (arch): `host.docker.internal` whitelisted in `validate_uri_no_ssrf` — inconsistent with provider-level block. Needs documentation and unit test.
- F06 MEDIUM: `_check_video_size` bare `pass` on exceptions swallows SSRF-adjacant errors silently.
- F07 MEDIUM: Single 300 s timeout for all calls; HEAD check should use short timeout (10 s).
- F09 MEDIUM: `str(e)` in some HTTP 500 details leaks internal exception text (video/audio routes; image route already fixed).
- F05 MEDIUM: `_sanitize_prompt` name implies broader safety than HTML-stripping; rename or add length cap.
- F10 LOW: `_headers` dict contains API key — annotate to prevent accidental log spread.
- F11 LOW: `_derive_resolution` not type-safe against string or negative `width` from provider response.

## Report location

`specs/feature/054-fal-ai-ltx-lux-models/implementation/code_review/provider-security-audit.md`
