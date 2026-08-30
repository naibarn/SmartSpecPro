# Section Cross-Consistency Review — Round 1

## Result

All 8 section files are present and validated by `check-sections.py`. The UI
contract checker passes after adding explicit N/A contracts to non-UI sections.

## Interface alignment

- Section 01 owns the versioned policy and evidence DTOs consumed by sections
  02–06.
- Section 02 produces normalized metric/workload/storage evidence consumed by
  sections 03 and 04.
- Section 03 owns deterministic status/action/forecast values consumed by the
  skill and UI; section 04 cannot override them.
- Section 05 owns run lifecycle/API behavior; section 06 only renders its DTO.
- Section 08 consumes proof requirements from all prior sections.

## Coverage and overlap

Every major plan component has one owning section. No section creates the same
runtime component as another. Migration/policy precede collector and decision;
decision/skill precede guarded execution; UI waits for the final DTO/lifecycle.

## Resolved consistency issue

The section index originally allowed the skill section to run too early. It now
states that the skill runtime contract depends on deterministic decision fields,
while schema/fixture-only work may be prepared earlier without merging runtime
assumptions.
