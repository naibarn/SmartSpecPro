# Section 07: Security, Observability, And Rollout

## Goal

Harden the integration for a high-cost external media provider and make rollout/rollback operable.

## Files In Scope

- shared SSRF validators used by media requests
- provider/model readiness helpers
- admin diagnostics surfaces if they already exist
- logging/metrics helpers already used by media tasks
- rollout/runbook docs under the feature directory if no central docs location exists
- security/billing tests from previous sections

## Implementation Requirements

### 1. URL and payload safety

Validate every user-controlled media URL:

- before sending to Magnific
- before downloading provider result URLs
- after redirect resolution

Reject:

- private IPs
- loopback
- link-local
- metadata service IPs
- internal hostnames
- `host.docker.internal`
- `.local` and `.internal`
- non-HTTPS provider-facing URLs unless a documented base64 path is used

Do not persist base64 payloads beyond existing request/job lifecycle.

### 2. Secret hygiene

Logs, audit records, and user-facing errors must not include:

- Magnific API keys
- auth headers
- signed URLs or query strings
- base64 image/video data
- webhook secrets
- raw provider bodies containing prompt/source data

### 3. Concurrency and quotas

Add or reuse concurrency limits:

- lower limits for video generation
- lower limits for video upscaler
- per-user and per-tenant gates
- provider-disabled and model-disabled checks before scheduling

### 4. Observability

Emit structured events for:

- connection test
- submit
- poll
- completion
- terminal failure
- timeout
- re-hosting
- refund
- rollback stop

Include model id, provider task id, sanitized status, latency, and terminal reason.

### 5. Admin readiness diagnostics

Expose or persist readiness signals:

- provider disabled
- API key missing
- last connection test failed
- model disabled
- readiness provisional
- pricing estimated
- last staging smoke state if available

### 6. Rollout and rollback docs

Create a short runbook if no existing central runbook fits:

- seed provider/model rows
- configure key
- run connection test
- enable admin-only low-cost image model
- validate smoke tests
- enable images/edit/sync
- enable video with caps
- enable upscaler last
- rollback by disabling provider and models
- refund/mark in-flight jobs if immediate stop is required

Unless Magnific cancellation support is verified in official docs during implementation, the runbook must state that already-submitted external jobs may continue provider-side even after SmartSpecPro disables/refunds local tasks. Record rollback-stopped jobs with provider task id, model id, local task id, refund id if present, and terminal reason so finance/support can reconcile external cost.

## TDD First

Write tests:

- provider/model disabled prevents new submissions
- unsafe URLs and redirect-to-private fail
- logs redact API keys and signed URLs
- video/upscaler concurrency cap is enforced or documented through existing policy tests
- readiness diagnostics show missing key, disabled provider, disabled model, estimated pricing, and failed connection
- rollback terminal reason refunds in-flight jobs
- rollback-stop observability records enough metadata to reconcile provider-side sunk cost

## Acceptance

This section is complete when a production operator can enable or disable Magnific safely, inspect readiness, and trust that failures do not leak secrets or provider-hosted temporary URLs.
