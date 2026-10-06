# TDD Plan

## Contracts and persistence

- Projection capability booleans round-trip and cannot be client-supplied.
- Access precedence tests cover owner, group, tenant policy, hidden Series, and
  unresolved private Worker.
- Binding metadata, active uniqueness, pinned job foreign key, revision, and
  additive migration invariants pass with legacy rows unchanged.
- Workflow policy resolver covers default, locked, user override, fallback,
  incompatible capability, stale policy/probe, audit, and rollback.

## Shot dispatch and publication

- Valid start/reference frame payload admits one idempotent job.
- Missing/duplicate/out-of-order frames, stale shot/binding, revoked root,
  forbidden workflow, and mismatched tenant fail closed.
- Replays return the original job; publication requires checksum/QC/artifact
  ownership and creates an indexed Series asset once.

## Native MCP and media analysis

- MCP supports current/stateless and legacy initialize negotiation.
- Invalid/missing tool schema, missing workflow capability, schema mismatch,
  invalid output, timeout, cancel, and restart reconciliation are rejected or
  recovered deterministically.
- Manifest analysis emits bounded probe, silence, visual-quality, scene, and
  subject candidate records without source mutation.
- Batch plans are deterministic, bounded, and preserve ready outputs.

## Web storyboard and Worker UI

- Shot Inspector renders policy/resolution/frame/status state matrix and calls
  the real shot dispatch mutation.
- Existing provider video action remains available and distinct.
- Sidebar routes render canonical screens; aliases resolve; no duplicate worker
  loops start while navigating.
- Keyboard/focus/reduced-motion/responsive state tests cover changed surfaces.

## Integration gates

- Web and Worker typecheck, focused Vitest, Rust tests, journal/diff checks.
- Browser route tests for storyboard and Worker screens when test harness is
  available; otherwise record explicit evidence gap.
