# Section 05 - Tests, Rollout, and Operational Guardrails

## Goal

Ship the feature safely with deterministic tests, controlled rollout, and operational protections.

## Scope

- Add provider contract tests
- Add TikTok validation tests
- Add YouTube Shorts classification tests
- Add workflow/agency dispatch tests
- Keep Meta behavior unchanged
- Roll out behind feature and provider enablement flags

## Guardrails

- Reject unsupported media early
- Preserve audit logs for publish/draft/schedule actions
- Normalize provider errors for worker retries
- Keep future providers pluggable through the registry

## Acceptance Criteria

- Test suite covers registry, adapters, and dispatch
- Errors remain diagnosable in background jobs
- Rollout can be staged per tenant or provider
- The implementation remains additive to existing Meta social flows
