# SPEC-256 duplicate canonical ID blocker — 2026-10-30

Observed at source `aaed89a5e4bb0235232ddb7a5c88839c5013e234`.

The dynamic Spec inventory finds two non-identical canonical-root `spec.md` records carrying Spec ID `256`:

- `specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md`
- `specs/feature/256-skill-first-capability-discovery-intent-execution/specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md`

The handoff classification tool marks both `UNRESOLVED_AUTHORITY` and fails its passing classification gate. The generated classification artifact predates this conflict and is stale. The tool does not generate a new passing artifact while the conflict remains. No document was renamed, deleted, or selected as authoritative because the two normative files differ and the repository contains no explicit disposition deciding which is canonical.

The duplicate-conflict counter now counts the conflicting Spec ID once, while both inventory records remain visible. The Spec Handoff test suite passes 86/86 and explicitly asserts that this authority conflict remains surfaced.

**Required resolution:** reconcile the nested SPEC-256 file against the parent canonical Spec and record a sourced disposition (for example, supporting draft/evidence or a separately assigned canonical ID); then regenerate and validate `specs/_status/reconciliation-classifications.json`.
