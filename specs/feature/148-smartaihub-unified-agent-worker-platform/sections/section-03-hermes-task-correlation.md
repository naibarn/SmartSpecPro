# Section 03 — Hermes Parent Task and Typed Child Correlation

## Goal

Send a SmartAIHub conversation task to an approved Hermes device using the
existing `external_agent_task` lane, while representing media/render work as
typed child worker jobs.

## Ownership

Modify shared worker contract types, `queueHermesWorkerJob`, external connector
dispatch/projection, and focused tests. First inspect existing conversation,
team-run, worker-job, event, and artifact authorities. Do not create a second
Hermes queue, chat authority, media table, or credential lineage.

## Contract

Add a bounded versioned correlation object with tenant/user, conversation/message,
target device, operation/schema, approval, reservation, expiry, parent/child
ids, enum state, and safe summary. Store it first in bounded existing job
metadata/instructions. Add a migration only if existing authorities cannot
query/recover it; any migration must be tenant-safe, indexed, and reversible.

The parent remains `external_agent_task` and must pass existing feature flag,
preferred worker, capability, readiness, lease, idempotency, and billing checks.
Child operations call the existing typed scheduler for ComfyUI, Remotion,
FFmpeg, or Local AI. No arbitrary shell, path, provider URL, raw prompt blob,
token, or binary may enter the relay envelope/event.

Use existing claim/heartbeat/event/artifact endpoints before adding a network
transport. Polling/cursor fallback must be at-least-once with idempotent state
transitions. Parent completion waits for required child publication.

## Tests-first requirements

- Schema rejects oversized values, secrets, paths, URLs, binary, and unknown
  states.
- Existing Hermes scheduler tests retain all rollout/readiness failures.
- Duplicate parent/child idempotency does not double-create or double-charge.
- Child type selection cannot escape registered scheduler families.
- Parent progress, partial result, pending publication, cancel, expiry, lease
  recovery, reconnect, and revoke transitions are durable and idempotent.
- Existing `runEngine.ts` external-connector dispatch remains compatible.

## Acceptance evidence

One conversation request maps to one parent lineage and bounded typed children;
browser close or device reconnect does not lose work; result projection contains
only ACL-backed artifact references and bounded summaries.

## UI/UX Contract

### Target User / JTBD

User asks SmartAIHub chat to run work on a named Hermes device and understands
progress/recovery without seeing internal ids.

### Surface Inventory

Chat task message, task detail/status projection, device selector, approval
dialog, child-job/artifact result cards.

### Component Map

Reuse existing chat/work-status/task components; this section owns only the
typed status projection and correlation fields, not a new chat surface.

### State Matrix

Draft, approval required, queued, offered, accepted, running, awaiting input,
uploading, publishing, completed, partial, failed, canceled, expired, offline,
and pending publication.

### Responsive Matrix

Status timeline collapses to a vertical list on mobile/tablet and expands to
parent/child detail columns on desktop.

### Accessibility Acceptance

Status changes are announced, action buttons are labelled, approval/cancel are
keyboard reachable, and errors include text next actions rather than color only.

### Copy Contract

Thai/English copy explains device, task, job, artifact, quota, and recovery;
opaque ids appear only in advanced details.

### Browser Evidence Required

Verify send, approval, progress, browser close/reopen, reconnect, cancel, and
result cards in a production-like browser when relay UI exists.

## Implementation status

Implemented bounded, secret/path/URL-free `HermesTaskCorrelation` validation,
tenant/user checks, and persistence in the existing worker job instruction
contract. Full chat task projection and real Hermes child-job execution remain
dependent on the relay UI/agent runtime gate.
