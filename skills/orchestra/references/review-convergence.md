# Review Convergence Protocol

This protocol prevents Orchestra from stopping after a shallow final review. It makes the
conductor repeat review, impact closure, fixes, and verification until the work converges or
until a clear stop condition is reached.

## Goal

Do not ask the user how many times to re-check. Orchestra owns the review depth.

Convergence means:
- no unresolved CRITICAL, HIGH, or in-scope MEDIUM findings remain
- no safe in-scope `must_do_now` gaps from `gap-closure-before-final.md` remain
- no reviewer reports missing coverage
- all required gates have fresh passing evidence after the last code/doc/skill change
- impact closure found no new required work
- bug/debug fixes have a data-first Evidence Ledger and no unresolved UI-only
  root-cause assumptions
- optional LOW findings are either addressed or explicitly deferred with rationale

## Trigger

Run this protocol before final summary when any of these are true:
- scope is `medium`, `large`, or `project`
- risk is `medium`, `high`, or `critical`
- any sub-agent, review agent, quality gate, or post-completion review returned findings
- the task touched shared contracts, routes, services, schemas, auth/RBAC, tenant isolation,
  public APIs, browser-visible UI, release/deploy files, dependencies, skills, or docs that
  affect runtime behavior

For `trivial` and low-risk `small` work, run at least the normal verification-before-completion
check. Promote to this protocol if verification finds any issue.

## Round Limits

Use these maximums to avoid both under-review and infinite loops:

| Scope / risk | Minimum clean rounds | Maximum rounds |
|---|---:|---:|
| small + low risk | 1 | 2 |
| small + medium risk in standard light mode | 1 | 2 |
| medium or medium risk | 2 | 5 |
| implementation-ready medium in standard light mode | 1 | 3 |
| large, high risk, or broad cross-domain | 2 | 8 |
| project or critical risk | 3 | 10 |

A "clean round" is a review round that finds no new material finding and no missing coverage.
For medium+ work, one clean round is not enough after fixes; require at least two consecutive
clean rounds, except in Codex standard light mode where implementation-ready medium work may
finish after one clean targeted conductor review plus fresh relevant gates.

If `agent-loop-policy.md` is active, also apply its `max_repair_rounds`. The effective
maximum repair/review rounds is the lower of this table and the active loop policy. Stop
with `loop_policy_repair_limit` when the loop policy limit is reached before convergence.

## Material Finding

A material finding is any issue that can affect correctness, security, data integrity,
tenant/user isolation, public API compatibility, deployability, accessibility of a primary
workflow, browser-visible behavior, or required acceptance criteria.

Material findings must be fixed or explicitly blocked before completion. Optional polish and
nice-to-have improvements can be deferred only after all material findings converge.

## Review Round Algorithm

For each round:

1. Build the review input:
   - changed files since the previous round
   - affected downstream files/tests/symbols from impact closure
   - prior findings and their resolution status
   - gates run since the last change
   - residual risks and skipped checks
   - the intended goal of the change and any smaller alternative already considered
   - for bug/debug work: the Evidence Ledger from `data-first-debug.md`, including
     checked trace/log/table/test evidence and any missing evidence still open
2. Run the relevant reviewer set:
   - `reviewer` for code/contract correctness
   - `api-contract-reviewer` for API/client/server/schema drift
   - `tenant-data-isolation-reviewer` for tenant/RBAC/user ownership surfaces
   - security specialists when security triggers apply
   - visual UX, accessibility, responsive, and e2e reviewers for browser-visible UI
   - observability, performance, dependency, CI/release, or i18n reviewers when those
     domains changed
   - require every reviewer report to include an intent/necessity check and real
     call-path trace when code behavior is being reviewed
   - require bug/debug reviewers to reject UI-only root-cause claims unless the bug is
     purely presentational and the affected component/file evidence is sufficient
   In Codex standard light mode, replace reviewer-agent dispatch with a targeted conductor
   review unless the user explicitly authorized agents, the risk is high/critical, or a
   security gate requires specialists.
3. Classify each finding:
   - `MUST_FIX`: CRITICAL, HIGH, or in-scope MEDIUM
   - `MUST_DO_NOW`: safe in-scope gap that directly affects the current goal,
     verification, security/data integrity, runtime debuggability, or contract correctness
   - `VERIFY_ONLY`: no code change needed, but a gate or targeted inspection must prove it
   - `DEFER_OPTIONAL`: LOW or genuinely out-of-scope improvement with rationale
   - `BLOCKED`: requires product decision, external service, destructive action, or accepted
     security risk
4. Fix all `MUST_FIX` and `MUST_DO_NOW` items that are safe and in scope. Dispatch the
   owning sub-agent when a Task/sub-agent tool is available.
5. After every fix, run second-order impact closure:
   - what did this fix touch?
   - what imports, routes, schemas, tests, UI states, docs, migrations, or configs now depend
     on it?
   - which previously passed gates became stale and must be rerun?
6. Rerun stale gates. A gate is stale if any file, contract, or runtime path it covered was
   changed after that gate passed.
   In Codex standard light mode, rerun only stale gates that cover the changed files or
   runtime path; do not expand to a full suite unless risk or user request requires it.
7. Update `orchestra/review-findings.md` with:
   - round number
   - findings discovered
   - fixes applied
   - gates rerun
   - new impact surfaces discovered
   - clean/stale/blocked status

## Stop Rules

Stop and finalize only when all convergence criteria are true:
- required clean-round count reached
- no `MUST_FIX` findings remain
- no safe in-scope `MUST_DO_NOW` gaps remain
- no `VERIFY_ONLY` items lack evidence
- no `BLOCKED` items remain unless they are acceptable optional work
- required gates passed after the last relevant change
- bug/debug fixes have checked data/log/table/test evidence or an explicit `BLOCKED`
  record for missing evidence
- no new impact surfaces were discovered in the latest clean round

Stop and ask the user only when:
- a `BLOCKED` item requires product choice or accepted risk
- a destructive or external side effect is needed and cannot be backed up safely
- max rounds are reached while new material findings are still appearing
- the active `agent-loop-policy.md` iteration, repair, context, dispatch-wave, tool-call,
  or cost-risk limit is reached
- a blocking gate has failed 3 retry attempts

## Final Summary Requirements

The final summary must report:
- number of review rounds run
- why the conductor stopped
- material findings fixed
- optional findings deferred
- gates rerun after the last change
- residual risk, if any
- Loop Policy final ledger: iterations, tool-call batches, estimated cost/proxy,
  dispatch waves, repair rounds, stop conditions met, and final stop reason

Never write "complete", "done", or equivalent wording for medium+ work unless convergence
criteria passed or the remaining items are explicitly blocked/deferred with rationale.
