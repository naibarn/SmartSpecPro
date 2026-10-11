# Progressive execution audit and test design

Task: inspect and repair all-SPEC trunk-based progressive integration and
unattended continuation. No new SPEC, scheduler, lifecycle ledger or control
plane is introduced. Repository policy selects the canonical ref.

Baseline: fetched `origin/main`, `6eec72ce9604af6023c95ba6dd737761928a0bc3`.
Implementation workspace: `/home/dev/worktrees/orchestra-progressive-completion-20261011`.
Primary checkout contains unrelated dirty lifecycle/API work and is preserved.

## Requirement coverage

| Requirement | Existing mechanism and evidence | Repair in this slice |
|---|---|---|
| 1. Fresh baseline | `canonical_source.py preflight`; deep-plan/deep-implement setup adapters | Next worker re-fetches configured ref and gets a new exact-SHA clean worktree |
| 2. Small slices | deep-plan `references/plan-writing.md`; deep-implement Step 11.5 | Recover missing planning/sections arguments from active task instead of requiring another invocation |
| 3. Required checks/authority | protected normal GitHub merge, expected-head guard, lifecycle readiness policy | Remove conflicting AGENTS/verification statements that implied the fast gate waived required CI |
| 4. Record SHA/continue | reachable-SHA verification and shared `next_ready_workunit` | Executable worker dispatch after durable receipt, in the same invocation |
| 5. Freshness/change impact | final preflight, impact-analysis guidance, exact-input cache rules | Re-fetch again before next implementation; no unconditional rebase/full build |
| 6. Main regression recovery | shared policy rejects task regression; existing repair/revert path | Preserve merged state separately from worker failure; do not silently repeat integration |
| 7. Incomplete functionality | disabled flag/backward-compatible slice contract | E2E first slice proves flag-off baseline and flag-on preview behavior |
| 8. Concurrency | existing ownership/merge queue contracts | Common-Git-dir nonblocking lock across same-host worktrees, released before worker execution |
| 9. Resource use | focused profiles, incremental/affected checks and exact-input cache contracts | Scoped Python/Git fixture; no local repository typecheck or build |
| 10. OPEN SPEC regression | existing kernel test and canonical writer contracts | Real subprocess/Git fixture: two actual local-remote merges, second implementation and scoped compile, SPEC stays OPEN |
| 11. Metrics | Integration Controller report contract | Executor emits actual delta and branch age when available; unavailable timing/preview remains UNKNOWN; main health stays pending until checked |
| 12. Reuse implementation | shared lifecycle selector, existing promoter/handoff writer | Extend those mechanisms only; worker argv comes from trusted caller, not untrusted plan data |
| 13. Unattended outcome | active conductor owns completion; no background supervisor exists | Remove redundant accepted-design approval, local counter terminal stops and retry-count human handoffs |

## Regression design and execution

`skills/integration-controller/tests/test_progressive_execution.py` uses a bare
Git remote, real commits, worktrees, merges, normal pushes and subprocess worker
execution. Its GitHub CLI adapter is synthetic and does not establish live
GitHub/production acceptance. The configured branch is `trunk`, not `main`,
and no SPEC number is used.

RED: running the new E2E case against the baseline promoter failed with exit 2
because continuation arguments were unsupported. Evidence:
`/tmp/orchestra-progressive-red-20261011.log`.

GREEN: Integration Controller suite passes 14 tests. The E2E worker implements
the second WorkUnit, compiles both slices, opens its own normal promotion,
and merges it while the first promotion lock is released. Both merge SHAs are
proven reachable from the local remote and the SPEC remains OPEN.
Negative tests cover security failure, unverified/queued merge, stale dependency
evidence, cross-worktree lock contention and failed-worker receipt recovery.

Cross-skill alignment passes 7 tests and Orchestra policy/hygiene passes 18.
The skill structural audit passes; installed mirror drift is explicitly
pending publication from integrated canonical history. Required GitHub PR
checks and exact-SHA mainline CI remain separate evidence.

## Review and continuation

Planning/TDD design/implementation/scoped verification/debug are complete.
Review found and repaired receipt-path collision, atomic receipt durability,
freshness before worker dispatch, unsupported-host lock handling, and remaining
contradictory approval/retry instructions. Final verification, protected
GitHub promotion, installed publication and post-integration checks are next.
The registered primary workspace may remain convergence-pending without
blocking scoped implementation or triggering redundant implementation loops.

Integration receipts are supporting evidence for the existing canonical
handoff writer, not a competing status store. External worker commands require
explicit trusted argv and an available authorized runtime. Inline conductor
execution is the default. No automatic wake after a terminated host turn is
claimed; host continuation requires its existing registered trigger.
