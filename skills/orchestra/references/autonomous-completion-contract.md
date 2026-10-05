# Autonomous Completion & Gap-Closure Contract

Orchestra owns the user's intended outcome and its safe closure, not just the
assigned task list. A blocker is an input to a new reasoning pass. It is not a
terminal state by itself.

## Requirement ledger

For a spec- or acceptance-driven task, derive the Definition of Done from the
current authoritative source. Resolve duplicate/stale versions, extract
normative requirements, then maintain one row per requirement with:

```text
requirement_id, authority_source, applicability, implementation_status,
verification_method, evidence, blocker, next_action, final_state
```

`final_state` is exactly `PASS`, `FAIL`, `BLOCKED_TRUE_EXTERNAL`, or
`NOT_APPLICABLE`. `PARTIAL` is an intermediate implementation status and must
always carry a concrete `next_action`. Every `PASS` has a fresh evidence pointer.
`implemented` is not evidence of `verified`; integration, deployment,
production acceptance, and completion are separate claims.

Canonical row shape:

```json
{
  "requirement_id": "REQ-001",
  "authority_source": {"path": "spec.md", "section": "Acceptance / item 1"},
  "applicability": "APPLICABLE",
  "implementation_status": "PARTIAL",
  "verification_method": "focused test",
  "evidence": [],
  "blocker": null,
  "next_action": "implement missing boundary case",
  "final_state": null
}
```

## Mandatory blocker challenge

Before stopping on a gap, record the symptom and root cause, then assess in order:

1. Is the gap actually required by the Definition of Done, or optional/stale/
   unrelated?
2. Can the source, config, test, skill, or process be repaired directly?
3. Can a compatible implementation, provider, asset, component, or path be
   substituted?
4. Can an unsupported claim or unprovable optional scope be removed, downgraded,
   or isolated while the core requirement proceeds?
5. Can the missing evidence be generated with a focused test, browser capture,
   log, API/DB assertion, hash, or static check?
6. Can recovery use a verified backup, rollback, retry, smaller check, CI, or
   another available tool/runner?
7. Is a project-local policy the cause? If so, repair it with a general rule
   that preserves real security and data boundaries.
8. Is there an independent ready WorkUnit to continue while an external
   dependency waits?

Record attempted strategies and why each failed. A safe strategy must not be
repeated unchanged after it produces no measurable delta.

## Decision classes

- `FIX_NOW`: safe, in-scope implementation or test repair; do it.
- `VERIFY_NOW`: evidence can be generated safely; generate it.
- `REPLAN`: change the approach or dependency order.
- `SUBSTITUTE`: use a compatible alternative and verify its contract.
- `DEFER_INDEPENDENT`: track a real wait with a predicate while continuing
  other ready work.
- `BASELINE_UNRELATED`: establish non-regression and isolate unrelated debt.
- `TRUE_BLOCKER`: only after all safe closure paths are exhausted and evidenced.

## Authority ladder

- Class A, execute automatically: ordinary source/tests/docs/config changes,
  contract-preserving refactors, safe fallbacks, observability, evidence
  generation, and general project-local policy repairs.
- Class B, execute with backup/evidence: risky rewrites, stored-state changes
  with proven backup/rollback, reversible production configuration, or provider
  replacement under a stable contract. Follow repository migration/deploy
  gates and record the recovery evidence.
- Class C, human authority required: only a true blocker involving external
  irreversible loss without recovery, genuine product choice, critical
  security acceptance, unavailable required credential/legal approval, or a
  platform restriction with no alternative. State the exact authority the
  conductor lacks.

Execution authority is not final acceptance authority. Automatically
implementing or integrating a change does not waive a spec-required acceptance,
security, production, or deployment gate.

Failure classification is explicit: `TASK_REGRESSION`, `BASELINE_FAILURE`,
`ENVIRONMENT_FAILURE`, `RESOURCE_BLOCKED`, `TOOL_CAPABILITY_MISSING`,
`EXTERNAL_DEPENDENCY`, `POLICY_BLOCKED`, `PRODUCT_AMBIGUITY`, or
`SECURITY_BLOCKED`. Each class selects a recovery action; resource failures
queue/reschedule or use smaller checks, and baseline failures require
non-regression proof rather than unrelated repair.

## True blocker boundary

Terminal stops are limited to a genuine authority or safety boundary, such as
irreversible external destruction without reliable recovery, missing external
credentials with no compatible fallback, unresolved product outcomes the
repository/spec cannot decide, critical security findings, mandatory legal
approval with no allowed substitute, or a platform limitation with no
alternative execution path. Name the authority that is missing and why the
conductor cannot exercise it.

Tests failing, ordinary compile/type errors, merge conflicts, stale checkouts,
another session's unrelated dirty files, missing generated evidence, missing
assets/claims with safe replacements, unnamed owners, resource queues, or
project-local policy restrictions are not terminal blockers by themselves.

## Progress and stall control

Each closure iteration records a progress delta: unresolved requirement count,
blocker state, implementation/evidence change, verification state, and new
canonical checkpoint. If the same blocker appears twice, run the complete
challenge above and enumerate at least two alternatives where feasible. At
three repeats without meaningful delta, mark `STALLED_STRATEGY`, prohibit the
failed strategy, and route to root-cause/architecture/policy review. A further
iteration must change strategy or produce evidence; repeating a checklist is
not progress.

## WorkUnit waits and resume

Represent independent work as a DAG. Every WorkUnit records `id`, owner,
scope/paths, prerequisites, completion predicate, waiting predicate,
reactivation predicate, and independent next work. `WAITING_*` is valid only
with a machine-checkable predicate and a reactivation condition. On every wait,
select another ready WorkUnit if one exists. Resume reconciles current
canonical state, verifies the recorded evidence freshness, retains attempted
and prohibited strategies, and starts at the exact next ready action.

Canonical WorkUnit shape:

```json
{
  "id": "WU-01",
  "owner": "conductor",
  "scope": ["path/to/owned/files"],
  "prerequisites": [],
  "status": "READY",
  "completion_predicate": {"kind": "evidence_exists", "locator": "evidence/test.log"},
  "completion_evidence": [],
  "canonical_sha": "<integrated-sha-or-null>",
  "waiting_predicate": null,
  "reactivation_predicate": null,
  "independent_next_work": ["WU-02"]
}
```

For a wait, replace null predicates with an authority-backed condition, such as
`{"kind":"resource_available","profile":"package","source":"admission gate"}`,
and a reactivation condition that re-evaluates it against fresh evidence from a
registered predicate adapter. A completed prerequisite is valid only when its
completion evidence is present, fresh, and bound to the reconciled canonical
SHA; a list of completed IDs alone never satisfies a dependency.

## Completion

Continue until every applicable normative requirement is `PASS`, or has an
explicit disposition allowed by its authority. Before `COMPLETE`, require
fresh required verification evidence and integration evidence. If the
Definition of Done requires production acceptance/deployment evidence, keep
the task open until that evidence exists. A safe partial checkpoint is
integrated progress, never task completion.

The deterministic decision kernel and its required regression scenarios are
in `../tools/lifecycle_policy.py` and
`autonomous-completion-scenarios.json`.
