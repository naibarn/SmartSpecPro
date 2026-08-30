# Kie Image Policy Failure Polling Design

## Problem

Kie can return a terminal policy refusal with `state=fail`, `failCode`,
`failMsg`, and `completeTime`. The current normalizer treats `completeTime` as
success before reading the provider state, then keeps polling when no result URL
exists. The task eventually becomes a local timeout and creates a false admin
feedback ticket.

## Design

- Normalize explicit provider failure state and failure markers before the
  `completeTime` fallback.
- Preserve only bounded operational failure metadata (`failCode` and a concise
  failure message); do not persist prompts, raw provider payloads, or signed
  result URLs.
- Keep the existing policy-error notification boundary. Once the provider
  failure message is preserved in `task.error_message`, policy refusals notify
  the owner without creating admin alerts or auto-feedback.
- Add a regression test using the observed Kie response shape and assert that
  it normalizes to failure rather than success.
- Restart the local Celery media worker after verification so its loaded module
  matches the corrected worktree source.

## Trade-offs and failure handling

Explicit provider failure markers take precedence over `completeTime`; this
avoids waiting ten more minutes for a task that Kie has already rejected.
`completeTime` remains a compatibility fallback only when no explicit state or
failure marker is available. Unknown states continue through the existing
bounded polling/hard-timeout path.

## Verification

Run the focused Kie queue and media retry tests, then inspect the worker's
loaded timeout constants and task registration after restart. No production
deployment or credit-consuming generation is part of this change.
