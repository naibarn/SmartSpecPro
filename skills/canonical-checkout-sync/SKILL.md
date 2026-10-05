---
name: canonical-checkout-sync
description: Safely prepare a repository's canonical checkout for build/deploy after integration. It preserves local-only commits on verified rescue branches, safely realigns diverged local main to an exact validated target, and certifies the build source without losing work.
---

# Canonical Checkout Sync

Use this Skill **after the required canonical checkpoint(s) are integrated and before build/deploy**. The parent task may still have other partial work in progress; build/deploy must target an explicitly selected integrated main SHA.

Set `CODEX_CANONICAL_CHECKOUT` or pass the checkout path to the command. The skill requires an explicit path so it cannot guess which checkout to recover or certify.

Canonical integrated Git baseline:

`origin/main`

The canonical checkout is a **promotion/build checkout**, not an implementation workspace.

## Primary command

Prefer the bundled top-level orchestrator:

```text
<skill-directory>/scripts/prepare-canonical-checkout.sh [checkout] [validated-sha]
```

Normally the validated SHA is the final main SHA produced by `integration-controller`.

For a build requested for a specific feature/PR, pass its **integrated main commit SHA** as the third argument:

```text
<skill-directory>/scripts/prepare-canonical-checkout.sh <checkout> <validated-main-sha> <integrated-change-sha>
```

Alternatively set `CODEX_REQUIRED_INTEGRATED_SHA`. The required change SHA must be an ancestor of the validated target. The orchestrator checks this before recovering dirty state or moving the local main pointer. If it is absent, it leaves the checkout untouched and reports `CANONICAL_TARGET_MISSING_REQUIRED_CHANGE`; return to `integration-controller` and complete/recover integration rather than building an older main. For squash merges, provide the resulting squash/merge commit SHA reported by the controller, not the pre-merge branch tip.

The orchestrator owns the full safe transition:

```text
DIRTY?
  -> preserve dirty state on verified rescue branch

AHEAD / DIVERGED?
  -> preserve local-only commit history on verified remote rescue branch
  -> safely realign local main pointer to validated target

BEHIND?
  -> fast-forward only

AT TARGET?
  -> no-op

then
  -> verify exact build-source SHA
  -> CANONICAL_CHECKOUT_PREPARED
```

## Lifecycle

```text
implementation sessions
  -> session-finish
  -> integration-controller
  -> validated origin/main SHA
  -> canonical-checkout-sync
       -> preserve dirty/unintegrated local state first
       -> realign/sync canonical main to validated SHA
       -> certify exact build source
  -> build under source lease
  -> deploy/restart
  -> runtime smoke verification
```

## Core invariants

1. Never build from a stale or uncertified checkout.
2. Never discard dirty state or local-only commits merely to make deployment proceed.
3. Dirty/local-only canonical work is **not** automatically merged into `main`.
4. Unique local work must become durable on a verified rescue branch before any cleanup or main-pointer realignment.
5. AHEAD/DIVERGED canonical `main` is recoverable automatically after durable rescue; it is not a user-decision blocker by itself.
6. Realignment may move the **local** `main` pointer to the validated target only after exact local history is remotely preserved and verified.
7. No force push to `origin/main` is allowed.
8. The canonical checkout must be clean and exactly at the validated target before build certification.
9. This Skill never mutates Codex/Claude implementation worktrees.
10. Build/deploy remains a separate lifecycle.
11. When a task-specific integrated SHA is supplied, never certify a target that does not contain it.

## Canonical checkout policy

The canonical checkout must not be used for normal feature/spec implementation.

If an implementation task would modify product source there, create an isolated worktree from latest `origin/main` instead.

Only promotion/recovery/build lifecycle operations may intentionally mutate the canonical checkout.

## Target selection

Prefer:

`CODEX_VALIDATED_MAIN_SHA=<sha>`

or pass the validated SHA as the second argument to `prepare-canonical-checkout.sh`.

For feature-specific build/deploy, also pass `CODEX_REQUIRED_INTEGRATED_SHA=<sha>` or the third positional argument. A plain canonical sync with no required change SHA certifies only the selected `origin/main` source; it does not prove that a requested feature was merged.

If omitted, the script freezes the current `origin/main` SHA at invocation start.

