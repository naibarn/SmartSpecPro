# Kie Reference Image Download Reliability

## Context

Vertical Drama image generation can fail before Kie.ai receives a task when the
Python provider cannot download one managed reference image. The current
`KieAIProvider._upload_reference_image()` collapses all `httpx.HTTPError`
variants into `Kie reference image download failed for item N`, so transient
storage/broker failures are indistinguishable from revoked or missing URLs.

## Goal and non-goals

The goal is to make the pre-Kie reference download path resilient to bounded,
transient failures and diagnosable without exposing signed URLs or tokens. The
change must preserve the existing Kie-hosted upload contract and must not retry
provider generation or create another credit reservation.

Non-goals are changing tenant authorization, making protected storage public,
refreshing broker grants from Python, or silently dropping a required reference.

## Design

1. Download each reference with a small bounded retry policy for connection,
timeout, 408, 425, 429, and 5xx failures. Use exponential/backoff delays and
retry only the download step. Do not retry deterministic 4xx failures such as
401, 403, or 404.
2. Preserve the existing fail-closed behavior when a reference cannot be
materialized. Raise an error that includes the 1-based item index, sanitized
source host/status category, and a stable reason; never include query strings,
authorization headers, signed tokens, or response bodies. Mark permanent 4xx
access failures as non-retryable at the Celery boundary, while exhausted
transient failures remain eligible for the existing bounded task retry.
3. Keep upload validation unchanged: empty content, 10 MB limit, supported
image MIME types, and usable Kie upload URL remain terminal validation errors.
4. Add focused unit tests for transient recovery, terminal HTTP failures, and
safe error formatting, alongside the existing upload contract test.

## Failure handling and operations

The pre-submit failure remains retryable through the existing Celery task policy
when the failure is transient, but a revoked/missing broker URL fails without
blind repeated downloads. The worker logs only item index, hostname, status,
attempt number, and error class. A live Kie task is not created until all
references have been uploaded, so no provider polling or credit reconciliation
path changes are required.

## Verification

Run the focused Kie provider and media task tests, Python compilation for the
changed modules, and `git diff --check`. Live Kie generation, deployment,
worker restart, and browser replay remain separate evidence levels and are not
claimed by focused tests.

## Trade-off

A bounded retry adds a small delay for transient storage/broker incidents, but
avoids paying for or re-submitting a generation. Permanent access failures stay
fail-closed so the system does not hide a broken tenant reference or consume
unbounded worker time.
