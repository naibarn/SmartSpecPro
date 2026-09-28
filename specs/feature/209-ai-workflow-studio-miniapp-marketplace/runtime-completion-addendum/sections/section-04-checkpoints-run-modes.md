# Section 04 — Checkpoints and run modes

## Objective

Implement `full`, `run_until`, `run_from`, `run_node` and `run_subflow` without
changing Workflow Version identity or rerunning valid paid work silently.

## Dependencies and ownership

- Depends on Sections 01 and 03.
- Owns mode validation, checkpoint creation/verification and plan slicing.
- Reuses canonical Job checkpoint recovery and does not own Job finality.

## Planned changes

1. Validate selected node/subflow and target eligibility against the compiled
   graph and typed bindings.
2. Persist checkpoint metadata only after canonical evidence proves node output
   completion. Include version hash, graph revision, input fingerprint,
   completed nodes, result/artifact references and digest.
3. Validate tenant/version/fingerprint/dependency/revision on run-from/resume.
4. Reuse valid upstream results by default; explicit rerun becomes a visible,
   policy-checked decision.
5. Represent run-until as durable partial state that can resume, not success.
6. Preserve parent run and nested scope for subflow/node execution.

## Mode contract

The accepted mode enum is `full`, `run_until`, `run_from`, `run_node` or
`run_subflow`. `run_until` requires an eligible target node; `run_from` and
resume require a version/input-bound checkpoint; node/subflow modes require
server-validated graph scope and typed bindings. The normalized mode and target
scope are included in the immutable plan revision and run projection.

## TDD-first verification

- All five modes compile expected bounded plans.
- Checkpoint digest/version/input mismatch and cross-tenant access fail.
- Valid upstream reuse and explicit rerun are recorded.
- Run-until partial state resumes; stale/missing target is rejected.
- Checkpoint recovery maps to canonical control-plane semantics.

## Acceptance

Partial runs survive browser refresh and can resume from an exact checkpoint.
No resume can run a different version or silently duplicate upstream effects.

## UI/UX Contract

### Target User / JTBD

Creators and operators need to select a safe run mode, understand checkpoint
eligibility and resume or rerun work without guessing which nodes will execute.

### Surface Inventory

- Existing Run mode selector in the mockup-aligned Run panel.
- Existing Subflow/Binding surface for node and subflow scope.
- Existing checkpoint summary and Debug Drawer timeline.

### Component Map

- Reuse current Run panel, graph node selection, inspector, status badge and
  Debug Drawer patterns.
- Add a typed mode selector, target-node/subflow selector, checkpoint summary
  and explicit upstream-reuse/rerun choice; do not add a new screen layout.

### State Matrix

| State | Required UI | User action |
|---|---|---|
| full | Whole graph and input summary | Start full run |
| run-until | Target node and partial-result warning | Start bounded run |
| run-from | Eligible checkpoint and reused nodes | Resume from checkpoint |
| run-node/run-subflow | Validated scope and binding summary | Run selected scope |
| stale/invalid | Reason code and affected target | Select a valid target/checkpoint |

### Responsive Matrix

Keep mode and checkpoint controls reachable at 390x844, 768x1024, 1280x800 and
1440x900. On mobile, scope and checkpoint details stack above the primary action;
the selected node and partial-state warning remain visible without overflow.

### Accessibility Acceptance

Use labelled radio/select controls, announce mode and checkpoint validation,
preserve focus after an invalid target, expose reused/rerun behavior as text,
and do not rely on graph color or animation to explain execution scope.

### Copy Contract

Use “รันทั้ง Workflow”, “รันจนถึง node นี้”, “ดำเนินการต่อจาก checkpoint”,
“รันเฉพาะส่วนที่เลือก”, “จะใช้ผลลัพธ์เดิม” and “checkpoint ใช้ไม่ได้แล้ว”;
never imply full completion for a run-until result.

### Browser Evidence Required

Capture Dashboard → Workflow Studio → Run mode flows for all five modes plus
stale-checkpoint rejection at 390x844, 768x1024 and 1440x900, including refresh
and resume evidence.