A frozen validated SHA may be behind a subsequently advanced `origin/main` only if it remains in current `origin/main` history.

## Automatic state handling

### SAME

`local main == target`

No pointer movement is needed. Certify the source.

### BEHIND

`local main` is an ancestor of target.

Use fast-forward only.

### DIRTY

Automatically:

1. snapshot exact tracked/untracked state outside the repo;
2. create isolated rescue worktree from the exact current local HEAD;
3. apply dirty state there;
4. commit and push a rescue branch;
5. verify remote rescue SHA;
6. confirm tracked diff, untracked paths, and untracked contents still match the rescued snapshot;
7. only then clean exactly the rescued paths from canonical checkout;
8. continue state classification.

If the checkout changes during rescue, leave it untouched and stop with `CANONICAL_DIRTY_RECOVERY_INCOMPLETE` plus the verified rescue branch/SHA.

Typical branch:

`codex/canonical-dirty-rescue-<timestamp>`

### AHEAD or DIVERGED

Automatically:

1. enumerate local-only commits relative to target;
2. reject automatic remote rescue only if credential-like paths are present in local-only history;
3. create a rescue branch at the exact pre-realignment local HEAD;
4. push and verify that remote rescue points to the exact local HEAD;
5. re-fetch `origin/main` and prove target remains in current main history;
6. require canonical tree still clean and HEAD unchanged;
7. detach at target;
8. atomically move local `refs/heads/main` from the exact old SHA to target using compare-and-swap semantics;
9. reattach `main`;
10. verify branch, HEAD, clean tree, and target ancestry.

Typical branch:

`codex/canonical-history-rescue-<timestamp>-<sha>`

This is a controlled local pointer realignment after durable preservation. It is not a blind reset and does not change remote `origin/main`.

## Sensitive data safety

Credential-like dirty paths or local-only history touching credential-like paths MUST NOT be auto-pushed.

Examples include:

- `.env` and non-template `.env.*` files;
- private keys;
- credential/secret/token JSON;
- `.npmrc`, `.pypirc`, `.netrc`.

Template/example env files are not treated as secrets by path alone.

A sensitive-data result is a true blocker and must report exact paths plus preservation status.

## Build-source certification

After `prepare-canonical-checkout.sh` succeeds, build only under the certified source lease:

```text
<skill-directory>/scripts/run-certified-command.sh <validated-sha> -- <build-command> [args...]
```

This closes the race between source verification and build start.

Invariant:

`BUILD_SOURCE_SHA == VALIDATED_TARGET_SHA`

`CANONICAL_CHECKOUT_PREPARED` means only that the canonical source is safe and, when requested, contains the required integrated change. It does **not** mean a build, deployment, restart, or runtime smoke test happened. Continue those stages when they are part of the user's request, and report each stage's source SHA and outcome separately. Do not call the requested change delivered until the relevant deployed runtime check passes.

## Resource policy

This Skill is lightweight. It MUST NOT run:

- full repository typecheck;
- monorepo build as verification;
- E2E/browser suite;
- full integration suite;
- dependency installation/rebuild.

It owns source-state preservation, canonical alignment, and build-source certification only.

## True blockers

Normal dirty/ahead/diverged state should auto-heal. Stop only for true blockers such as:

- sensitive local files/history that must not be pushed;
- rescue branch push/verification failure;
- target SHA not in current `origin/main` history;
- requested integrated change SHA not in the validated target (route back to integration; do not treat this as a user-owned fix);
- canonical checkout on wrong branch with unresolved local work;
- concurrent mutation/race detected after rescue;
- promotion/build lease already held;
- Git operation failure that leaves state unverified.

## Final success

```text
CANONICAL_CHECKOUT_PREPARED
checkout: <path>
target_sha: <sha>
working_tree: CLEAN
build_source: VERIFIED
next: build using run-certified-command.sh
```

If recovery occurred, also report all rescue branches/SHAs and recovery manifests.

## Blocked reporting contract

Never end with only “cannot sync” or “fix local files first”.

Every blocked report must contain:

```text
STATUS: <exact status>
WHY: <one-line root cause>
AFFECTED: <paths/SHAs/relationship>
PRESERVED: <what is already durable and where>
NEXT_ACTION: <one concrete action>
SAFE_TO_RETRY: <condition>
```
