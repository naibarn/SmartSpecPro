# Vertical Drama transient media polling resilience

## Goal

Provider status-read failures such as HTTP 429, timeout, network loss, and
temporary upstream 5xx must not be presented as code bugs or terminal media
failures. The task remains durable and is retried or resumed later. Genuine
contract, authorization, validation, and provider-declared terminal failures
retain their existing error behavior.

## Design

- The server polling boundary classifies transient provider-read errors and
  returns a non-terminal queued result for the Vertical Drama candidate flow.
  The generic `media.getTask` route exposes a typed retryable tRPC error with a
  bounded retry-after hint when it cannot return a task.
- Character media status reads share a serialized client poll gate with a small
  minimum gap, preventing a candidate batch from issuing simultaneous status
  requests. Server retry-after hints take precedence over normal polling delay.
- `systemErrorMonitor` keeps retry behavior intact but suppresses bug-report
  capture for recognized transient provider/read errors. Real code and data
  contract failures remain reportable.

## Failure behavior

Transient read failure: keep task queued/processing, back off, and resume.
Provider-declared `status: failed`: preserve terminal failure handling.
Structural/auth/data errors: preserve error reporting and diagnostics.

## Verification

Focused tests cover transient classification, retry-after handling, serialized
polling, and feedback suppression. Browser/provider/deployment smoke remains a
separate gate.
