# SmartAIHub Runner Companion WP2A — typed view-state projection

Date: 2026-10-22
Source commit: `96e1ce9f1` (`feat(runner): add companion view-state projection`)
Base: `origin/main` at `fd682249fb2c7e05494b013707a0a39a07aedf5d`

## Ownership and boundary

This is an additive read-only projection for the existing Runner registry,
Task Control observability read model, worker-job monitor and canonical
computer-use external-wait approval projection. SPEC-205 remains the Runner,
device and Chat ingress owner; SPEC-277 remains the Task Control projection
owner. No new task database, scheduler, approval authority, lease authority or
execution engine was added. SPEC-308 Web Mascot ownership is unchanged.

The protected route is `runnerNodes.companionState`. It binds the authenticated
tenant and user, forces owner-scoped Task Observability (`isAdmin: false`),
excludes the Cloudflare staging executor profile, and returns only bounded
allowlisted fields. Raw logs, screenshots, storage references, download URLs,
source URLs, authorization payloads and semantic state are not returned.

## Implemented projection

- `RunnerDeviceView`: pairing/trust, online/offline/stale/degraded/revoked
  connectivity, session continuity, capability freshness/expiry and platform.
- `RunnerTaskView`: canonical status plus queued/running/approval/input/
  cancellation/completed/failed/expired/unknown outcome distinctions, source-
  labeled progress, canonical attempt data when available, attention and
  output evidence IDs.
- `RunnerApprovalView`: the existing canonical job external-wait approval
  projection with request/action and bounded timestamps.
- `RunnerEvidenceView`: verified worker-output metadata only, without dereference
  material.
- `RunnerCompanionState`: one bounded owner projection with the existing
  expiring Task Control snapshot token; event continuity remains explicitly
  `not_claimed` so reconnect does not imply lossless event replay.

## Focused verification

- `runnerCompanionViewState.test.ts`: 4 tests passed.
- `runnerNodesCompanionState.test.ts`: 2 tests passed.
- Existing Runner/Task Control regression set: 4 files / 50 tests passed.
- Additional Runner projection regression set: 3 files / 9 tests passed.
- 10 focused gap reviews covered tenant isolation, canonical authority reuse,
  status semantics, progress provenance, reconnect expiry/token handling,
  sensitive-data egress, route binding, SPEC ownership, diff hygiene and
  focused regression tests. No actionable WP2A gap remained.
- Repository-wide TypeScript check was not run per repository RAM policy; CI
  remains the required full typecheck gate.

## Acceptance boundary

This evidence proves source-level projection behavior and focused mocked
read-model tests only. It does not prove Windows native behavior, Linux
headless runtime behavior, authenticated browser/mobile UAT, or real-device
Runner E2E. Those remain unverified and are separate WP2B/WP2C/WP5 gates.

The companion projection is intentionally not marked as a completed SPEC
requirement; it is a reviewable WP2A implementation checkpoint pending PR
review and protected CI.
