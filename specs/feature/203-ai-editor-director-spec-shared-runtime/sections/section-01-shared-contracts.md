# Section 01 — Shared canonical contracts and validators

## Objective

Add versioned shared TypeScript contracts for canonical time, evidence, intent,
executable plans, change sets, QC, artifacts, and capability state. Extend the
existing `packages/shared/src/video-editor` boundary without breaking the v1
media envelope.

## Files and ownership

- Add `packages/shared/src/video-editor/canonicalTime.ts`.
- Add `packages/shared/src/video-editor/editorialContracts.ts`.
- Update the existing video-editor export barrel only as needed.
- Add fixtures and focused tests under `apps/web/shared/` and/or the existing
  package fixture boundary.

## Contract details

- Canonical time contains `timebase.num`, `timebase.den`, integer ticks, and
  explicit source/absolute/trimmed domains. Legacy millisecond values are
  accepted only by named adapters.
- Evidence includes schema/version, tenant/project/revision/snapshot binding,
  source fingerprint, status, confidence, provenance, evidence references, and
  deterministic hash.
- Intent includes policy/profile, ordered operations, protected-range intent,
  review requirement, and source evidence references.
- Executable plans include ordered allowlisted operations, dependencies,
  planHash, source/revision/snapshot binding, validator obligations, and output
  roles. Unknown operations are preserved as blocked metadata, not executed.
- Change sets are idempotent, non-destructive, revision-bound, and include
  inverse/undo metadata where safe.

## Tests before implementation

Write tests for time round-trip and invalid time; tenant/revision mismatch;
unknown unsafe fields; hash stability; DAG cycles; unsupported operations;
degraded evidence; protected ranges; and duplicate change-set application.

## Acceptance

Existing `videoEditorContracts.test.ts` remains green. New validators have
stable error codes, no local path/secret acceptance, and no second job or
project namespace.

## UI/UX Contract

### Target User / JTBD
N/A — pure shared validation; downstream editor surfaces consume its states.

### Surface Inventory
N/A — no direct browser surface.

### Component Map
N/A — owned by shared package validators.

### State Matrix
Downstream contract states: valid, invalid, stale, degraded, blocked.

### Responsive Matrix
N/A — no direct layout.

### Accessibility Acceptance
Downstream surfaces must expose validator errors as semantic, actionable text.

### Copy Contract
Stable error codes are translated by the consuming Web surface, Thai-first
with English fallback.

### Browser Evidence Required
N/A for this section; verify via downstream browser state evidence.
