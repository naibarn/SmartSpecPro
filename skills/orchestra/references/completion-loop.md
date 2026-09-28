# Orchestra Completion Loop

This is the mandatory lifecycle controller for non-trivial implementation,
debugging, review/repair, and skill-system work. It prevents a blocker or
missing prerequisite from becoming a silent skip.

## Lifecycle stages

Track every stage in `orchestra/lifecycle.md` with exactly one status:

```text
Planning       PENDING | IN_PROGRESS | COMPLETE | NOT_APPLICABLE | BLOCKED
TDD/Test Design PENDING | IN_PROGRESS | COMPLETE | NOT_APPLICABLE | BLOCKED
Implement      PENDING | IN_PROGRESS | COMPLETE | NOT_APPLICABLE | BLOCKED
Verify         PENDING | IN_PROGRESS | COMPLETE | NOT_APPLICABLE | BLOCKED
Debug/Fix      PENDING | IN_PROGRESS | COMPLETE | NOT_APPLICABLE | BLOCKED
Review         PENDING | IN_PROGRESS | COMPLETE | NOT_APPLICABLE | BLOCKED
Final Verify   PENDING | IN_PROGRESS | COMPLETE | NOT_APPLICABLE | BLOCKED
```

For behavior-changing work, all seven stages are mandatory. A clean run still
closes `Debug/Fix` with `result: no_gap_found` and evidence. Only documentation-
only, purely visual, or genuinely trivial work may use `NOT_APPLICABLE`, and it
must include a reason and proof boundary. `NOT_APPLICABLE` is not an omitted
stage.

## Required lifecycle artifact

Initialize `orchestra/lifecycle.md` before implementation:

```text
# Orchestra Lifecycle

Goal: <one sentence>
Scope/risk: <scope>/<risk>
Current stage: PLANNING
Resume from: PLANNING
Stop reason: active
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: IN_PROGRESS
    entry_evidence: <artifact/path>
    exit_evidence: <artifact/path or command>
    attempt: 1
    stale: false
    next_action: <exact action>
  - stage: TDD_DESIGN
    status: PENDING
  - stage: IMPLEMENT
    status: PENDING
  - stage: VERIFY
    status: PENDING
  - stage: DEBUG_FIX
    status: PENDING
  - stage: REVIEW
    status: PENDING
  - stage: FINAL_VERIFY
    status: PENDING

Gap ledger:
  - gap_id: none

Completion invariants:
  all_mandatory_stages_closed: false
  no_open_must_do_gap: true
  no_stale_required_gate: true
  review_converged: false
  final_verify_fresh: false
```

`orchestra/progress.md` remains the compact loop counter. It must reference the
current lifecycle stage and `resume_from`; do not duplicate the full gap ledger
there.

## Gap schema

Every blocker, failed gate, missing artifact, review finding, or newly exposed
requirement becomes a gap row before any stage transition:

```text
gap_id: GAP-<n>
discovered_at_stage: <stage>
earliest_affected_stage: <stage>
classification: MUST_FIX | MUST_DO_NOW | VERIFY_ONLY | DEFER_OPTIONAL | BLOCKED
severity: LOW | MEDIUM | HIGH | CRITICAL
condition: <observable missing condition>
evidence: <command/artifact/log/test/review finding>
owner: <conductor or role>
action: <specific repair or proof action>
attempts: <n>/<limit>
stale_gates: [<gate>, ...]
status: OPEN | IN_PROGRESS | FIXED | VERIFIED | DEFERRED | BLOCKED
resume_from: <stage>
residual_risk: <none or concise risk>
```

Do not put an open `MUST_FIX`, `MUST_DO_NOW`, or `VERIFY_ONLY` gap only in
`backlog.md`. Backlog is a pointer after the lifecycle row exists, never a
closure mechanism.

## Transition rules

```text
PLANNING -> TDD_DESIGN
TDD_DESIGN -> IMPLEMENT
IMPLEMENT -> VERIFY
VERIFY -> DEBUG_FIX       when verification fails, evidence is missing, or a gap appears
VERIFY -> REVIEW          only with fresh clean verification
DEBUG_FIX -> VERIFY       after a repair or new proof
DEBUG_FIX -> BLOCKED      when safe repair is impossible
REVIEW -> TDD_DESIGN      when coverage/test-design is incomplete
REVIEW -> IMPLEMENT       when code/contract/requirement is incomplete
REVIEW -> VERIFY          when only evidence/gates are stale or missing
REVIEW -> DEBUG_FIX       when a defect/root-cause issue is found
REVIEW -> FINAL_VERIFY    only with no material findings
FINAL_VERIFY -> <earliest affected stage> when any invariant becomes false
FINAL_VERIFY -> COMPLETE  only when every completion invariant is true
```

The conductor must backtrack to the earliest affected stage, not merely the
stage that reported the symptom. Example: a review finds a missing negative
test, so the target is `TDD_DESIGN`, not `REVIEW` or `FINAL_VERIFY`.

## Stage-exit audit

Before advancing, record:

1. entry artifact and current status;
2. exact output/evidence proving the stage's acceptance criteria;
3. open gaps and their earliest affected stage;
4. downstream gates made stale by changes;
5. next stage and exact next action.

If any required item is missing, keep the stage `IN_PROGRESS`, create a gap,
and run recovery. Never mark a stage `COMPLETE` because the next stage is
blocked.

## Recovery algorithm

After every gate, agent result, deep-* artifact check, review round, or final
verification:

1. Reconcile the lifecycle ledger against files, commands, and evidence.
2. Create/update gaps for every missing or contradictory item.
3. Classify each gap. Safe in-scope `MUST_FIX`/`MUST_DO_NOW` work is automatic.
4. Set `resume_from` to the earliest affected stage.
5. Mark the affected stage and every downstream evidence-dependent stage stale.
6. Repair the gap, then rerun the stage and all stale gates in dependency order.
7. Repeat until the completion invariants pass or a typed stop condition occurs.

If a gate reaches its retry limit, that is a recovery event, not a successful
stage exit. Create a gap and continue through the recovery algorithm. Only a
loop-policy limit, missing external state, product decision, destructive risk,
critical security finding, or unresolved user-required blocker may stop the
loop; the stop record must retain open gaps, `resume_from`, and residual risk.

## No-skip completion rule

The final response is forbidden while any of these is true:

- a mandatory stage is `PENDING`, `IN_PROGRESS`, or `BLOCKED`;
- a gap is open, stale, or lacks a next action;
- a required gate is stale or has only a resource/session failure status;
- the last repair was not followed by the affected verification and review;
- `resume_from` is not the current active stage.

When stopped, report `implemented_but_blocked` or `implemented_with_deferred_gap`,
never `complete`, and include the exact resume stage and smallest next action.
