# Section 04 — Capability admission and lifecycle

## Objective

Expose exact executor capability, locality, lease, retry, cancellation, and
status semantics to server and Web surfaces.

## Files and ownership

- Add `apps/web/server/services/videoEditorCapabilityAdmission.ts` or extend the
  existing scheduler service without duplicating policy.
- Extend editor media projection/status types and focused tests.
- Update Worker capability constants only for genuinely implemented operations.

## Behavior

- Match exact operation claim token, contract version, locality, resource
  profile, and tenant policy.
- No eligible executor returns machine state `capability_blocked` with reason
  and route hint; the Web label is “capability-blocked”.
- Eligible capability but no available agent returns machine state
  `waiting_agent` with
  bounded timeout/retry metadata.
- Lease loss, cancellation, expiration, and retry use the canonical status
  transition table and are idempotent.
- Job completion with evidence `degraded` remains non-promotable.

## TDD and acceptance

Test exact token mismatch, unsupported operation, temporary offline agent,
lease expiry, cancellation race, retry budget, terminal transitions, status
projection, and degraded evidence. Do not add a generic “claim everything”
capability.

## UI/UX Contract

### Target User / JTBD
Editor needs truthful progress and a clear next action when an agent is absent.

### Surface Inventory
Job status panel, worker/agent indicator, retry/cancel controls, degraded badge.

### Component Map
Capability service owns state; status projection owns labels; Web job panel
owns interaction.

### State Matrix
Queued, waiting-agent, capability-blocked, claimed, running, retrying,
canceled, expired, failed, degraded, completed.

### Responsive Matrix
Mobile compact status/action; tablet/laptop expanded reason; desktop capability
details and timing.

### Accessibility Acceptance
Live progress, non-color severity, keyboard cancel/retry, visible focus, and
screen-reader-readable reason.

### Copy Contract
Distinguish “รอ Worker” from “ความสามารถไม่พร้อม” and from “หลักฐานเสื่อม
คุณภาพ”; English fallback retains the distinction.

### Browser Evidence Required
Capture blocked, waiting, running, degraded, canceled, and completed states.
