# Section 08 — Verification, rollout, and rollback evidence

## Scope

Close the feature with contract-focused testing, migration rehearsal, static call-site proof, canary gates, and a rollback/runbook artifact. This section does not deploy production or mutate real data.

## Verification matrix

- Unit: tenant admission, invite precedence/invalid rejection, public/account resolution, role scope, SSO PKCE/state/nonce/replay, handler registry, item states, conflict/redaction, deterministic keys.
- Database/repository: migration/backfill, concurrent signup/move/approval, durable identity audit, credit reset without ledger rewrite, preview fingerprint/idempotency conflict, one canonical job/outbox, ownership/dependency/conflict constraints, partial batch and resume/resolve.
- Feature 186/fake adapters: queued cancellation/fencing, unpublished-outbox cancellation, retained events/dispatch references, duplicate delivery/no-op redelivery, stale worker, outbox retry, ambiguous provider review, transfer reconciler skip of review-gated jobs.
- Browser: workspace badge, System Admin warning, preview/approval/monitor/pause/resume/conflicts/completion, unauthorized controls, keyboard/focus, no overflow at mobile 390x844, tablet 768x1024, desktop 1440x900, plus dense-layout extended sizes.
- Static audit: migrated protected services no longer use client/host tenant override; direct transport/provider calls remain only in adapters; intentionally legacy paths are listed.

## Commands/evidence

Use the web package from `apps/web`: `npm test`, focused Vitest paths, `npm run test:db-integration` with test database only, `npm run check`, and the relevant Playwright command. Run Feature 186 audit/verification scripts after inspecting their output contracts. Capture schema migration identity, test output, build/restart identity if used, feature flags, worker connectivity, and browser evidence separately.

## Rollout gates

Manifest `rollout-manifest.md` records owner, selected call sites/resources, schema version, handler versions, feature flags, backfill/drain rule, queue cancellation policy, canary limit, rollback flag, and evidence links. Sequence observe-only inventory → backfill dry-run → account-tenant reads → signup/OAuth → System Admin move → transfer preview → bounded same-tenant execution → resume/reconciliation → handler expansion.

Before enabling each flag, the manifest must contain numeric values for maximum
selection items, preview TTL, preview page size, transfer batch size, item
error/metadata size, operation deadline, maximum resume attempts, API/action rate
limits, database transaction/query duration, and the canary size. Empty budgets,
implicit framework defaults, or missing owner/evidence links are release
failures. The first enabled wave must use a bounded same-tenant fixture and no
paid/provider side effect.

## Failure and rollback rules

- Database failure before move/approval/batch commit leaves no partial canonical mutation; after a committed item/batch, resume from durable state.
- Transport/outbox failure pauses or retains recoverable state; never reports broker-only success.
- Storage/domain partial side effect reconciles by item settlement key.
- Active/ambiguous provider work remains blocked/operator-review; never resubmit blindly.
- Rollback disables new transfer approvals/auth changes and returns new requests to the prior safe path without restoring credits, reopening cancelled queues, deleting transferred artifacts, or rewriting terminal history.
- A failed transfer resumes the same canonical operation/job; it is never “fixed” by creating a replacement job.
- Backup/PITR restore rehearsal must replay preview approval, Feature 186
  outbox/cancellation evidence, item settlement markers, and callbacks without
  duplicating ownership, artifact, provider, notification, or credit effects.
  Record explicit RPO/RTO targets, restore point, schema/handler versions, and
  post-restore invariant counts before any production enablement.

## Final acceptance

Do not declare rollout ready until every selected job-linked terminal type is handled or explicitly reported unsupported, no financial/security/active data is transferred, queued work is killed with retained evidence, tenant isolation tests pass, System Admin move is audited/revoked, action/callback idempotency tests pass, restore rehearsal evidence exists, every enabled wave has numeric budgets and owners, and browser evidence shows the visible `ดำเนินการต่อ` recovery path.

## UI/UX Contract

### Target User / JTBD

N/A — verification and rollout; the workflows are owned by section 07.

### Existing Pattern Reference

N/A — no UI implementation is owned here; verification confirms the reuse decisions in section 07.

### Surface Inventory

N/A — evidence targets section 07 surfaces.

### Component Map

N/A — no components are owned here.

### State Matrix

N/A — state coverage is defined in section 07.

### Responsive Matrix

N/A — viewport coverage is defined in section 07.

### Accessibility Acceptance

N/A — accessibility acceptance is defined in section 07.

### Copy Contract

N/A — copy contract is defined in section 07.

### Browser Evidence Required

Link `implementation/ui-browser-evidence.md`; use the required viewports and checks from section 07.
