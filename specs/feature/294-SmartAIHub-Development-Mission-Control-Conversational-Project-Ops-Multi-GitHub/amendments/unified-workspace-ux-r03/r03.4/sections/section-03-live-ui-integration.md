# Section 03 — LIVE UI integration

## Deliverable

Bind R03.3 `/dev/mission-control-live` Harness and execution tabs to the new live read APIs; preserve multi-tab/split selection and return context; navigate to exact Task Control identity without dispatch. Keep R03.2 synthetic prototype unchanged and separate.

## Scope

SmartAIHub Platform Shell LIVE page, API client, existing live CSS/tests. No production route or layout rewrite.

## Prerequisites / checks

Show source freshness, heartbeat and trust separately from dispatch readiness. Render missing/unavailable/partial evidence honestly. Restore only presentation context; server reauthorizes all data. Switching/closing tabs makes no runtime mutation.

## Known gap

LIVE route may show an empty catalog until a genuinely registered, workspace-bound Runner appears.
