---
name: Feature 054 fal.ai LTX-Lux spec v2.0 second-pass security review
description: Verification pass on spec.md v2.0 after first-pass fixes. Covers SSRF, credit fraud, rate limiting, R2 re-hosting, prompt injection, and new findings.
type: project
---

Second-pass review of specs/feature/054-fal-ai-ltx-lux-models/spec.md (v2.0) conducted 2026-03-22.

**Why:** Spec was updated to address 10 findings from the first review. This pass verifies fix soundness and looks for missed issues.

**How to apply:** When this spec reaches implementation, reference these remaining gaps.

## Original Finding Statuses

- C-1 (SSRF): FIXED — `validate_uri_no_ssrf()` exists in `media_job_validators.py` with IPv4, IPv6, link-local, DNS rebinding, file://, and scheme allowlist. `host.docker.internal` is explicitly whitelisted (intentional, documented). Spec's `_validate_urls()` correctly covers all 4 URL fields.
- H-1 (Missing auth): CANNOT VERIFY from spec alone — all endpoints go through `protectedProcedure` in `media.ts`.
- H-2 (Lux TTS rate limiter): PARTIALLY FIXED — spec adds `luxTtsLimiter` to `rateLimiter.ts` but does NOT specify where in `media.ts` it gets called; no procedure for audio-specific TTS is shown. The in-memory limiter is also not Redis-backed (single-instance only).
- H-3 (Credit verification from actual output): PARTIALLY FIXED — spec describes the reconciliation algorithm correctly in §10.3, but the `deduct_credits_from_actual()` and `update_task_completed()` functions referenced in §4.6 pseudocode do NOT exist in the codebase. The Node.js credit system owns credit deduction via `deductCredits()`/`refundCredits()` in `media.ts`; Python has no direct credit deduction path. The spec does not describe how Python's `recover_stuck_tasks` communicates the actual duration back to Node.js for reconciliation.
- M-1 (In-memory rate limiter): DEFERRED — spec explicitly acknowledges this in §9 Out of Scope.
- M-2 (Model allowlist): Cannot verify without seeing the `resolveModelMeta` gate; existing DB lookup gate in `media.ts` likely covers it.
- M-3 (Prompt sanitization): PARTIALLY FIXED — spec proposes `re.sub(r'<[^>]+>', '', prompt)` which is reasonable but incomplete (SSML, Unicode lookalike tags not addressed). Adequacy depends on fal.ai's actual prompt handling.
- M-4 (R2 re-hosting): PARTIALLY FIXED — `download_media()` and `upload_to_r2()` exist in `media_pipeline.py` but the spec references a non-existent function `download_and_upload_to_r2()`. Implementers must wire the two separate functions together.
- L-1 (Content policy error): FIXED — §10.8 clearly specifies no logging of rejected prompt, no credit deduction.
- L-2 (Pre-signed URL TTL): FIXED — §10.9 documents the risk and three mitigation options.

## New Findings From This Pass

- N-1 (HIGH): `host.docker.internal` SSRF bypass — the whitelist in `validate_uri_no_ssrf()` was designed for worker-to-host asset downloads. If a fal.ai URL field accepts this hostname, a user could craft a request that causes the Python worker to exfiltrate data from the Node.js server (port 3000/8000). The spec does not restrict which paths are accessible under `host.docker.internal`.
- N-2 (HIGH): Credit reconciliation pathway missing — Python `recover_stuck_tasks` cannot call `deductCredits()`/`refundCredits()` from Node.js. The spec does not define the IPC mechanism (e.g., calling the Node.js web_gateway_client or a new Python credit service endpoint). This means the "deduct from actual" requirement in §10.3 has no implementable path.
- N-3 (MEDIUM): `extraParams: z.record(z.any())` in video/image async procedures passes URL-valued fields straight through to Python without SSRF validation in the tRPC layer. The spec notes defense-in-depth validation in §10.1 but marks it as "should" not "must", and no Zod schema enforcement is specified. `image_url`, `audio_url`, `video_url` arrive in `extraParams` for fal.ai models.
- N-4 (MEDIUM): Error message leakage — `generate_audio()` calls `response.raise_for_status()` which propagates raw fal.ai HTTP error bodies (which may include content-policy rejection details or internal fal.ai error strings) upstream to the user. No error sanitization layer is specified for the `generate_audio()` sync path.
- N-5 (MEDIUM): File size limit absent for extend-video/retake-video. A user can supply a 10GB video URL as `video_url`. The spec does not specify a max file size check before or after fal.ai fetches the input. `FalAIProvider._validate_urls()` only validates the URL string, not the file behind it.
- N-6 (LOW): API key rotation during in-queue tasks — spec uses `provider_config["apiKey"]` at queue submission time. If the key is rotated while a task is in the fal.ai queue, `get_queue_status()` and `get_queue_result()` in `recover_stuck_tasks` will re-fetch the new key from DB, which is correct. No finding here — the per-call key fetch pattern is safe.
- N-7 (LOW): Concurrent quota exhaustion — no per-user concurrency limit on fal.ai video tasks (separate from the sliding-window rate limiter). A user could submit 20 requests in 5 minutes (the `mediaGenerationLimiter` window) all for 2160p/20s videos, exhausting fal.ai quota for all tenants. Spec does not address per-user concurrent fal.ai task limits.
