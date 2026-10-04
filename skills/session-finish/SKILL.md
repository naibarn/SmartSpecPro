---
name: session-finish
description: Safely finalize one parallel Codex implementation session without exhausting a shared development host. Preserve and reconcile the task, choose a resource-aware verification lane from the session-unique delta, run only scoped low-cost checks in implementation sessions, defer expensive repository-wide verification when appropriate, create a durable remote readiness marker, push only the session branch, and hand off to the Integration Controller. Use when the user asks to finish, finalize, close, hand off, or prepare the current implementation session for integration.
---

# Session Finish — Resource-Aware Parallel Development

Finalize only the current implementation session/worktree. Do not merge or push directly to `main`.

## Core principles

1. **Implementation sessions verify their own delta; they do not health-check the entire repository.**
2. **Do not run resource-heavy global checks by default while parallel sessions may be active.** A full-repo typecheck/build/test/E2E can consume enough RAM/CPU to stall or kill unrelated long-running sessions.
3. **Small low-risk changes must not wait for unrelated sessions to finish.** They may become integration-ready using scoped evidence.
4. **Heavy verification is a separate serialized lifecycle.** High-risk changes may finish their implementation session as `READY_FOR_HEAVY_VERIFICATION` and let the Integration Controller or external CI perform the expensive gate later.
5. A failure already present on the exact `origin/main` baseline is not automatically a regression from this task.

Read `references/verification-policy.md` before final verification.

## Hard invariants

- One implementation session should map to one task/Spec, one worktree, and one dedicated session branch.
- Never push or merge directly into `main` from this Skill.
- Never reset, clean, prune, remove, or overwrite another session's worktree.
- Never use force-push, `git reset --hard`, `git clean -fd[x]`, `git worktree remove/prune`, or `git stash drop/clear` as a shortcut.
- Valuable source/spec/test/config changes must not remain only as uncommitted/untracked files when declaring readiness.
- Reconcile with the latest `origin/main` before final scoped verification.
- A readiness marker is a **terminal state for that session branch**. After a branch is marked ready, do not continue implementation on it; open a new session branch for follow-up work. Re-running `session-finish` without new changes must be idempotent and reuse the existing marker.
- Do not run a full-repository typecheck, full build, full test suite, browser E2E, or other known high-memory command merely because it exists in `AGENTS.md` as a general development recommendation. Only run it in-session when repository policy explicitly requires it for this change **and** it is safe under the resource policy; otherwise mark it deferred for the Integration Controller/CI.
- Explicit repository safety rules still take precedence. If policy says a named gate must PASS before any integration and offers no deferred path, use `READY_FOR_HEAVY_VERIFICATION` rather than pretending the gate passed.

## Workflow

### 1. Establish identity and preflight

Run bundled `scripts/session-preflight.sh` when shell access is available.

Determine:

- repository root and current worktree;
- task/Spec;
- branch or detached HEAD;
- current HEAD and `origin/main`;
- modified/deleted/untracked files;
- session-unique changed paths;
- affected product surfaces.

Do not absorb unrelated changes from another active session.

### 2. Fetch latest main

```bash
git fetch origin
```

If `origin/main` is unavailable or repository identity is ambiguous, stop `SESSION_BLOCKED`.

### 3. Classify local changes

Classify every visible local change as:

- task source/spec/test/config to preserve;
- intentional local-only change;
- generated/cache/build/temp output;
- secret/credential/environment material that must not be committed;
- unrelated/ambiguous change requiring review.

Do not ignore `??` files.

### 4. Ensure dedicated branch

If detached or on a shared branch, create/reuse a task-specific branch such as:

```text
codex/spec-<id>-<slug>
codex/fix-<slug>
codex/task-<slug>
```

Never use `main` or `master` as the session branch.

### 5. Make task work durable

Stage only intended task files and commit them. Exclude secrets, caches, generated output, and unrelated files.

Valuable task changes must no longer exist only in the working tree before main reconciliation.

### 6. Reconcile latest `origin/main`

Fetch again and merge latest main into the session branch only when needed:

```bash
git fetch origin
git merge origin/main
```

Resolve semantically. Preserve newer verified main behavior and current task intent. Never blanket-select `ours`/`theirs`.

Record the exact resulting `origin/main` SHA as `VERIFIED_BASELINE_SHA`.

If the task is already patch/behavior-equivalent in main, verify no unique valuable local delta remains and report `ALREADY_IN_MAIN`.

### 7. Compute session-unique scope

After reconciliation, determine changed paths unique to the session relative to the verified baseline:

```bash
git diff --name-status "$VERIFIED_BASELINE_SHA..HEAD"
```

Do not classify risk from the entire worktree or files inherited from main.

### 8. Select a verification lane

Choose exactly one lane using `references/verification-policy.md`.

#### FAST lane

For presentation-only UI, copy, styling, localization, documentation, assets, or similarly low-risk isolated changes.

Default evidence:

