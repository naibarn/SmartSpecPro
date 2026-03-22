# Virtual AI Office Orchestrator Hardening — TDD Plan

## Test Strategy

Start with abuse-case and contract tests before UI work.

## 1. Callback Security

- Test: repeated callback with same idempotency key does not complete the handoff twice
- Test: callback with valid payload but wrong `teamId`/`runId`/`workItemId` is rejected
- Test: callback outside allowed clock skew window is rejected
- Test: callback with reused nonce is rejected and audit-logged
- Test: retry attempt increments attempt count without duplicating the work result

## 2. Revision Concurrency

- Test: update against stale `revisionVersion` returns conflict
- Test: approval/rejection must target the latest active revision unless explicitly overridden
- Test: critique replies preserve thread lineage through `threadRootMessageId` and `replyToMessageId`
- Test: lock expiry releases abandoned draft ownership safely
- Test: superseded revision cannot become final after a newer revision is approved

## 3. Mixed-Member APIs

- Test: team roster responses serialize persona, human, and connector members as a discriminated union
- Test: monitoring payloads do not assume every member has an `assistantId`
- Test: runtime resolution endpoint returns correct execution mapping for each member kind
- Test: frontend roster consumer can render all member kinds without fallback hacks

## 4. Room Redaction

- Test: raw connector payload containing sensitive fields is stored in sanitized form for room display
- Test: citations and artifact references remain visible after redaction
- Test: redaction metadata is recorded for each masked room message
- Test: low-risk non-sensitive work update may bypass heavy redaction according to policy
- Test: summary mode never exposes secret-bearing raw payloads

## Regression Checks

- existing room-first collaboration still works
- peer critique/revision flow remains inspectable
- one persona can still be reused across multiple teams
