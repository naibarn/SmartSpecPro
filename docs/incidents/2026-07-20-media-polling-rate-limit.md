# Incident Postmortem — Media Polling Rate-Limit Exhaustion

## Summary

On 2026-07-20, an abandoned MCP image task triggered a Media History polling
feedback loop. The loop exhausted a Python backend rate-limit bucket shared by
Node-to-Python traffic and temporarily rejected unrelated direct Kie image
generation before those requests reached Kie. The stale task was stopped, the
polling and routing paths were corrected, authenticated buckets were isolated,
and production verification found no recurring burst or 429.

## Symptom

- Vertical Drama start-frame generation returned
  `Too many requests. Please try again later.`
- At 09:15:38 Asia/Bangkok, Python rejected
  `POST /api/v1/media/async/image` with 429.
- The rejected direct image request did not make an outbound Kie API call.
- A stale MCP task generated 354 Python `fetch-result` calls in about 100
  seconds, each returning 404.

## Impact

Direct media generation using Kie and any other authenticated request sharing
the same Python limiter bucket could be rejected while the bucket was full.
The site and database remained available, and no data loss was observed.

## Root Cause

The incident required three conditions:

1. `media.listTasks` merged MCP and Python media tasks into one history list,
   but `media.fetchTaskResult` forwarded every task ID to Python. MCP IDs exist
   only in Node's `mcp_media_tasks` table, so Python returned 404.
2. The Media History effect called its polling tick immediately whenever effect
   dependencies changed. Mutation/query state rerenders repeatedly recreated the
   effect and bypassed the intended 15-second interval.
3. Python `RateLimitMiddleware` verified Node session JWTs but only derived an
   identity from `sub` or `user_id`. Session tokens using `openId` remained on
   `ip:127.0.0.1`, combining otherwise unrelated requests in one 120/minute,
   burst-180 bucket.

The MCP image hard timeout also defaulted to 24 hours, allowing an abandoned
image task to remain eligible for polling much longer than necessary.

## Immediate Containment

- Backed up `mcp_media_tasks`.
- Marked the only pending/processing MCP row
  `mcp_815c37bf01582291e6bb200d7b9960a1` failed.
- The following observation window recorded zero MCP fetches, zero limiter
  events, and zero 429 responses.

## Fix

- `media.fetchTaskResult` now resolves MCP tasks through
  `getMcpMediaTask(taskId, ctx.user.id)` and never forwards them to Python.
- Media History polling now uses per-task reservation timestamps, a single
  in-flight guard, a stable effect lifecycle, and 429 `Retry-After` backoff.
- Python rate-limit identity now supports verified numeric `sub`, legacy
  `user_id`, and a SHA-256 digest of verified `openId`; missing identity still
  falls back to IP.
- MCP image/audio hard timeout is now 2 hours; video remains 24 hours.

## Validation

- Web: 40 focused tests passed, covering MCP/direct dispatch, polling state,
  Media History compilation, and stale MCP reconciliation.
- Python: 36 focused tests passed, covering limiter identity, GPT Image 2
  routing, and async effective-model persistence.
- Full TypeScript `pnpm check` passed.
- Focused Ruff checks passed.
- Backend, web, and public health endpoints returned healthy/200 after graceful
  restarts.
- Two post-deploy polling windows recorded:
  `fetch-result=0`, `MCP fetch-result=0`, `404=0`, `rate-limit event=0`,
  `429=0`, and pending MCP tasks `0`.
- No paid Kie generation was submitted as part of verification.

## How It Slipped Through

- Existing 404/429 handling treated these responses as transient but did not
  prevent effect-driven immediate retries.
- MCP-aware dispatch existed in `getTask` and `cancelTask` but was missing from
  `fetchTaskResult`.
- Authentication tests covered request authorization, but not the limiter's
  compatibility with Node session JWT claim shapes.
- A single timeout default was applied to image, audio, and video tasks despite
  their different expected durations.

## Follow-Ups

- Regression coverage and implementation plan:
  `specs/quick/093-media-polling-rate-limit-containment/`.
- Monitor Python 404/429 rates and MCP terminal-state age during future media
  releases.
