# Vertical Drama Story-Control QC Hardening

## Goal

Prevent a Draft from reaching or passing QC with a structurally contradictory
story-control plane, while preserving creator-authored narrative content and
legacy compatibility.

## Design

1. Add a pure shared consistency inspection for `storyDesign` against the
   approved `storyContract`/Story Architecture. It reports stable paths for:
   duplicate control records, placeholder text, romance/pressure windows that
   contradict an authoritative arc window, and drift between the visible design
   and `storyControlSeed` mirrors.
2. Run this inspection through the existing Draft completeness gate. The result
   remains fail-closed: no score is fabricated and a critical failure blocks
   creation even when the numeric score is high.
3. Extend the additive last-mile repair to reconcile only control-plane facts
   from the approved architecture. It keeps existing prose, preserves removed
   source values in legacy metadata when a placeholder must be replaced, and
   updates seed mirrors from the repaired visible design.
4. Make QC revision prompts explicitly prioritize `criticalFails` even when
   every numeric criterion is above 3/5. The LLM remains the only creative
   writer; deterministic code owns identity, ranges, duplication, and
   placeholder gates.
5. Keep provider/model fallback disabled and expose failure origin/path data in
   the existing report without changing the public pass threshold.

## Failure handling

- Invalid or contradictory control data: same-model bounded revision, then a
  clear blocked result with paths and repair instructions.
- Missing/legacy story-control fields: existing architecture-derived additive
  repair supplies only missing control facts.
- LLM output omission: existing strict schema/retry contract remains active.
- No destructive array replacement: merges retain unrelated fields and
  preserve replaced placeholder text as legacy metadata.

## Verification

- Unit tests for each consistency rule and repair behavior.
- QC loop tests proving critical failures are included in revision prompts.
- Existing Draft completion, Story Design, QC job, and UI regression suites.
- Production web/widget build, focused type diagnostics, service health check.
