# Section 06 — Rollout, observability, and recovery

## Goal

Make optional Stop support diagnosable and reversible without deleting user
assets or changing start-only production behavior.

## Owned files

- existing `apps/web/shared/featureFlags.ts`/feature-flag tests only if the
  existing bridge flag needs a contract assertion
- existing Vertical Drama telemetry/recovery service boundary discovered during
  implementation
- rollout/recovery documentation and focused tests

## Rollout contract

## Implementation status

Complete. Existing first/last-frame bridge gating is reused; Stop generation
is opt-in, no automatic backfill is performed, and stale/failed states remain
visible for recovery.

Reuse `verticalDramaSeriesFirstLastFrameBridge` for provider attachment and
bridge-mode admission. Do not add a new flag or migration. Stop prompt/image
controls remain available regardless of the bridge flag so a creator can
prepare/select a frame without an unwanted provider charge.

Emit bounded metadata only: role, source/pair revision, prompt hashes,
skill/model version, job/task ID, credit transaction, capability decision, and
final asset ID. Never emit raw prompts, provider URLs, secrets, or full LLM
context. Track prompt generated, image submitted/completed, unsupported-unused,
stale, CAS rejection, and sync failure.

Recovery distinguishes prompt, admission, provider, import/sync, and shot-link
failures. Reconciliation is idempotent. Rollback disables future stop
attachment and hides only attachment-specific UI where appropriate; it does
not delete stop prompt/image records and never invalidates start-only readiness.

## Test-first stubs

Flag default/attachment gating, bounded telemetry redaction, failure taxonomy,
idempotent reconciliation, and rollback preservation of stored stop state.

## Dependencies and outputs

Consumes Sections 02–05 and closes the implementation with rollout evidence,
recovery notes, and known unverified boundaries.

## UI/UX Contract

### Target User / JTBD

No new creator surface is owned here; rollback must preserve understandable
start-only editing while controlling provider attachment.

### Surface Inventory

Only existing capability/attachment notices and rollout documentation are
affected; Section 04 owns layout and controls.

### Component Map

No new components. Consume existing feature flag and status-notice primitives.

### State Matrix

Bridge on: eligible start+stop attachment. Bridge off/unsupported: start-only
attachment with an explicit notice; stored stop data remains inspectable.

### Responsive Matrix

Not applicable; no new layout.

### Accessibility Acceptance

Capability and rollback notices must be text, localized by the UI owner, and not
communicated only through color or icons.

### Copy Contract

Use stable reason codes and existing Thai/English localization conventions.

### Browser Evidence Required

Section 05 records any browser evidence; rollout-only claims must not be marked
verified without an authenticated check.
