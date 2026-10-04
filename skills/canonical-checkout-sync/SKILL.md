---
name: canonical-checkout-sync
description: Safely prepare the canonical SmartSpecPro checkout for build/deploy after integration. It synchronizes to a validated main SHA and, when the canonical checkout is dirty, automatically preserves unique local work on a verified rescue branch before cleaning and continuing.
---

# Canonical Checkout Sync

Use this Skill **after repository integration is complete and before build/deploy**.

Its job is not merely to detect a stale/dirty checkout. Its job is to get the canonical checkout into a buildable certified state **without losing local work**.

Default canonical checkout:

`/home/dev/projects/SmartSpecPro`

Canonical integrated Git baseline:

`origin/main`

## Lifecycle

```text
implementation sessions
  -> session-finish
  -> integration-controller
  -> validated origin/main SHA
  -> canonical-checkout-sync
       -> if dirty: preserve/recover automatically
       -> fast-forward to validated SHA
       -> certify build source
  -> build under source lease
  -> deploy/restart
  -> runtime smoke verification
```

## Core invariants

1. Never build from a stale checkout.
2. Never discard dirty canonical work merely to make deployment proceed.
3. Dirty canonical work is **not** automatically merged into `main`.
4. Valuable dirty work is quarantined to a separate rescue branch first.
5. The canonical checkout may be cleaned only after the rescue branch is committed, pushed, and SHA-verified.
6. This Skill never mutates Codex/Claude implementation worktrees.
7. Build/deploy remains a separate lifecycle.

## Inputs

Prefer the validated final SHA reported by `integration-controller`.

- `CODEX_VALIDATED_MAIN_SHA=<sha>` selects the exact validated build target.
- `CODEX_CANONICAL_CHECKOUT=<path>` overrides the canonical checkout.

If no validated SHA is provided, freeze the current `origin/main` SHA for this invocation.

A frozen validated SHA may be older than a subsequently advanced `origin/main` as long as it remains in current main history.

# Procedure

## 1. Preflight

Run:

`scripts/canonical-sync-preflight.sh`

Record:

- canonical path;
- branch;
- local HEAD;
- `origin/main`;
- target SHA;
- ahead/behind relationship;
- dirty state.

### Clean checkout

If preflight returns `CANONICAL_PREFLIGHT_OK`, continue to synchronization.

### Dirty checkout

If preflight returns `CANONICAL_SYNC_BLOCKED_DIRTY`, **do not stop with a vague message**.

Immediately enter Dirty Checkout Recovery below.

## 2. Dirty Checkout Recovery

Run:

`scripts/recover-dirty-canonical.sh <checkout> <target-sha>`

This recovery is deliberately different from blind `reset`, `clean`, or `stash`.

It must:

1. acquire the canonical promotion lock;
2. snapshot `git status`, tracked diff, untracked paths, and recovery metadata outside the repository;
3. create a dedicated rescue branch from the exact current canonical HEAD;
4. reproduce tracked and untracked dirty work in an isolated rescue worktree;
5. commit the rescued state;
6. push the rescue branch to origin;
7. verify remote rescue SHA equals local rescue SHA;
8. verify the tracked diff, untracked path list, and untracked contents still exactly match the rescued snapshot;
9. only then restore the exact tracked dirty paths in the canonical checkout to its current HEAD and remove only the exact untracked files copied into the rescue branch;
10. verify the canonical checkout is clean;
11. return the rescue branch/SHA and continue synchronization.

If any path changes while rescue is being committed or pushed, keep the canonical checkout untouched and return `CANONICAL_DIRTY_RECOVERY_INCOMPLETE` with the already-pushed rescue SHA.

Typical rescue branch:

`codex/canonical-dirty-rescue-<timestamp>`

The rescue branch is **preservation only**. Do not merge it into `main` automatically. It can be reviewed/reconciled later without delaying deployment of the already validated target.

### Sensitive local files

Untracked files that look like runtime credentials/secrets (for example `.env`, private keys, credential/token JSON) MUST NOT be committed or pushed automatically.

If found, recovery must:

- copy them to the recovery directory with restrictive permissions;
- leave the canonical checkout unchanged;
- return `CANONICAL_DIRTY_RECOVERY_BLOCKED_SENSITIVE_LOCAL_FILE`;
- list the exact paths and exact next action.

This is a true blocker requiring explicit local-file disposition.

### Recovery statuses

Successful automatic preservation:

`CANONICAL_DIRTY_AUTO_RECOVERED`

True blockers:

- `CANONICAL_DIRTY_RECOVERY_BLOCKED_SENSITIVE_LOCAL_FILE`
- `CANONICAL_DIRTY_RESCUE_FAILED`
- `CANONICAL_DIRTY_RESCUE_PUSH_FAILED`
- `CANONICAL_DIRTY_RECOVERY_INCOMPLETE`

When a blocker occurs, report:

```text
status
exact affected paths
recovery directory
whether any rescue branch was created/pushed
minimum next action
```

Never report only “checkout is dirty; fix it first”.

## 3. Re-run preflight

After `CANONICAL_DIRTY_AUTO_RECOVERED`, rerun:

`scripts/canonical-sync-preflight.sh`

The expected result is `CANONICAL_PREFLIGHT_OK` with `WORKING_TREE=CLEAN`.

If not, stop with the exact blocker returned by preflight.

## 4. Synchronize to the validated target

Run:

`scripts/sync-canonical-main.sh`

Synchronization is fast-forward only.

The script must:

1. fetch `origin/main` again;
2. acquire the canonical promotion lock;
3. require branch `main`;
4. require a clean checkout;
5. validate the target;
6. require local HEAD to be an ancestor of target;
7. execute only `git merge --ff-only <TARGET_SHA>`;
8. verify `HEAD == TARGET_SHA`;
9. fetch again and verify the target remains in current `origin/main` history.

Never rewind automatically.

## 5. Build-source certification

Success status:

`CANONICAL_CHECKOUT_READY`

Before build, verify:

`scripts/verify-build-source.sh <checkout> <target-sha>`

When another automation could move the canonical checkout concurrently, run the actual build under the same promotion lease:

```text
scripts/run-certified-command.sh <target-sha> -- <build-command> [args...]
```

This closes the verify-to-build race.

Invariant:

`BUILD_SOURCE_SHA == VALIDATED_TARGET_SHA`

## 6. Resource policy

This Skill is lightweight. It MUST NOT run:

- full repository typecheck;
- monorepo build as verification;
- E2E/browser suite;
- full integration suite;
- dependency installation/rebuild.

Its responsibility is source-state preservation and checkout certification only.

# Actionable final reports

## Normal success

```text
CANONICAL_CHECKOUT_READY
checkout: <path>
target_sha: <sha>
local_head: <sha>
origin_main_observed: <sha>
working_tree: CLEAN
sync: FAST_FORWARD_ONLY_TO_TARGET
build_guard: REQUIRED
```

## Success after dirty recovery

```text
CANONICAL_CHECKOUT_READY
recovery: AUTO_RESCUED
rescue_branch: <branch>
rescue_sha: <sha>
recovery_dir: <path>
checkout: <canonical path>
target_sha: <sha>
working_tree: CLEAN
next: build using run-certified-command.sh
```

## Blocked

A blocked report MUST always contain:

```text
STATUS: <exact status>
WHY: <one-line root cause>
AFFECTED: <exact paths or SHA relationship>
PRESERVED: <what has already been backed up/pushed>
NEXT_ACTION: <one concrete action>
SAFE_TO_RETRY: yes/no and condition
```

Do not end with generic phrases such as “จัดการไฟล์ค้างอย่างปลอดภัยก่อน”.
