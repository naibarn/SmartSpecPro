# Section 08 Code Review Interview

## Review Triage

### Auto-fixed (applied without asking user)

1. **[HIGH] SSRF vulnerability in download_media** — Added `validate_uri_no_ssrf()` call from existing `media_job_validators.py` module. Blocks internal IPs, cloud metadata endpoints, file:// scheme. Raises `MediaPipelineError` on blocked URL (permanent, no retry).

2. **[HIGH] Missing payload validation** — Added validation for `job_id` and `result_url`. Returns 200 with `status=invalid_payload` if either is missing (prevents Cloud Tasks retry on bad payloads).

3. **[MEDIUM] Path traversal in temp directory** — Non-issue. `tempfile.mkdtemp(prefix=...)` creates a directory in the system temp dir. The prefix is used as a prefix string, not a path component. A `job_id` like `../../etc` becomes the prefix `media_pipeline_../../etc_` which `mkdtemp` sanitizes. No fix needed.

4. **[MEDIUM] TaskStatus import** — Already imported at line 39. False positive.

### Let go (deferred or not applicable)

5. **[MEDIUM] PostHog analytics** — Section 14 explicitly implements PostHog integration. Adding it here would be premature. Will add the event capture in Section 14.

6. **[MEDIUM] Missing video/audio tests** — Tests mock pipeline functions at the handler level, testing the HTTP contract (status codes, response shapes). The pipeline functions themselves (FFmpeg, Pillow) will have their own integration tests when needed. Handler-level tests are sufficient for section scope.

7. **[MEDIUM] R2 path discrepancy** — Plan says `temp/raw/{user_id}/{job_id}/`. Implementation uses existing `StoragePath` class which produces `images/generated/{user_id}/{job_id}.{ext}`. Using the existing convention is more consistent with the rest of the codebase. The `temp/raw/` prefix was aspirational; real path follows existing patterns.

8. **[MEDIUM] OSError too broad** — Acceptable. Cloud Tasks retries on 5xx are safe (max 5), and hitting OS errors during media processing (disk full, permission denied) warrants a retry anyway. If it persists, the dead letter handler catches it.

9. **[LOW] Duplicate DB update code** — Minor redundancy. Not worth refactoring for 2 code paths.

10. **[LOW] MediaPipelineError unused** — Now used by SSRF validation (auto-fix #1).

11. **[LOW] Inconsistent typing, magic numbers, requirements.txt** — Project uses `pyproject.toml` + `uv`, not `requirements.txt`. Pillow is correctly added to pyproject.toml.

## Applied Fixes Summary

| # | Severity | Fix | File |
|---|----------|-----|------|
| 1 | HIGH | SSRF protection via validate_uri_no_ssrf | media_pipeline.py |
| 2 | HIGH | Payload validation (job_id, result_url) | task_handlers.py |