- `git diff --check`;
- direct source review of changed paths;
- a cheap targeted syntax/lint/component/unit check if an existing scoped command is available and does not trigger a full workspace graph;
- no full-repo typecheck;
- no full application build merely to validate a small UI edit;
- no browser E2E unless the changed behavior actually requires it.

FAST lane can finish without waiting for other sessions.

#### TARGETED lane

For isolated application logic/API/client behavior where scoped tests exist.

Run only changed-package or directly affected tests/checks. Constrain worker parallelism when the test runner supports it. Do not fan out a monorepo-wide check.

#### HEAVY lane

Use when the change affects shared/global or high-risk surfaces, including dependency/lockfile/build configuration, shared compiler config, schema/migrations, auth/security, billing/credits, deployment, cross-application core contracts, major shared routing/state, or when repository policy explicitly requires a global gate.

**Do not run the heavy global gate in the implementation session by default.**

Instead:

- run all safe scoped checks available;
- record the required expensive checks as deferred;
- finish as `READY_FOR_HEAVY_VERIFICATION`;
- let the Integration Controller/external CI run the heavy gate under serialized resource control.

A HEAVY lane task is not a failed implementation session merely because its global check is deferred.

### 9. Baseline-aware failure attribution

For a scoped check that is required for the selected lane and fails, compare against the exact baseline only when doing so is itself reasonably cheap.

Classify:

- `TASK_REGRESSION` → `SESSION_BLOCKED`;
- `PREEXISTING_BASELINE_FAILURE` → may continue for FAST/TARGETED with explicit evidence;
- `BASELINE_FAILURE_TOUCHED_BY_TASK` → `SESSION_BLOCKED` or `NEEDS_REVIEW`;
- `ENVIRONMENT_UNAVAILABLE_BOTH` → record honestly; do not invent a pass.

Do **not** create a second full dependency install/build/typecheck merely to prove an unrelated baseline failure during a low-risk session. That defeats the resource-safety goal. If attribution itself would be expensive, defer it with the heavy gate.

### 10. Resource-safety rule

During `session-finish`, never intentionally run a command known to be capable of exhausting the shared host unless all of the following are true:

- the command is required for this change;
- no safe targeted equivalent exists;
- repository policy forbids deferral;
- the user explicitly requested the heavy check in this session or the environment is known to be isolated/dedicated.

Otherwise record the command in `Codex-Deferred-Checks` and hand it to the Integration Controller/CI.

### 11. Require positive task-local evidence

Every session needs positive evidence appropriate to its delta. Examples:

- FAST: diff hygiene + targeted source/static/component validation;
- TARGETED: directly affected unit/integration checks;
- HEAVY_PENDING: safe scoped checks plus an explicit list of deferred heavy gates.

Do not declare readiness with zero evidence.

### 12. Require clean source state

Before creating a marker:

```bash
git status --porcelain
```

Non-ignored task source/spec/test/config changes must be empty.

### 13. Create durable readiness marker

Run:

```text
<skill-directory>/scripts/create-ready-marker.sh \
  <verified-origin-main-sha> \
  <task-id-or-description> \
  <verification-lane> \
  <verification-scope> \
  <skipped-checks> \
  <baseline-issues> \
  <deferred-heavy-checks>
```

Allowed lanes:

```text
FAST
TARGETED
HEAVY_PENDING
```

Marker outcomes:

- `FAST`/`TARGETED` + no accepted baseline issues → `READY_FOR_INTEGRATION` / `PASS_SCOPED`
- `FAST`/`TARGETED` + accepted baseline issues → `READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES` / `PASS_SCOPED_WITH_BASELINE_ISSUES`
- `HEAVY_PENDING` → `READY_FOR_HEAVY_VERIFICATION` / `SCOPED_PASS_HEAVY_PENDING`

`READY_FOR_HEAVY_VERIFICATION` means implementation is durable and the session may close; it does **not** authorize merge to main until the controller/CI clears the heavy gate.

The marker commit is lifecycle metadata only. It must remain the terminal tip of the closed session branch. Do not add implementation commits after it and do not create stacked READY markers. If follow-up work is needed, create a new session branch.

### 14. Push only the session branch

```bash
git push -u origin <session-branch>
```

Never `git push origin HEAD:main`.

Then run:

```text
<skill-directory>/scripts/verify-remote-branch.sh <session-branch>
```

### 15. Handoff

Report:

- task/Spec;
- worktree;
- branch;
- implementation SHA;
- verified baseline SHA;
- verification lane;
- checks run and outcomes;
- skipped checks;
- deferred heavy checks;
- baseline issues;
- remaining local changes (`NONE` normally);
- remote branch SHA;
- final status.

### 16. Final statuses

Use exactly one:

```text
READY_FOR_INTEGRATION
READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES
READY_FOR_HEAVY_VERIFICATION
ALREADY_IN_MAIN
SESSION_BLOCKED
```

### 17. No cleanup

Do not automatically remove the worktree, branch, or stash. Mark safe cleanup separately.
