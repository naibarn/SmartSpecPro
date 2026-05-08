# Feature 110 Smoke Test Notes

Reviewed: 2026-05-06

## Staging Prerequisites

- Seed or update Magnific provider/model rows.
- Configure an enabled `magnific` provider connection with a production Magnific API key and public HTTPS base URL.
- Confirm R2/object storage credentials are present for media re-hosting.
- Keep video and video-upscaler model rows disabled until staging smoke tests pass, because pricing is provisional and external provider costs are not reversible.

## Smoke Matrix

- Mystic image: submit through async image flow, poll to completion, confirm `result_url` is a platform URL and no provider CDN URL is exposed.
- Mystic LoRA selector: open model field options and confirm `GET /v1/ai/loras` uses `x-magnific-api-key`; fallback should show no dynamic options without breaking the form.
- Remove Background: submit sync flow with an uploaded image reference, confirm immediate re-hosted platform URL.
- Veo/Kling/Wan video: enable one staging row, submit async video flow, poll to completion, confirm R2 video metadata and thumbnail metadata.
- Video Upscaler Precision: enable only in staging with an intentionally small input clip, verify longer polling window and re-hosted output.
- Recovery: stop/restart the worker with an in-flight Magnific task, run stuck-task recovery, and confirm polling resumes from persisted `result_data.submission`.
- Failure/refund: force a missing key or provider failure and confirm sanitized error plus normal task failure/refund reconciliation.

## Local Verification Caveat

Local Python verification remains compile-only in this environment because `pytest` and `httpx` are not installed in the active Python runtime. CI or staging should run the added Python pytest files before enabling video/upscaler rows.
