# Section 06: Polling, Re-Hosting, And Billing

## Goal

Add robust async polling/recovery, enforce platform re-hosting before completion, and close credit reservation/refund behavior.

## Files In Scope

- `python-backend/app/tasks/media_tasks.py`
- `python-backend/tests/tasks/test_media_tasks_magnific.py`
- `apps/web/server/__tests__/creditReservation.test.ts`
- `apps/web/server/__tests__/creditReconciliation.test.ts`
- storage/re-hosting helpers already used by media tasks
- any existing billing/pricing helper touched by Magnific model metadata

## Implementation Requirements

### 1. Polling branch

Add a Magnific branch to async recovery/polling.

Detect Magnific from:

- `task.result_data.submission.provider == "magnific"`
- persisted provider model id
- model id prefix

Use provider metadata to reconstruct:

- provider task id
- provider model id
- submit endpoint
- status endpoint
- dispatch mode
- timeout policy

### 2. Status mapping

Map:

- `CREATED` to queued
- `IN_PROGRESS` to processing
- `COMPLETED` to completed
- `FAILED` to failed
- `CANCELLED` and `CANCELED` to failed

Handle lowercase equivalents where encountered.

### 3. Backoff and timeout

Use bounded task-type-specific backoff:

- image generation/edit/enhancement: first poll 2s, base 3s, max 20s, timeout 15m
- video generation: first poll 5s, base 10s, max 60s, timeout 60m
- video upscaler: first poll 10s, base 20s, max 90s, timeout 90m

Honor `Retry-After` for 429/5xx/network timeout where present.

### 4. Re-hosting

Before marking completed:

- download every primary result URL
- validate content type and size
- upload to platform storage
- store platform URL in final result payload
- preserve secondary outputs only after re-hosting
- never expose provider-hosted URLs to users

Remove Background temporary URLs are sync-only and must already be re-hosted before this branch sees them.

### 5. Billing

On submit:

- reserve credits from seed pricing snapshot
- store reserved credits and pricing inputs

On completion:

- recompute actual cost when reliable output metadata exists
- refund over-reservation
- never auto-charge above reservation without a separate audited path

On failure:

- refund provider failures
- refund timeout failures
- refund re-hosting failures
- refund validation failures after reservation

Refund handling must be idempotent. Replayed terminal handlers, worker restarts, or repeated provider failure events must not issue duplicate refunds for the same reservation.

### 6. Duplicate-submit and recovery closure

Polling/recovery must treat a persisted Magnific provider task id as the source of truth. If a worker restarts after provider submission, it must rebuild the provider client and continue status polling. It must not re-submit the original request unless implementation proves no provider task id was ever persisted and no external job was created.

## TDD First

Write tests:

- Magnific queued/processing/completed/failed statuses map correctly
- retry-after is honored
- timeout marks failed and refunds
- completed provider URL is re-hosted before final result
- provider-hosted URL is absent from user-visible result
- missing provider task metadata fails safely and refunds
- re-hosting failure fails/refunds
- actual-cost reconciliation refunds over-reservation
- repeated terminal failure handling does not refund twice
- worker restart after provider task id persistence resumes polling without duplicate submit

## Acceptance

This section is complete when long-running Magnific tasks can survive worker restart, poll to completion/failure, re-host outputs, and settle credits deterministically.
