---
name: integration-controller
description: Serialize promotion of completed parallel Codex branches into origin/main without starving a shared development host. Discover remote session branches, distinguish fast/targeted-ready work from heavy-verification-pending work, merge low-risk candidates with scoped checks, queue high-risk candidates for a serialized resource-controlled heavy gate or external CI, protect active worktrees, and advance main only through safe non-force promotion. Use when the user asks to integrate, merge ready sessions, reconcile completed Codex branches, or run the integration controller.
---

# Integration Controller — Resource-Aware Multi-Session Promotion

This is the serialized gate that may advance `origin/main`.

## Core principles

1. **Do not make every branch pay for a full repository health check.**
2. **Do not run a high-memory global verifier after every merge.** That defeats parallel development and can stall unrelated long-running sessions.
3. **Use lanes:** FAST/TARGETED branches may promote with scoped evidence; HEAVY_PENDING branches require a dedicated serialized heavy gate before main.
4. **Heavy verification must run one-at-a-time and preferably outside the shared implementation host** (CI/dedicated runner first, quiet local slot second).
5. A heavy-pending branch must not block the controller from integrating unrelated FAST/TARGETED branches.

Read `references/integration-verification.md` before promotion decisions.

## Invariants

- Implementation sessions do not advance `origin/main`.
- Never force-push or bypass branch protection/required PR policy.
- Never reset/clean/remove another session's worktree.
- Branch name alone is not readiness evidence.
- Automatic integration requires a valid remote marker from `session-finish`: exactly one terminal marker, marker parent equals implementation tip, verified baseline is an ancestor of the implementation tip, and the verified baseline remains in current `origin/main` history.
- Deployment and cleanup are separate lifecycles.
- Full-repo typecheck/build/test/E2E is never run merely as a routine after each candidate.

## Workflow

### 1. Establish canonical state

```bash
git fetch --all --prune
```

Run bundled `scripts/discover-candidates.sh`. It validates marker structure, baseline ancestry, whether the implementation is already in current main, and whether the corresponding local session worktree is still clean/dirty.

Record initial `origin/main`, candidate branches, active/dirty worktrees, and stashes. Any candidate with `marker_valid != yes`, `baseline_relation = NOT_IN_CURRENT_MAIN_HISTORY`, or `worktree_state = DIRTY` must not be auto-promoted.

### 2. Classify candidates

Use statuses:

```text
READY_FOR_INTEGRATION
READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES
READY_FOR_HEAVY_VERIFICATION
ALREADY_IN_MAIN
ACTIVE_OR_DIRTY
NEEDS_REVIEW
OBSOLETE_OR_SUPERSEDED
BLOCKED
```

A `READY_FOR_HEAVY_VERIFICATION` branch is a finished implementation session waiting only for a resource-heavy/global gate. It must not be treated as failed or force its original session to remain open.

### 3. Protect active/dirty work

If an associated session-branch worktree is `DIRTY`, do not mutate or auto-promote it. Classify `ACTIVE_OR_DIRTY` and require that session to finish/reconcile its local changes first. A remote READY marker does not authorize ignoring newer uncommitted work in the same session worktree.

### 4. Re-evaluate risk and overlap

Before integrating any branch:

- inspect its changed paths relative to current main;
- if `implementation_in_main = yes`, classify `ALREADY_IN_MAIN` instead of integrating again; if its associated worktree is also dirty, preserve that separately as `ALREADY_IN_MAIN_WITH_DIRTY_FOLLOWUP` and do not clean it;
- detect overlap with branches already promoted in this controller run;
- promote FAST to TARGETED or HEAVY if shared/global files make it riskier than its marker claimed;
- different Spec numbers do not imply independence.

### 5. FAST/TARGETED promotion lane

For `READY_FOR_INTEGRATION` or accepted baseline-aware candidates:

