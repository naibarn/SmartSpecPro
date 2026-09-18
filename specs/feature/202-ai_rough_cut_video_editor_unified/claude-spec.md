# Synthesized implementation specification — Spec 202

## Objective

Make the existing Web Video Editor a unified AI Rough Cut surface that can
produce non-destructive, reviewable edit proposals and worker-rendered output
without creating a second timeline, queue, or project authority. The full
product contract remains in `spec.md`; this synthesized implementation scope
turns it into repository work that can be delivered safely against current
code.

## Normative boundaries

1. Spec 203 owns canonical time, revisions, execution snapshots, evidence,
   intent, compiler/validator, agent capability, and artifact provenance.
2. Spec 202 owns UX, tool selection, Rough Cut behavior, EDL/product intent,
   transcript/timeline review, and optional modules.
3. Active Phase 3 Web Editor is the primary surface. Legacy route data is
   converted through a versioned adapter.
4. Existing `worker_jobs` plus outbox is the only execution control plane.
5. Tenant/user authority is derived server-side; client project IDs, hostname,
   worker claims, and queue values never authorize access.
6. Unsupported capability is capability-blocked; eligible-but-unavailable is
   waiting-agent with bounded timeout/retry; a queued row alone is not success.
7. Degraded evidence is diagnostic-only and cannot be promoted into approved
   evidence, executable camera/composition plans, or production render input.

## Deliverables

- Shared canonical project/time/revision/snapshot/change-set types and runtime
  validators.
- Feature 184-backed server-authoritative project revision/CAS services and
  transactionally linked job/outbox/snapshot records.
- Web Editor adapters for load/save/autosave, legacy conversion, conflict UX,
  external updates, operation status, and render/analysis handoff.
- Evidence → Intent → Compile → Validate contracts with deterministic plan
  hashes, source/revision freshness fencing, and explicit degraded state.
- Capability-aware Node/Worker admission and truthful composition-scan route;
  native Worker work is limited to capabilities actually implemented.
- Non-destructive EDL/change-set application with undo/redo, protected ranges,
  review-required state, and artifact/QC provenance.
- Focused unit/integration/UI tests plus release-gate documentation for browser,
  Windows, deployment, and production evidence.

## Required behavior matrix

| State | Server behavior | Web behavior | Render/promotion |
|---|---|---|---|
| Fresh revision | CAS accepts expected revision | show saved | may queue snapshot |
| Stale revision | reject with conflict and current revision metadata | preserve local edits and offer reload/merge | no stale job admission |
| Unsupported capability | no unclaimable success row, or explicit blocked result | show reason/action | not executable |
| Eligible agent unavailable | queue with waiting-agent projection | show bounded wait/retry | not complete until claimed |
| Degraded evidence | persist warning/provenance | show degraded badge and review requirement | never promote by default |
| Full evidence | persist fingerprint/revision/schema | show available/reviewable evidence | can proceed after validation |
| Render completed | verify artifact/hash/library commit | show final artifact only after commit | success |

## Non-functional constraints

- No secrets or local paths in persisted contracts.
- Idempotent writes and bounded retries for all queue/asset/artifact paths.
- Backward-compatible adapters must preserve unknown legacy fields and report
  unresolved/unsupported mappings.
- All UI changes require loading/empty/error/success/disabled/focus states,
  responsive behavior, keyboard/accessibility acceptance, and browser evidence.
- No typecheck invocation under repository RAM policy.
