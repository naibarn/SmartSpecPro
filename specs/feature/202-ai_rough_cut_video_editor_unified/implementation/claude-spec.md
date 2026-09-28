# Synthesized UI/UX Improvement Specification

## Outcome

The active SmartSpecPro Web Video Editor must present a coherent, accessible,
responsive client of the canonical Spec 202/203 project and execution model.
Users must be able to edit, save, recover, submit, inspect, review, and resolve
work without guessing whether a state is local, persisted, queued, blocked,
degraded, rendered, or committed.

## Requirements

### R1 — Shared UI foundation

Use existing Radix UI primitives for dialog, alert dialog, sheet/drawer, tabs,
button, badge, alert, progress, and command surfaces. Establish shared editor
state components for status, error mapping, live announcements, focus return,
keyboard dismissal, and safe copy. Do not duplicate ad-hoc overlay semantics.

### R2 — Project/revision UX

Expose saved, saving, autosaving, unsaved, offline/retry, external update,
stale, conflict, and recovered states. A conflict must preserve the local draft,
show base/current revision identity, and expose only server-supported actions:
reload current, keep mine/retry against latest when allowed, merge when the
server indicates it is safe, or duplicate as a variant. Focus must return to the
triggering control or a clearly announced resolution action.

### R3 — Execution/status UX

The editor and job page must project admitted, duplicate, waiting-agent,
capability-blocked, claimed, running, retrying, degraded, rendering,
uploading, QC, completed, failed, canceled, expired, and stale states. Each
non-terminal state needs a reason, source/runtime/agent context when available,
and safe actions such as cancel, retry, review, open editor, or inspect output.
Queue admission is not completion.

### R4 — AI/editor review UX

Expose scope selection and the analysis → suggestion/draft → preview → apply →
render boundaries. Provide transcript/source anchors, change-set identity,
before/after or A/B review, evidence/confidence/lock inspection, selected
apply/reject/revert/regenerate, and warning severity. Manual locks and protected
operations must remain visible and untouched.

### R5 — Responsive and visual UX

Use a dedicated tablet navigation model rather than squeezing desktop's
multi-panel layout. Mobile uses a managed sheet with focus trap, Escape, focus
return, backdrop semantics, and reachable primary actions. Controls have touch
targets of at least 44px where practical. Use existing design tokens/components,
Thai-first copy, safe fallback errors, readable dark surfaces, and reduced-motion
behavior.

### R6 — Verification and rollout

Add focused UI integration tests and current authenticated browser evidence.
Required viewports: mobile 390x844, tablet 768x1024, desktop 1440x900.
Extended viewports: 360x800, 1024x768, 1280x800. Evidence must cover route
loading/loaded/empty/error, dirty/save/conflict, modal and sheet keyboard paths,
job status/capability/QC, focus, labels, overflow, console, and reduced motion.

## Non-goals

- Replacing canonical server revision/CAS or worker control-plane behavior.
- Creating a second editor/runtime/project database.
- Restoring retired workflow, workpacks, Agency, OpenSandbox, or Docker paths.
- Redesigning the legacy rollback editor except for shared compatibility needs.
- Claiming Windows Worker, deployment, provider, or production parity without
  target evidence.