1. fetch latest main;
2. integrate only the implementation ref, not the empty marker commit;
3. run scoped checks appropriate to the branch delta;
4. do not run a full-repo typecheck/build/test suite by default;
5. protect against main moving immediately before push;
6. advance main via normal non-force authorized path;
7. continue to the next branch.

A small UI change should therefore be able to reach main while other sessions continue working for hours, provided its scoped verification passes and it does not touch high-risk shared surfaces.

### 6. HEAVY verification lane

For `READY_FOR_HEAVY_VERIFICATION` or a branch escalated to HEAVY:

1. keep the branch queued;
2. continue integrating unrelated FAST/TARGETED candidates;
3. prefer an external/dedicated CI or verification runner;
4. if using the shared host, run heavy verification only through `scripts/heavy-resource-gate.sh` and only when the operator/policy explicitly allows local heavy checks;
5. only one heavy verifier may hold the shared Git-common-dir lock at a time;
6. if the resource gate refuses because memory is low or local heavy checks are disabled, leave the branch `HEAVY_VERIFICATION_PENDING` and continue other work;
7. after the heavy gate passes, rebase/reconcile with latest main if needed, re-run the required critical subset, then promote.

Do not wait for all implementation sessions to finish before processing the heavy queue. Heavy gates are serialized by resource availability, not by global session completion.

### 7. Resource gate

Use:

```text
<skill-directory>/scripts/heavy-resource-gate.sh check
```

Local heavy execution is disabled by default on a shared host unless:

```text
CODEX_ALLOW_SHARED_HEAVY_CHECKS=1
```

is explicitly set in the controller environment or equivalent repository policy authorizes it.

The script also enforces a single heavy verifier lock and a configurable minimum available memory:

```text
CODEX_HEAVY_MIN_AVAILABLE_MB
```

Default is conservative and may be overridden for the host.

To run a heavy command under the lease:

```text
<skill-directory>/scripts/heavy-resource-gate.sh run -- <command> [args...]
```

If refused, do not bypass it with an unguarded heavy command.

### 8. Baseline-aware checks

For FAST/TARGETED branches, baseline attribution may allow unrelated pre-existing failures. Do not reproduce an expensive global failure twice merely to prove it is baseline-broken; defer that global evidence if needed.

For HEAVY branches, the heavy gate is authoritative before promotion.

### 9. No global cumulative check after every branch

Maintain an affected-surface inventory across the controller run, but do not run full global verification repeatedly.

Use:

- scoped checks per FAST/TARGETED branch;
- one heavy gate only for branches/surfaces that actually require it;
- optional periodic repository-health verification on CI/quiet windows, separate from ordinary session promotion.

### 10. Main race protection

Immediately before advancing main:

```text
<skill-directory>/scripts/verify-main-baseline.sh <expected-origin-main-sha>
```

If it fails, do not force push. Fetch/reconcile/reverify the affected scope.

### 11. Canonical checkout

Inspect the runtime checkout separately. If dirty, do not reset or clean it. If proven safe, fast-forward only after fresh fetch.

### 12. No cleanup

Do not delete branches/worktrees/stashes. Mark only `SAFE_TO_CLEANUP`, `KEEP_ACTIVE`, `KEEP_FOR_EVIDENCE`, or `NEEDS_REVIEW`.

### 13. Final report

Report:

- initial/final `origin/main`;
- FAST/TARGETED candidates integrated;
- HEAVY candidates passed;
- HEAVY candidates still pending and why;
- resource-gate status;
- task-local verification;
- baseline issues;
- blocked/skipped candidates;
- canonical checkout status.

Valid final outcomes include:

```text
INTEGRATION_CONTROLLER_COMPLETE
INTEGRATION_CONTROLLER_COMPLETE_WITH_HEAVY_PENDING
INTEGRATION_CONTROLLER_COMPLETE_WITH_BASELINE_ISSUES
INTEGRATION_CONTROLLER_BLOCKED
```

Never claim global repository health unless a dedicated global verification actually ran and passed.
