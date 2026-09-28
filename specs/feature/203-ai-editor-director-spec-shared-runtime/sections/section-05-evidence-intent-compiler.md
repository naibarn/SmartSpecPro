# Section 05 — Evidence, intent, compiler, and safety validator

## Objective

Provide pure, deterministic server-side boundaries from evidence to an
executable non-destructive plan. Model/skill output is untrusted and never
becomes executable without validation.

## Files and ownership

- Add `apps/web/server/services/editorialEvidenceService.ts`.
- Add `apps/web/server/services/editorialIntentService.ts`.
- Add `apps/web/server/services/editorialCompiler.ts`.
- Add `apps/web/server/services/editorialSafetyValidator.ts`.
- Add golden fixtures/tests.

## Behavior

- Bind evidence to snapshot/revision/source; reject stale, invalid, or degraded
  evidence for executable promotion.
- Validate intent operations, ranges, crop/zoom/audio limits, protected ranges,
  confidence thresholds, and untrusted text boundaries.
- Compiler output is deterministic for identical snapshot/evidence/intent/policy
  and contains planHash and validation obligations.
- Preserve unsupported metadata as blocked suggestions; never execute it.
- Validate timeline continuity, linked A/V, safe geometry, timebase, and change
  set conflict semantics.

## TDD and acceptance

Golden deterministic plan, stale/degraded rejection, unsafe crop/zoom/timing,
protected ranges, linked A/V, conflict resolution, and metadata preservation
tests must pass before any UI applies an AI result.

## UI/UX Contract

### Target User / JTBD
Editor needs to inspect evidence and safely review an AI proposal.

### Surface Inventory
Evidence inspector, confidence/provenance panel, change-set review, blocked
operation explanation.

### Component Map
Services own schemas and plans; Web inspector renders evidence; review panel
owns apply/reject.

### State Matrix
Pending, available, degraded/review-required, stale, invalid, blocked, selected,
applied, rejected, and loading.

### Responsive Matrix
Mobile evidence summary; tablet split inspector; laptop/desktop full provenance
and before/after view.

### Accessibility Acceptance
Semantic evidence labels, keyboard review actions, live validation errors,
contrast, and no color-only confidence meaning.

### Copy Contract
Show source, revision, confidence, and warning in Thai-first copy with English
fallback; never label degraded as approved.

### Browser Evidence Required
Authenticated evidence review for available, degraded, stale, invalid, and
blocked proposals.
